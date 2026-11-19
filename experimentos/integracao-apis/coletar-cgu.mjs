/** Experimento isolado da CGU para UG 158459. Nunca grava dados do Tesouro. */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
export const UG = '158459';
const ENDPOINT = 'https://api.portaldatransparencia.gov.br/api-de-dados/despesas/documentos';
const OUTPUT = new URL('./dados/cgu-ug-158459.json', import.meta.url);
const PHASES = {1:'Empenho',2:'Liquidação',3:'Pagamento'};
export function parseBRL(value) {
  if(typeof value==='number') return Number.isFinite(value)?value:null;
  if(typeof value!=='string'||!value.trim()) return null;
  let s=value.trim().replace(/\s|R\$/g,'');
  const parentheses=/^\(.*\)$/.test(s);
  if(parentheses) s=s.slice(1,-1);
  if(!/^-?[\d.,]+$/.test(s)) return null;
  if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.');
  else if(/^-?\d{1,3}(?:\.\d{3})+$/.test(s)) s=s.replace(/\./g,'');
  const result=Number(s);
  return Number.isFinite(result)?(parentheses?-result:result):null;
}
function integer(value, fallback, maximum) {
  if(value===undefined||value==='') return fallback;
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<1||n>maximum) throw Error('Parâmetro inteiro inválido');
  return n;
}
export function daysToQuery(now=new Date(),lookback=7){
  const count=integer(lookback,7,31);
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'
  }).formatToParts(now).map(p=>[p.type,p.value]));
  const midnight=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day));
  return Array.from({length:count},(_,i)=>{
    const d=new Date(midnight-(count-i)*86400000);
    return [String(d.getUTCDate()).padStart(2,'0'),String(d.getUTCMonth()+1).padStart(2,'0'),d.getUTCFullYear()].join('/');
  });
}
export function buildUrl(date,phase,page) {
  if(!/^\d{2}\/\d{2}\/20\d{2}$/.test(date)||!PHASES[phase]||!Number.isSafeInteger(page)||page<1) throw Error('Consulta inválida');
  return ENDPOINT+'?'+new URLSearchParams({unidadeGestora:UG,dataEmissao:date,fase:String(phase),pagina:String(page)});
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function requestPage(date,phase,page,{token,fetcher=fetch,wait=sleep}={}){
  if(!token||!token.trim()) throw Error('CGU_API_KEY não configurada');
  for(let attempt=0;attempt<3;attempt++){
    const abort=new AbortController();
    const timeout=setTimeout(()=>abort.abort(),22000);
    let response;
    try{
      response=await fetcher(buildUrl(date,phase,page),{signal:abort.signal,headers:{
        Accept:'application/json','chave-api-dados':token
      }});
    }catch{
      if(attempt===2) throw Error('CGU indisponível ou tempo esgotado');
      await wait(500*(attempt+1));
      continue;
    }finally{clearTimeout(timeout);}
    if([429,500,502,503,504].includes(response.status)&&attempt<2){
      await wait(500*(attempt+1)); continue;
    }
    if(!response.ok) throw Error('CGU HTTP '+response.status);
    let body;
    try{body=await response.json();}catch{throw Error('CGU retornou JSON inválido');}
    if(!Array.isArray(body)) throw Error('CGU retornou formato inválido');
    return body;
  }
  throw Error('CGU indisponível');
}
export function sanitizeDocument(row,date,phase){
  if(!row||typeof row!=='object'||Array.isArray(row)) throw Error('Registro inválido');
  const ug=String(row.codigoUg??row.codigoUG??row.unidadeGestora?.codigo??'');
  if(ug!==UG) throw Error('Documento sem UG 158459 comprovada');
  const document=String(row.documento||'').trim();
  const amount=parseBRL(row.valor);
  if(!document) throw Error('CGU: identificador documental ausente');
  if(document.length>96) throw Error('CGU: identificador documental extenso');
  if(amount===null) throw Error('CGU: valor monetário ausente ou inválido (tipo '+(typeof row.valor)+')');
  // Lista fechada de campos: não publicar CPF, CNPJ, nome, observação ou texto livre.
  return {data:date,fase:phase,documento:document,valor:Math.round(amount*100)/100};
}
export async function collectPhase(date,phase,{token,maxPages=5,request=requestPage}={}){
  const limit=integer(maxPages,5,20), seen=new Map();
  let complete=false,pages=0;
  for(let page=1;page<=limit;page++){
    const result=await request(date,phase,page,{token}); pages++;
    if(!Array.isArray(result)) throw Error('Página CGU inválida');
    if(result.length===0){complete=true;break;}
    for(const raw of result){
      const item=sanitizeDocument(raw,date,phase);
      if(seen.has(item.documento)&&seen.get(item.documento).valor!==item.valor) throw Error('Duplicidade divergente');
      seen.set(item.documento,item);
    }
  }
  const documents=[...seen.values()].sort((a,b)=>a.documento.localeCompare(b.documento));
  const sum=documents.reduce((n,x)=>n+Math.round(x.valor*100),0)/100;
  return {data:date,fase:phase,etapa:PHASES[phase],quantidade:documents.length,
    total:complete?sum:null,completo:complete,paginas_consultadas:pages,amostra:documents.slice(0,8)};
}
export async function collectSnapshot({now=new Date(),token,lookback=7,maxPages=5,request=requestPage}={}){
  if(!token||!token.trim()) throw Error('CGU_API_KEY não configurada');
  const dates=daysToQuery(now,lookback),queries=dates.flatMap(date=>[1,2,3].map(fase=>({date,fase})));
  let cursor=0;
  const rows=new Array(queries.length);
  await Promise.all(Array.from({length:2},async()=>{
    while(cursor<queries.length){
      const i=cursor++;
      rows[i]=await collectPhase(queries[i].date,queries[i].fase,{token,maxPages,request});
    }
  }));
  const phases=[1,2,3].map(fase=>{
    const selected=rows.filter(r=>r.fase===fase),complete=selected.every(r=>r.completo);
    return {fase,etapa:PHASES[fase],quantidade:selected.reduce((n,r)=>n+r.quantidade,0),
      total:complete?Math.round(selected.reduce((n,r)=>n+r.total,0)*100)/100:null,completo:complete};
  });
  return {schema_version:1,origem:'CGU - Portal da Transparência',gerado_em:now.toISOString(),
    unidade_gestora:UG,unidade_orcamentaria_referencia:'26422',
    criterio:'Documentos por data de emissão da UG 158459; não são saldos contábeis do Tesouro.',
    data_inicial:dates[0],data_final:dates.at(-1),
    qualidade:{completo:rows.every(r=>r.completo),
      observacao:'Consultas incompletas não produzem totais; zero somente após paginação completa.'},
    fases:phases,dias:rows};
}
async function main(){
  const model=await collectSnapshot({token:process.env.CGU_API_KEY,
    lookback:process.env.CGU_LOOKBACK_DAYS||7,maxPages:process.env.CGU_MAX_PAGES||5});
  if(!model.qualidade.completo) throw Error('CGU com paginação incompleta; publicação bloqueada');
  await writeFile(OUTPUT,JSON.stringify(model,null,2)+'\n','utf8');
  console.log('CGU UG 158459: '+model.dias.length+' consultas completas; sem dados pessoais');
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  main().catch(error=>{console.error(error.message.startsWith('CGU HTTP ')||error.message.startsWith('CGU_API_KEY')?error.message:'Coleta CGU não concluída: '+String(error.message).slice(0,100));process.exitCode=1;});
}
