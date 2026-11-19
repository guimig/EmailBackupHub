'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {buildNdCommitments, renderNdCommitments, amountCents} = require('../assets/js/financial-chart-provenance.js');

const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/reports/saldos-de-empenhos-do-exercicio-conta-contabil.json'),'utf8'));
test('ND description aggregation uses the monetary NE CCor value and excludes subtotal rows',()=>{
  const result=buildNdCommitments(source);
  assert.equal(result.ok,true,result.reason);
  const column='Conta Contábil / NE CCor - Valor';
  const amount=source.rows.reduce((sum,row)=>sum+amountCents(row[column]),0);
  assert.equal(Math.round(result.total*100),amount);
  assert.equal(result.records,source.rows.length);
  assert.equal(result.groups,new Set(source.rows.map(row=>row['Natureza Despesa Detalhada (2)'])).size);
  assert.equal(result.valueColumn,column);
  assert.equal(result.groupColumn,'Natureza Despesa Detalhada (2)');
  assert.ok(result.items.some(item=>item.description==='LIMPEZA E CONSERVACAO'));
  assert.notEqual(result.total,source.metrics.empenhado);
});

test('ND aggregation rejects missing, invalid or ambiguous monetary values',()=>{
  const missing={...source,columns:source.columns.filter(name=>name!=='Conta Contábil / NE CCor - Valor')};
  assert.equal(buildNdCommitments(missing).ok,false);
  assert.equal(buildNdCommitments({...source,rows:[]}).ok,false);
  const corrupt={...source,rows:[{...source.rows[0],'Conta Contábil / NE CCor - Valor':'unknown'}]};
  assert.equal(buildNdCommitments(corrupt).ok,false);
  assert.equal(buildNdCommitments({...source,quality:{ok:false}}).ok,false);
});

test('treemap keeps chart compact and accounts for all positive categories',()=>{
  const result=buildNdCommitments(source);
  const node={innerHTML:''};
  renderNdCommitments(node,result);
  assert.equal((node.innerHTML.match(/class="gru-treemap-tile nd-treemap-tile/g)||[]).length,9);
  assert.match(node.innerHTML,/Outras naturezas/);
  assert.match(node.innerHTML,/aria-pressed="false"/);
  assert.doesNotMatch(node.innerHTML,/<details|data-nd-value="NaN"/);
  const bad={innerHTML:''};
  renderNdCommitments(bad,{ok:false,reason:'Verificar origem'});
  assert.match(bad.innerHTML,/Verificar origem/);
});

test('negative categories are not shown as positive areas',()=>{
  const result=buildNdCommitments({
    columns:['Natureza Despesa Detalhada (2)','Conta Contábil / NE CCor - Valor'],
    quality:{ok:true},
    rows:[
      {'Natureza Despesa Detalhada (2)':'DESPESA A','Conta Contábil / NE CCor - Valor':'100,00'},
      {'Natureza Despesa Detalhada (2)':'ANULACAO','Conta Contábil / NE CCor - Valor':'-20,00'}
    ]
  });
  assert.equal(result.ok,true);
  assert.equal(result.total,80);
  const node={innerHTML:''};
  renderNdCommitments(node,result);
  assert.equal((node.innerHTML.match(/class="gru-treemap-tile nd-treemap-tile/g)||[]).length,1);
  assert.match(node.innerHTML,/saldo negativo/);
});
