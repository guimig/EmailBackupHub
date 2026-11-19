'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildModel, render } = require('../assets/js/provision-composition');

const columns = [
  'Ação Governo / PROGRAMA PNAE',
  'Grupo Despesa / 3',
  'Grupo Despesa / OUTRAS DESPESAS CORRENTES',
  'Saldo - Moeda Origem (Item Informação) / 89.872,00'
];
function fixture() {
  return {
    slug: 'provisionamentos',
    date: '19/11/2026', date_iso: '2026-11-19',
    metadata: {hash_conteudo: 'same'},
    quality: {ok:true}, metrics:{provisionado:300},
    metrics_meta:{provisionado:{status:'ok',source:'totals',fallback:false}},
    columns:[...columns],
    rows:[
      {[columns[0]]:'OBRAS', [columns[1]]:'4',
       [columns[2]]:'INVESTIMENTOS',[columns[3]]:'100,00'},
      {[columns[0]]:'FUNCIONAMENTO', [columns[1]]:'3',
       [columns[2]]:'OUTRAS DESPESAS CORRENTES',[columns[3]]:'150,00'}
    ],
    totals:[
      {label:'OBRAS',values:{[columns[3]]:100}},
      {label:'FUNCIONAMENTO',values:{[columns[3]]:150}},
      {label:'PNAE',values:{[columns[3]]:50}},
      {label:'Total',values:{[columns[3]]:300}}
    ]
  };
}
test('composição por grupo recupera subtotal órfão auditável e reconcilia total', () => {
  const model=buildModel(fixture());
  assert.equal(model.ok,true,model.reason);
  assert.equal(model.total,300);
  assert.equal(model.groups.find(g=>g.code==='3').value,200);
  assert.equal(model.groups.find(g=>g.code==='4').value,100);
  assert.equal(model.recovered.value,50);
  assert.equal(model.groups.reduce((a,g)=>a+g.value,0),model.total);
});
test('nunca atribui o resíduo a um grupo desconhecido', () => {
  const doc=fixture();
  doc.columns[1]='Grupo Despesa';
  assert.equal(buildModel(doc).ok,false);
  const bad=fixture();bad.totals[2].values[columns[3]]=49;
  assert.equal(buildModel(bad).ok,false);
  const mismatch=fixture();mismatch.metadata.hash_conteudo='outro';
  assert.equal(buildModel(mismatch,fixture()).ok,false);
  const invalid=fixture();invalid.rows[1][columns[2]]='INVESTIMENTOS';
  assert.equal(buildModel(invalid).ok,false);
});
test('totais completos são aceitos; grupo líquido negativo impede rosca enganosa', () => {
  const doc=fixture();doc.metrics.provisionado=250;
  doc.totals.splice(2,1);doc.totals[2].values[columns[3]]=250;
  const model=buildModel(doc);
  assert.equal(model.ok,true,model.reason);
  assert.equal(model.recovered,null);
  const negative=fixture();
  negative.rows[1][columns[3]]='(20,00)';
  negative.metrics.provisionado=80;
  negative.totals[1].values[columns[3]]=-20;
  negative.totals.splice(2,1);
  negative.totals[2].values[columns[3]]=80;
  assert.equal(buildModel(negative).ok,false);
});
test('renderização apresenta rosca, duas categorias e alternativa de erro', () => {
  const container={innerHTML:'',querySelectorAll:()=>[]};
  render(container,buildModel(fixture()),null);
  assert.match(container.innerHTML,/provision-donut/);
  assert.match(container.innerHTML,/data-provision-group="3"/);
  assert.match(container.innerHTML,/data-provision-group="4"/);
  assert.match(container.innerHTML,/300,00/);
  assert.ok(container.innerHTML.includes('300,00</strong>'));
  const large = { ...buildModel(fixture()), total:7399685.65 };
  render(container,large,null);
  assert.ok(container.innerHTML.includes('R$ 7,4 mi'));
  assert.ok(container.innerHTML.includes('7.399.685,65'));
  const missing={innerHTML:''};
  render(missing,{ok:false,reason:'Dado não auditável'});
  assert.match(missing.innerHTML,/Dado não auditável/);
});
test('provisões da posição publicada são reconciliáveis',()=>{
  const p=path.join(__dirname,'..','data/reports/provisionamentos.json');
  if (!fs.existsSync(p)) return;
  const document=JSON.parse(fs.readFileSync(p,'utf8'));
  const model=buildModel(document);
  assert.equal(model.ok,true,model.reason);
  assert.ok(Math.abs(model.groups.reduce((a,g)=>a+g.value,0)-model.total)<.011);
});
