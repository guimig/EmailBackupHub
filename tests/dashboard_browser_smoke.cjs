'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const out=path.join(root,'artifacts','dashboard-ui');
fs.mkdirSync(out,{recursive:true});

const slugs=[
 'saldo-de-empenhos-a-liquidar-mes-a-mes',
 'saldos-de-empenhos-do-exercicio-conta-contabil',
 'despesas-empenhadas-liquidadas-e-pagas-mes-lancamento',
 'restos-a-pagar-rap',
 'recolhimento-proprio-gru',
 'credito-disponivel-mes-lancamento',
 'provisionamentos'
];
const generated='2026-11-17T15:00:00-03:00';
const meta=(value)=>Object.fromEntries(Object.keys(value).map(key=>[key,{status:'ok',source:'totals'}]));
const values={
 'saldos-de-empenhos-do-exercicio-conta-contabil':{empenhado:50000,pago:20000,liquidado_a_pagar:10000},
 'despesas-empenhadas-liquidadas-e-pagas-mes-lancamento':{empenhado:50000,liquidado:30000,pago:20000},
 'restos-a-pagar-rap':{rap_pago:10000,rap_a_pagar:2000},
 'recolhimento-proprio-gru':{gru_arrecadada:2500},
 'credito-disponivel-mes-lancamento':{credito_disponivel:40000},
 'provisionamentos':{provisionado:100000}
};
const dates=['2026-01-01','2026-01-02','2026-07-02','2026-11-16','2026-11-17'];
const summaryDocs=Object.fromEntries(slugs.map(slug=>{
 const metrics=values[slug] || {};
 return [slug,{
  slug, title:slug, date:'17/11/2026',date_iso:'2026-11-17',
  metrics, metrics_meta:meta(metrics),
  metadata:{hash_conteudo:'test-hash'},
  quality:{ok:true,issues:[],warnings:[]},totals:[],row_types:[],columns:[],
  series_data:{series:dates.map((date,index)=>{
   const seriesMetrics=Object.fromEntries(Object.entries(metrics).map(([metric,value])=>[
    metric,Number((value*(.6 + index*.1)).toFixed(2))
   ]));
   return {date:date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4),
    date_iso:date,hash_conteudo:'test-hash',metrics:seriesMetrics,
    metrics_meta:meta(seriesMetrics),metrics_quality:{ok:true}};
  })}
 }];
}));
const index={generated_at:generated,reports:slugs.map(slug=>({
 slug,title:slug,date:'17/11/2026',date_iso:'2026-11-17',
 html_path:slug+'.html',json_path:'data/reports/'+slug+'.json',
 series_path:'data/series/'+slug+'.json',
 metadata:{periodicidade:'diaria',status:'atualizado',idade_dias:0,limite_dias:3},
 quality:{ok:true,issues:[],warnings:[]}
}))};
const summary={generated_at:generated,summary_version:'1',reports:summaryDocs};

const server=http.createServer((req,res)=>{
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}
 catch{res.writeHead(400).end();return;}
 const json={
  '/data/index.json':index,
  '/data/dashboard-summary.json':summary,
  '/data/report-definitions.json':{reports:{}},
  '/data/search-index.json':{documents:[]}
 };
 if(Object.hasOwn(json,pathname)){
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(json[pathname]));return;
 }
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
  res.writeHead(404).end('Not found');return;
 }
 let contents=fs.readFileSync(file);
 if(pathname==='/dashboard.html') contents=Buffer.from(contents.toString('utf8').replace('</body>',
  '<script src="/tests/dashboard_smoke_browser.js"></script></body>'));
 const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';
 res.writeHead(200,{'Content-Type':mime+'; charset=utf-8'}).end(contents);
});
function chromeBinary(){
 for(const candidate of [process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium'].filter(Boolean)){
  if(spawnSync(candidate,['--version'],{encoding:'utf8',timeout:4000}).status===0)return candidate;
 }
 throw Error('Chrome/Chromium nao encontrado');
}
async function launch(chrome,url,label,size){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ebh-dashboard-'));
 const screenshot=path.join(out,label+'.png');
 const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--disable-background-networking','--disable-extensions','--hide-scrollbars',
  '--user-data-dir='+profile,'--window-size='+size,'--virtual-time-budget=7000',
  '--screenshot='+screenshot,'--dump-dom',url];
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
  child.stdout.on('data',data=>{stdout+=data.toString('utf8')});
  child.stderr.on('data',data=>{stderr+=data.toString('utf8')});
  child.on('error',reject);
  child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})});
 });
 fs.rmSync(profile,{recursive:true,force:true});
 assert.equal(result.code,0,label+': navegador '+result.stderr.slice(-500));
 const match=result.stdout.match(/data-dashboard-qa="([^"]+)"/);
 assert.ok(match,label+': medicao de dashboard ausente');
 const checks=JSON.parse(decodeURIComponent(match[1]));
 console.log(label+': '+JSON.stringify(checks));
 assert.deepEqual(Object.entries(checks).filter(([,good])=>good!==true).map(([name])=>name),[],label+': falhas');
 assert.ok(fs.statSync(screenshot).size>5000,label+': captura nao criada');
 console.log(label+': '+Object.keys(checks).length+' verificacoes aprovadas');
}
async function main(){
 const chrome=chromeBinary();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+'/dashboard.html';
 try{
  await launch(chrome,url,'desktop','1440,900');
  await launch(chrome,url,'mobile','440,900');
 }finally{await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1});
