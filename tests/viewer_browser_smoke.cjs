'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'artifacts', 'viewer-ui');
fs.mkdirSync(output, {recursive: true});
const names = [
 'Grupo Despesa','Natureza Despesa','Natureza Despesa (2)',
 'Unidade Orçamentária','Unidade Orçamentária (2)','Fonte Recursos Detalhada',
 'Fonte Recursos Detalhada (2)','PTRES','Métrica / PI',
 'Métrica / PI (2)','Saldo - R$ (Conta Contábil) / NOV/2026'
];
const rows = Array.from({length: 12}, (_, i) => Object.fromEntries([
 ['Grupo Despesa', i < 4 ? 'INVESTIMENTOS' : 'OUTRAS DESPESAS CORRENTES'],
 ['Natureza Despesa',i < 4 ? '449000' : '339000'],
 ['Natureza Despesa (2)','APLICAÇÕES DIRETAS'],
 ['Unidade Orçamentária','26422'],
 ['Unidade Orçamentária (2)','INST.FED.DE EDUC.,CIENC.E TEC.CATARINENSE'],
 ['Fonte Recursos Detalhada','1000000000'],
 ['Fonte Recursos Detalhada (2)','RECURSOS LIVRES DA UNIÃO'],
 ['PTRES',String(231502+i)],
 ['Métrica / PI','PI-ARAQUARI'],
 ['Métrica / PI (2)','Plano interno para o exercício 2026'],
 ['Saldo - R$ (Conta Contábil) / NOV/2026', i % 3 ? '18.930,15' : '0']
]));
const fixture = {
 slug:'credito-disponivel-mes-lancamento',
 title:'Crédito Disponível por Mês de Lançamento',
 date:'17/11/2026',date_iso:'2026-11-17',
 columns:names,rows,
 row_types:rows.map(raw=>({type:'data',raw})).concat(rows.slice(0,6).map(raw=>({type:'total',raw}))),
 totals:[], metrics:{credito_disponivel:93800.8},
 metrics_meta:{credito_disponivel:{status:'ok',source:'totals'}},
 quality:{ok:true,issues:[],warnings:[]},
 metadata:{periodicidade:'diaria',status:'atualizado',idade_dias:0,exercicio:'2026',row_count:12},
 column_schema:names.map(name=>({name,type:name.includes('Saldo')?'money':name==='PTRES'?'identifier':'text'})),
 html_path:'credito-disponivel-mes-lancamento.html'
};
const server = http.createServer((req,res)=>{
 let pathname;
 try { pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname); }
 catch { res.writeHead(400).end();return; }
 if(pathname==='/data/reports/ui-smoke.json'){
  res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(fixture));return;
 }
 if(pathname==='/data/report-definitions.json'){
  res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({reports:{}}));return;
 }
 const filename = path.resolve(root,'.'+pathname);
 if(!filename.startsWith(root+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){
  res.writeHead(404).end('Not found');return;
 }
 let content=fs.readFileSync(filename);
 if(pathname==='/report-viewer.html')
  content=Buffer.from(content.toString('utf8').replace('</body>',
    '<script src="/tests/viewer_smoke_browser.js"></script></body>'));
 const mime=filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'text/html';
 res.writeHead(200,{'Content-Type':mime+'; charset=utf-8'}).end(content);
});
function chromeBinary(){
 for(const name of [process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium'].filter(Boolean)){
  const result=spawnSync(name,['--version'],{timeout:4000,encoding:'utf8'});
  if(result.status===0)return name;
 }
 throw Error('Chrome ou Chromium indisponivel');
}
async function launch(chrome,url,label,size){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ebh-viewer-'));
 const screenshot=path.join(output,label+'.png');
 const args=['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--disable-background-networking','--disable-extensions','--hide-scrollbars',
  '--user-data-dir='+profile,'--window-size='+size,
  '--virtual-time-budget=5000','--screenshot='+screenshot,'--dump-dom',url];
 const {code,stdout,stderr}=await new Promise((resolve,reject)=>{
  const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
  child.stdout.on('data',b=>{stdout+=b.toString('utf8')});
  child.stderr.on('data',b=>{stderr+=b.toString('utf8')});
  child.on('error',reject);
  child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr})});
 });
 fs.rmSync(profile,{recursive:true,force:true});
 assert.equal(code,0, label+': Chrome '+stderr.slice(-600));
 const match=stdout.match(/data-viewer-qa="([^"]+)"/);
 assert.ok(match,label+': medicao nao concluida');
 const checks=JSON.parse(decodeURIComponent(match[1]));
 for(const [name,result] of Object.entries(checks))assert.equal(result,true,label+': '+name);
 assert.ok(fs.statSync(screenshot).size>5000,label+': screenshot ausente');
 console.log(label+': '+Object.keys(checks).length+' verificacoes aprovadas');
}
async function main(){
 const chrome=chromeBinary();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port+
  '/report-viewer.html?report=data/reports/ui-smoke.json';
 try{
  await launch(chrome,url,'desktop','1440,900');
  await launch(chrome,url,'mobile','440,900');
 }finally{await new Promise(resolve=>server.close(resolve));}
}
main().catch(err=>{console.error(err);process.exitCode=1});
