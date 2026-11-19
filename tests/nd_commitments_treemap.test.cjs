'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {buildNdCommitments, buildNdCommitmentView, renderNdCommitments, amountCents} = require('../assets/js/financial-chart-provenance.js');

const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/reports/saldos-de-empenhos-do-exercicio-conta-contabil.json'),'utf8'));
const ND='Natureza Despesa Detalhada (2)';
const GROSS='Conta Contábil / NE CCor - Valor';
const S=[
  '622920101 / = EMPENHOS A LIQUIDAR / Saldo - R$ (Conta Contábil)',
  '622920103 / = EMPENHOS LIQUIDADOS A PAGAR / Saldo - R$ (Conta Contábil)',
  '622920104 / = EMPENHOS PAGOS / Saldo - R$ (Conta Contábil)'
];
function doc(rows,options={}) {
  return {
    columns:[ND,'NE CCor',GROSS,...S],
    rows,quality:{ok:true},...options
  };
}
function record(description,ne,gross,balances) {
  return {[ND]:description,'NE CCor':ne,[GROSS]:gross,
    [S[0]]:balances[0],[S[1]]:balances[1],[S[2]]:balances[2]};
}

test('real ND report reconciles by accounting balances, not repeated gross NE value',()=>{
  const result=buildNdCommitments(source,7300810.29);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.total,7300810.29);
  assert.equal(result.records,329);
  assert.equal(result.uniqueCommitments,283);
  assert.equal(result.groups,65);
  assert.deepEqual(result.valueColumns,S);
  assert.equal(result.groupColumn,ND);
  assert.equal(Math.round(result.items.reduce((sum,item)=>sum+item.value,0)*100),730081029);
  assert.equal(Math.round(source.rows.reduce((sum,row)=>sum+amountCents(row[GROSS]),0)),754234058);
  assert.notEqual(result.total,7542340.58);
  assert.equal(result.items.some(item=>item.description==='LIMPEZA E CONSERVACAO'),true);
  assert.equal(buildNdCommitments(source,7542340.58).ok,false);
});

test('all three audited source balances reconcile with their line sums',()=>{
  const sums=S.map(name=>source.rows.reduce((sum,row)=>sum+amountCents(row[name]),0));
  assert.deepEqual(sums,[274141004,33798206,422141819]);
  const expected=['saldo_a_liquidar','liquidado_a_pagar','pago'];
  expected.forEach((key,index)=>assert.equal(amountCents(source.metrics[key]),sums[index]));
  assert.equal(sums.reduce((a,b)=>a+b,0),730081029);
});

test('same NE repeated across ND only contributes each stage balance once',()=>{
  const fixture=doc([
    record('MATERIAL A','2026NE001','100,00',['20,00','0,00','40,00']),
    record('MATERIAL B','2026NE001','100,00',['10,00','10,00','20,00']),
    record('MATERIAL C','2026NE002','50,00',['0,00','0,00','50,00'])
  ]);
  const model=buildNdCommitments(fixture,150);
  assert.equal(model.ok,true,model.reason);
  assert.equal(model.total,150);
  assert.equal(model.uniqueCommitments,2);
  assert.equal(model.items.find(x=>x.description==='MATERIAL A').value,60);
  assert.equal(model.items.find(x=>x.description==='MATERIAL B').value,40);
  assert.equal(model.items.find(x=>x.description==='MATERIAL C').value,50);
});

test('empty unused stage cells mean zero without suppressing audit checks',()=>{
  const fixture=doc([
    record('DESPESA A','2026NE001','100,00',['100,00','','']),
    record('DESPESA B','2026NE002','50,00',['','20,00','30,00'])
  ]);
  const result=buildNdCommitments(fixture,150);
  assert.equal(result.ok,true,result.reason);
  assert.equal(result.total,150);
  assert.equal(result.items.find(item=>item.description==='DESPESA B').value,50);
  const allBlank=doc([
    record('DESPESA A','2026NE001','100,00',['','',''])
  ]);
  assert.equal(buildNdCommitments(allBlank).ok,false);
  const malformed=doc([
    record('DESPESA A','2026NE001','100,00',['70,00','invalid','30,00'])
  ]);
  assert.equal(buildNdCommitments(malformed).ok,false);
});

test('invalid accounting values, missing accounts and conflicting NE totals are rejected',()=>{
  const normal=record('MATERIAL A','2026NE001','100,00',['60,00','0,00','40,00']);
  assert.equal(buildNdCommitments(doc([])).ok,false);
  assert.equal(buildNdCommitments(doc([normal],{quality:{ok:false}})).ok,false);
  assert.equal(buildNdCommitments(doc([normal],{columns:[ND,GROSS,...S]})).ok,false);
  assert.equal(buildNdCommitments(doc([normal],{columns:[ND,'NE CCor',GROSS,S[0],S[1]]})).ok,false);
  assert.equal(buildNdCommitments(doc([{...normal,[S[0]]:'invalid'}])).ok,false);
  assert.equal(buildNdCommitments(doc([normal]),99.99).ok,false);
  assert.equal(buildNdCommitments(doc([normal],{metrics:{
    saldo_a_liquidar:61,liquidado_a_pagar:0,pago:40
  },metrics_meta:{
    saldo_a_liquidar:{status:'ok'},liquidado_a_pagar:{status:'ok'},pago:{status:'ok'}
  }})).ok,false);
  const duplicate=doc([
    record('MATERIAL A','2026NE001','100,00',['60,00','0,00','0,00']),
    record('MATERIAL B','2026NE001','200,00',['40,00','0,00','0,00'])
  ]);
  assert.equal(buildNdCommitments(duplicate).ok,false);
});

test('treemap renders the eight largest ND groups and other categories only once',()=>{
  const result=buildNdCommitments(source);
  const node={innerHTML:''};
  renderNdCommitments(node,result);
  assert.equal((node.innerHTML.match(/class="gru-treemap-tile nd-treemap-tile/g)||[]).length,19);
  assert.match(node.innerHTML,/Outras naturezas/);
  assert.match(node.innerHTML,/aria-pressed="false"/);
  assert.doesNotMatch(node.innerHTML,/<details|data-nd-value="NaN"/);
  const bad={innerHTML:''};
  renderNdCommitments(bad,{ok:false,reason:'Verificar origem'});
  assert.match(bad.innerHTML,/Verificar origem/);
});

test('negative ND is not treated as a positive treemap area',()=>{
  const fixture=doc([
    record('DESPESA A','2026NE001','100,00',['70,00','20,00','10,00']),
    record('ANULACAO','2026NE002','-20,00',['-20,00','0,00','0,00'])
  ]);
  const result=buildNdCommitments(fixture,80);
  assert.equal(result.ok,true,result.reason);
  const node={innerHTML:''};
  renderNdCommitments(node,result);
  assert.equal((node.innerHTML.match(/class="gru-treemap-tile nd-treemap-tile/g)||[]).length,1);
  assert.match(node.innerHTML,/saldo negativo/);
});

test('general and detailed ND views preserve the same audited total and keep distinct codes',()=>{
  const model=buildNdCommitments(source,7300810.29);
  assert.equal(model.ok,true,model.reason);
  assert.equal(model.generalItems.length,15);
  assert.equal(model.detailedItems.length,66);
  assert.equal(model.total,7300810.29);
  const allGenerals=buildNdCommitmentView(model,{mode:'general'});
  assert.equal(allGenerals.mode,'general');
  assert.equal(allGenerals.allCount,15);
  assert.equal(allGenerals.remainingCount,0);
  assert.equal(Math.round(allGenerals.items.reduce((sum,x)=>sum+x.value,0)*100),730081029);
  const detail=buildNdCommitmentView(model,{mode:'detailed'});
  assert.equal(detail.allCount,66);
  assert.equal(detail.items.length,19);
  assert.equal(detail.remainingCount,48);
  const expanded=buildNdCommitmentView(model,{mode:'detailed',showAll:true});
  assert.equal(expanded.items.length,expanded.allCount - expanded.negativeCount);
  const cleaning=expanded.items.filter(item=>item.description==='LIMPEZA E CONSERVACAO');
  assert.equal(cleaning.length,2);
  assert.deepEqual(cleaning.map(x=>x.code).sort(),['33903702','33903978']);
  const general=allGenerals.items.find(item=>item.description==='MATERIAL DE CONSUMO');
  assert.ok(general);
  const filtered=buildNdCommitmentView(model,{mode:'detailed',parent:general.key});
  assert.equal(filtered.parent,general.key);
  assert.equal(filtered.filtered,true);
  assert.equal(filtered.allCount,24);
  assert.ok(filtered.scopeTotal < model.total);
  assert.ok(filtered.items.every(item=>item.aggregate || item.generalKey===general.key));
  const node={innerHTML:''};
  renderNdCommitments(node,allGenerals);
  assert.match(node.innerHTML,/data-nd-drill="general"/);
  assert.equal((node.innerHTML.match(/data-nd-description=/g)||[]).length,15);
  renderNdCommitments(node,filtered);
  assert.doesNotMatch(node.innerHTML,/data-nd-drill="general"/);
  assert.match(node.innerHTML,/data-nd-key=/);
});

test('switching ND views never changes source commitment totals or hides negative adjustments',()=>{
  const fixture=doc([
    record('A','NE1','100,00',['90,00','','10,00']),
    record('B','NE2','-10,00',['-10,00','',''])
  ]);
  const model=buildNdCommitments(fixture,90);
  assert.equal(model.ok,true,model.reason);
  for(const mode of ['general','detailed']) {
    const view=buildNdCommitmentView(model,{mode});
    assert.equal(view.total,90);
    assert.equal(view.positiveTotal,100);
    const node={innerHTML:''};
    renderNdCommitments(node,view);
    assert.match(node.innerHTML,/saldo negativo/);
  }
});
