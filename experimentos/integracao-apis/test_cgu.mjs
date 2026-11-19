import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBRL,daysToQuery,buildUrl,buildImpactedUrl,sanitizeDocument,requestPage,requestImpactedPage,resolveLiquidation,collectPhase,collectSnapshot} from './coletar-cgu.mjs';
const item=(id,value='1.234,56')=>({codigoUg:'158459',documento:id,valor:value,nomeFavorecido:'PRIVADO',codigoFavorecido:'12345678900'});
const pages=items=>async(date,phase,page)=>items[date+'-'+phase+'-'+page]||[];
test('converte valores e rejeita valores inválidos',()=>{
 assert.equal(parseBRL('R$ 1.234,56'),1234.56);
 assert.equal(parseBRL('(10,50)'),-10.5);
 assert.equal(parseBRL(''),null);
 assert.equal(parseBRL('não-numérico'),null);
});
test('respeita calendário paulista e somente dias encerrados',()=>{
 assert.deepEqual(daysToQuery(new Date('2026-11-19T14:00:00Z'),2),['17/11/2026','18/11/2026']);
 assert.throws(()=>daysToQuery(new Date(),33));
});
test('constrói URL sem segredo, UG e parâmetros corretos',()=>{
 const url=new URL(buildUrl('18/11/2026',1,1));
 assert.equal(url.searchParams.get('unidadeGestora'),'158459');
 assert.equal(url.searchParams.get('dataEmissao'),'18/11/2026');
 assert.equal(url.searchParams.get('fase'),'1');
 assert.throws(()=>buildUrl('18-11-2026',1,1));
});
test('normaliza apenas campos públicos estritamente selecionados',()=>{
 const result=sanitizeDocument(item('158459000012026NE000001'),'18/11/2026',1);
 assert.deepEqual(Object.keys(result),['data','fase','documento','valor']);
 assert.equal(JSON.stringify(result).includes('PRIVADO'),false);
 assert.throws(()=>sanitizeDocument({...item('X'),codigoUg:'158125'},'18/11/2026',1));
 assert.equal(sanitizeDocument({...item('X'),valor:'NaN'},'18/11/2026',1).valor,null);
});
test('pagina, deduplica e soma valores sem confundir limite com fim',async()=>{
 const result=await collectPhase('18/11/2026',1,{token:'fake',request:pages({
 '18/11/2026-1-1':[item('A','10,00'),item('B','2,25')],
 '18/11/2026-1-2':[item('B','2,25'),item('C','3,75')]
 })});
 assert.equal(result.quantidade,3);
 assert.equal(result.total,16);
 assert.equal(result.completo,true);
 assert.equal(result.paginas_consultadas,3);
});
test('não publica total de página limitada',async()=>{
 const result=await collectPhase('18/11/2026',1,{token:'fake',maxPages:1,request:pages({'18/11/2026-1-1':[item('A','10,00')]})});
 assert.equal(result.completo,false);
 assert.equal(result.total,null);
});
test('agrega por fase e preserva diferença UG/UO',async()=>{
 const snapshot=await collectSnapshot({now:new Date('2026-11-19T14:00:00Z'),token:'fake',lookback:2,request:pages({
 '17/11/2026-1-1':[item('A','10,00')],
 '18/11/2026-3-1':[item('B','20,00')]
 })});
 assert.equal(snapshot.unidade_gestora,'158459');
 assert.equal(snapshot.unidade_orcamentaria_referencia,'26422');
 assert.equal(snapshot.dias.length,6);
 assert.deepEqual(snapshot.fases.map(x=>x.total),[10,0,20]);
 assert.equal(snapshot.qualidade.completo,true);
 assert.equal(JSON.stringify(snapshot).includes('PRIVADO'),false);
});
test('usa cabeçalho secreto, nunca URL; retorna erro sanitizado',async()=>{
 await assert.rejects(requestPage('18/11/2026',1,1,{token:''}),/CGU_API_KEY/);
 const docs=await requestPage('18/11/2026',1,1,{token:'token-interno',fetcher:async(url,opts)=>{
 assert.equal(url.includes('token-interno'),false);
 assert.equal(opts.headers['chave-api-dados'],'token-interno');
 return {ok:true,status:200,json:async()=>[]};
 }});
 assert.deepEqual(docs,[]);
 await assert.rejects(requestPage('18/11/2026',1,1,{token:'fake',fetcher:async()=>({ok:false,status:401})}),/CGU HTTP 401/);
});

test('valor monetário ilegível não gera zero nem soma parcial, mas mantém contagem documental',async()=>{
 const result=await collectPhase('18/11/2026',1,{token:'fake',request:pages({'18/11/2026-1-1':[item('A','10,00'),item('B','indisponível')]})});
 assert.equal(result.completo,true);
 assert.equal(result.quantidade,2);
 assert.equal(result.valores_invalidos,1);
 assert.equal(result.total,null);
});

test('snapshot parcial mantém contagens mínimas e não divulga total incompleto',async()=>{
 const model=await collectSnapshot({now:new Date('2026-11-19T14:00:00Z'),token:'fake',lookback:1,maxPages:1,request:pages({'18/11/2026-1-1':[item('A','10,00')]})});
 assert.equal(model.qualidade.completo,false);
 assert.equal(model.fases[0].quantidade,1);
 assert.equal(model.fases[0].total,null);
 assert.equal(model.dias[0].completo,false);
});


test('identificador NS SIAFI e fase 2 são exigidos para empenhos impactados',()=>{
  const doc='158459000012026NS000123';
  const url=new URL(buildImpactedUrl(doc,2));
  assert.equal(url.pathname,'/api-de-dados/despesas/empenhos-impactados');
  assert.equal(url.searchParams.get('codigoDocumento'),doc);
  assert.equal(url.searchParams.get('fase'),'2');
  assert.equal(url.searchParams.get('pagina'),'2');
  assert.throws(()=>buildImpactedUrl('2026NS000123',1));
  assert.throws(()=>buildImpactedUrl(doc,0));
});

test('consulta dos empenhos impactados usa token só no cabeçalho',async()=>{
  const doc='158459000012026NS000123';
  const data=await requestImpactedPage(doc,1,{token:'CHAVE-INTERNA',
    fetcher:async(url,options)=>{
      assert.equal(url.includes('CHAVE-INTERNA'),false);
      assert.equal(options.headers['chave-api-dados'],'CHAVE-INTERNA');
      return {ok:true,status:200,json:async()=>[]};
    }});
  assert.deepEqual(data,[]);
});

test('liquidação soma valores dos empenhos impactados incluindo estorno',async()=>{
  const doc='158459000012026NS000123';
  const impact=async(_,page)=>page===1?[
    {empenho:'NE1',subitem:'01',valorLiquidado:'R$ 1.234,56',nomeFavorecido:'SIGILOSO'},
    {empenho:'NE1',subitem:'02',valorLiquidado:'-34,56'}
  ]:page===2?[{empenho:'NE2',subitem:'01',valorLiquidado:'0,00'}]:[];
  const result=await resolveLiquidation(doc,{token:'fake',request:impact});
  assert.equal(result.valor,1200);
  assert.equal(result.situacao,'recuperado');
  assert.equal(result.paginas,3);
  const phase=await collectPhase('18/11/2026',2,{token:'fake',
    request:pages({'18/11/2026-2-1':[{...item(doc),valor:null}]}),
    requestImpact:impact});
  assert.equal(phase.completo,true);
  assert.equal(phase.total,1200);
  assert.equal(phase.valores_recuperados_impactos,1);
  assert.equal(phase.valores_invalidos,0);
  assert.equal(JSON.stringify(phase).includes('SIGILOSO'),false);
  assert.deepEqual(Object.keys(phase.amostra[0]),['data','fase','documento','valor']);
});

test('sem empenhos impactados não implica liquidação monetária zero',async()=>{
  const result=await resolveLiquidation('158459000012026NS000123',{token:'fake',request:async()=>[]});
  assert.equal(result.valor,null);
  assert.equal(result.situacao,'sem_impactos');
});

test('valores impactados nulos, páginas repetidas e limites são não-conciliáveis',async()=>{
  const doc='158459000012026NS000123';
  const missing=await resolveLiquidation(doc,{token:'fake',request:async()=>[
    {empenho:'NE1',subitem:'01',valorLiquidado:null}]});
  assert.equal(missing.situacao,'valor_impactado_invalido');
  assert.equal(missing.valor,null);
  const repeating=await resolveLiquidation(doc,{token:'fake',request:async()=>[
    {empenho:'NE1',subitem:'01',valorLiquidado:'10,00'}]});
  assert.equal(repeating.situacao,'pagina_repetida');
  assert.equal(repeating.valor,null);
  const limited=await resolveLiquidation(doc,{token:'fake',maxImpactPages:1,request:async()=>[
    {empenho:'NE1',subitem:'01',valorLiquidado:'10,00'}]});
  assert.equal(limited.situacao,'limite_impactos');
  assert.equal(limited.valor,null);
});

test('falha na API impactados mantém contagem mas não inventa liquidação',async()=>{
  const doc='158459000012026NS000123';
  const result=await collectPhase('18/11/2026',2,{token:'fake',
    request:pages({'18/11/2026-2-1':[{...item(doc),valor:null}]}),
    requestImpact:async()=>{throw Error('falha remota');}});
  assert.equal(result.quantidade,1);
  assert.equal(result.total,null);
  assert.equal(result.valores_invalidos,1);
  assert.equal(result.consultas_impactos_sem_valor,1);
});

test('pagamentos atravessam mais de cinco páginas, sem corte artificial',async()=>{
  const data={};
  for(let page=1;page<=9;page++){
    data['17/11/2026-3-'+page]=[
      item('158459000012026OB'+String(page).padStart(6,'0'),String(page)+',00')];
  }
  const result=await collectPhase('17/11/2026',3,{token:'fake',maxPages:30,request:pages(data)});
  assert.equal(result.completo,true);
  assert.equal(result.paginas_consultadas,10);
  assert.equal(result.quantidade,9);
  assert.equal(result.total,45);
});

test('página repetida jamais encerra uma paginação como completa',async()=>{
  const result=await collectPhase('17/11/2026',3,{token:'fake',
    request:async()=>[item('158459000012026OB000001','10,00')]});
  assert.equal(result.completo,false);
  assert.equal(result.motivo_parcial,'pagina_repetida');
  assert.equal(result.total,null);
});

test('agregado de liquidações recuperadas não mistura UG 158459 e UO 26422',async()=>{
  const ns='158459000012026NS000123';
  const snapshot=await collectSnapshot({now:new Date('2026-11-19T14:00:00Z'),
    token:'fake',lookback:1,request:pages({'18/11/2026-2-1':[{...item(ns),valor:null}]}),
    requestImpact:async(_,page)=>page===1?[
      {empenho:'158459000012026NE000123',subitem:'01',valorLiquidado:'45,00'}
    ]:[]});
  assert.equal(snapshot.fases.find(f=>f.fase===2).total,45);
  assert.equal(snapshot.fases.find(f=>f.fase===2).valores_recuperados_impactos,1);
  assert.equal(snapshot.qualidade.valores_invalidos,0);
});
