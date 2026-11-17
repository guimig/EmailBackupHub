'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Charts=require('../assets/js/report-chart-explorer.js');
const Filters=require('../assets/js/report-viewer-filters.js');
const root=path.resolve(__dirname,'..');
function file(name){return JSON.parse(fs.readFileSync(path.join(root,'data','reports',name+'.json'),'utf8'));}
const rap=file('restos-a-pagar-rap');
const gru=file('recolhimento-proprio-gru');
const credit=file('credito-disponivel-mes-lancamento');
const saldo=file('saldo-de-empenhos-a-liquidar-mes-a-mes');
const expense=file('despesas-empenhadas-liquidadas-e-pagas-mes-lancamento');
const docs=report=>report.rows.map(raw=>({type:'data',raw}));

test('GRU 2026: suggests emission-month line using net movements, not extraction date',()=>{
  const suggestion=Charts.suggest(gru,docs(gru),Filters);
  assert.equal(suggestion.mode,'sum');
  assert.equal(suggestion.type,'line');
  assert.equal(suggestion.dimension,'Emissão - Mês');
  assert.match(suggestion.measure,/Movim\. Líquido/);
  const result=Charts.build(gru,docs(gru),suggestion,Filters);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.points.length,11);
  assert.deepEqual(result.points.map(item=>item.key).slice(0,2),['JAN/2026','FEV/2026']);
  assert.deepEqual(result.points.map(item=>item.key).slice(-1),['NOV/2026']);
  const cents=result.points.reduce((sum,item)=>sum+Math.round(item.value*100),0);
  assert.equal(cents,Math.round(gru.metrics.gru_arrecadada*100));
  assert.match(result.warning,/Movimentações agrupadas/);
});

test('GRU: code-like columns and type number are not financial measures',()=>{
  assert.equal(Charts.typeFor(gru,'Cód. Recolhimento GRU',Filters),'identifier');
  const measures=Charts.numericColumns(gru,Filters);
  assert.ok(!measures.includes('Cód. Recolhimento GRU'));
  assert.ok(measures.some(name=>name.includes('Movim. Líquido')));
});

test('saldo por competencia: automatically offers a single-empenho series, preserving 013 and 014',()=>{
  const suggestion=Charts.suggest(saldo,docs(saldo),Filters);
  assert.equal(suggestion.mode,'wide');
  assert.equal(suggestion.type,'bar');
  const cols=Charts.wideColumns(saldo,Filters);
  assert.equal(cols.length,14);
  assert.deepEqual(cols.map(item=>item.label).slice(-2),['013/2025','014/2025']);
  const plotted=Charts.build(saldo,docs(saldo),suggestion,Filters);
  assert.equal(plotted.ok,true,plotted.reason);
  assert.ok(plotted.points.some(item=>item.label==='013/2025'));
  assert.match(plotted.warning,/013\/014/);
  const invalid=Charts.build(saldo,docs(saldo),{...suggestion,type:'line'},Filters);
  assert.equal(invalid.ok,false);
  assert.match(invalid.reason,/013\/014/);
});

test('RAP and expense: default shows auditable record values without summing by nature',()=>{
  for(const report of [rap,expense]){
    const suggestion=Charts.suggest(report,docs(report),Filters);
    assert.equal(suggestion.mode,'records');
    assert.equal(suggestion.type,'bar');
    const result=Charts.build(report,docs(report),suggestion,Filters);
    assert.equal(result.ok,true,result.reason);
    assert.ok(result.points.length>5);
    assert.ok(result.points.length<=15);
    assert.match(result.description,/Uma barra por registro/);
    assert.equal(result.points.every(point=>Number.isInteger(point.rowIndex)),true);
  }
});

test('credit available: no false month series from month in metric header and no sum',()=>{
  const suggestion=Charts.suggest(credit,docs(credit),Filters);
  assert.equal(suggestion.mode,'records');
  assert.equal(suggestion.type,'bar');
  const result=Charts.build(credit,docs(credit),suggestion,Filters);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.points.length,7);
  assert.ok(!result.points.some(point=>/NOV\/2026$/.test(point.label)));
});

test('count-by-category, pie, group click IDs and report filter in original ordering',()=>{
  const simple={slug:'future',columns:['Setor','Valor'],column_schema:[
    {name:'Setor',type:'category'},{name:'Valor',type:'money'}],
    rows:[{Setor:'A',Valor:'10,00'},{Setor:'B',Valor:'20,00'},{Setor:'A',Valor:'30,00'}]};
  const opts={mode:'count',type:'pie',dimension:'Setor',measure:'',limit:15};
  const result=Charts.build(simple,docs(simple),opts,Filters);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.points.find(p=>p.key==='A').value,2);
  assert.equal(result.points.find(p=>p.key==='B').value,1);
  assert.equal(result.points.reduce((sum,p)=>sum+p.value,0),3);
  assert.equal(result.unit,'count');
  // The actual UI creates a typed column filter on activation.
  const meta=Filters.columnMeta(simple,'Setor');
  const predicate={op:'in',values:['A']};
  assert.equal(Filters.validFilter(predicate,meta),true);
  assert.equal(Filters.matches('B',predicate,meta),false);
});

test('sums require explicit mode and do not count totals or invalid amounts',()=>{
  const future={slug:'future',columns:['Classe','Saldo'],column_schema:[
    {name:'Classe',type:'category'},{name:'Saldo',type:'money'}],
    rows:[{Classe:'A',Saldo:'1.100,00'},{Classe:'A',Saldo:'(200,00)'},
      {Classe:'A',Saldo:''},{Classe:'B',Saldo:'0,00'}]};
  const selected=docs(future).concat([{type:'total',raw:{Classe:'TOTAL',Saldo:'900,00'}}]);
  const count=Charts.build(future,selected,{mode:'count',type:'bar',dimension:'Classe',limit:15},Filters);
  assert.equal(count.ok,true);
  assert.equal(count.points.reduce((sum,p)=>sum+p.value,0),4);
  const result=Charts.build(future,selected,{mode:'sum',type:'bar',dimension:'Classe',measure:'Saldo',limit:15},Filters);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.points.find(p=>p.key==='A').value,900);
  assert.equal(result.points.find(p=>p.key==='B').value,0);
  assert.equal(result.omitted,1);
  assert.match(result.warning,/configurada pelo usuário/);
  const unsafePie=Charts.build(future,selected,{mode:'sum',type:'pie',dimension:'Classe',measure:'Saldo',limit:15},Filters);
  assert.equal(unsafePie.ok,true,'all groups net nonnegative; pie allowed only when all shares positive');
});

test('pie refuses negatives, high cardinality, and individual record amounts',()=>{
  const m={columns:['Classe','Valor'],column_schema:[
    {name:'Classe',type:'category'},{name:'Valor',type:'money'}],
    rows:[{Classe:'A',Valor:'30'},{Classe:'B',Valor:'(50)'}]};
  const rows=docs(m);
  const neg=Charts.build(m,rows,{mode:'sum',type:'pie',dimension:'Classe',measure:'Valor'},Filters);
  assert.equal(neg.ok,false);
  assert.match(neg.reason,/negativos/);
  assert.equal(Charts.build(m,rows,{mode:'records',type:'pie',dimension:'Classe',measure:'Valor'},Filters).ok,false);
  const large={...m,rows:Array.from({length:21},(_,i)=>({Classe:'C'+i,Valor:'1'}))};
  const tooMany=Charts.build(large,docs(large),{mode:'count',type:'pie',dimension:'Classe'},Filters);
  assert.equal(tooMany.ok,false);
  assert.match(tooMany.reason,/até 10 categorias/);
});

test('line never invents calendar months from 013/014 or absent dates',()=>{
  const m={columns:['Competência','Saldo'],column_schema:[
    {name:'Competência',type:'period'},{name:'Saldo',type:'money'}],
    rows:[{Competência:'NOV/2025',Saldo:'100'},{Competência:'013/2025',Saldo:'200'}]};
  const settings={mode:'sum',type:'line',dimension:'Competência',measure:'Saldo',limit:15};
  assert.equal(Charts.build(m,docs(m),settings,Filters).ok,false);
  assert.equal(Charts.build(m,docs(m),{...settings,type:'bar'},Filters).ok,true);
  const invalid={...m,rows:[{Competência:'2025-15-01',Saldo:'100'}]};
  assert.equal(Charts.build(invalid,docs(invalid),settings,Filters).ok,false);
});

test('new reports without numeric metrics still have meaningful count charts',()=>{
  const m={slug:'novo',columns:['Tipo','Detalhe'],rows:[{Tipo:'N',Detalhe:'Teste 1'},{Tipo:'S',Detalhe:'Teste 2'},{Tipo:'N',Detalhe:'Teste 3'}],
    column_schema:[{name:'Tipo',type:'category'},{name:'Detalhe',type:'text'}]};
  const suggestion=Charts.suggest(m,docs(m),Filters);
  assert.equal(suggestion.mode,'count');
  assert.equal(suggestion.type,'pie');
  const result=Charts.build(m,docs(m),suggestion,Filters);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.points.length,2);
});

test('rendered charts escape malicious labels and keep record drill-down indices',()=>{
  const m={columns:['Tipo','Valor'],rows:[{Tipo:'<img src=x onerror=alert(1)>',Valor:'1.250,00'}],
    column_schema:[{name:'Tipo',type:'text'},{name:'Valor',type:'money'}]};
  const result=Charts.build(m,docs(m),{mode:'records',type:'bar',dimension:'Tipo',measure:'Valor'},Filters);
  const node={innerHTML:'',querySelectorAll:()=>[]};
  Charts.render(node,result);
  assert.match(node.innerHTML,/&lt;img/);
  assert.doesNotMatch(node.innerHTML,/<img src=x onerror/);
  assert.match(node.innerHTML,/data-record-index="0"/);
  const grouped=Charts.build(m,docs(m),{mode:'count',type:'pie',dimension:'Tipo'},Filters);
  Charts.render(node,grouped);
  assert.match(node.innerHTML,/data-smart-chart-index/);
  assert.doesNotMatch(node.innerHTML,/<img src=x onerror/);
});

test('3,254 rows remain bounded to 15 visual elements',()=>{
  const r={columns:['ID','Saldo'],column_schema:[{name:'ID',type:'identifier'},{name:'Saldo',type:'money'}],
    rows:Array.from({length:3254},(_,i)=>({ID:'NE'+i,Saldo:(i%10)+',00'}))};
  const start=performance.now();
  const result=Charts.build(r,docs(r),{mode:'records',type:'bar',dimension:'ID',measure:'Saldo',limit:15},Filters);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.points.length,15);
  assert.equal(result.limited,true);
  assert.equal(result.totalDataRows,3254);
  assert.ok(performance.now()-start<5000,'chart processing exceeded generous CI budget');
});
