import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBRL,daysToQuery,buildUrl,sanitizeDocument,requestPage,collectPhase,collectSnapshot} from './coletar-cgu.mjs';
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
 assert.throws(()=>sanitizeDocument({...item('X'),valor:'NaN'},'18/11/2026',1));
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
