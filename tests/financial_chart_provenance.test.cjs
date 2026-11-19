'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildGruMonthly, buildExpenseStages, parseAmount, locateGruColumns, renderComparison, renderIndependentBalances, renderGruMonthly
} = require('../assets/js/financial-chart-provenance.js');

const ROOT = path.resolve(__dirname, '..');
const gru = require('../data/reports/recolhimento-proprio-gru.json');

function clone(value) { return JSON.parse(JSON.stringify(value)); }
const read = path => fs.readFileSync(require('node:path').join(ROOT,path),'utf8');

test('real GRU 2026: month of issuance reconciles exactly with the audited total', () => {
  const result = buildGruMonthly(gru, gru.metrics.gru_arrecadada);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.year, 2026);
  assert.equal(result.records, 242);
  assert.equal(result.total, 251831.42);
  assert.deepEqual(result.months.map(item=>item.label), [
    'JAN/2026', 'FEV/2026', 'MAR/2026', 'ABR/2026', 'MAI/2026', 'JUN/2026',
    'JUL/2026', 'AGO/2026', 'SET/2026', 'OUT/2026', 'NOV/2026'
  ]);
  assert.equal(result.months[0].value, 24420.34);
  assert.equal(result.months[1].value, 26513.08);
  assert.equal(result.months[9].value, 21886.51);
  assert.equal(result.months.reduce((sum,item)=>sum+(item.value||0),0).toFixed(2),'251831.42');
  assert.equal(result.description.includes('não representa necessariamente'), true);
  assert.ok(locateGruColumns(gru.columns).value.includes('Movim. Líquido'));
});

test('other plausible document value column does not reconcile with audited GRU', () => {
  const copied=clone(gru);
  const own=locateGruColumns(copied.columns);
  copied.rows=copied.rows.map(row=>({...row,[own.value]:row['Conta Contábil / Doc - Valor']}));
  const result=buildGruMonthly(copied, copied.metrics.gru_arrecadada);
  assert.equal(result.ok,false);
  assert.match(result.reason,/não reconcilia/);
});

test('missing or incorrect audited total, report quality and future dates are rejected', () => {
  assert.equal(buildGruMonthly(gru, 0).ok,false);
  assert.equal(buildGruMonthly(gru, null).ok,false);
  const tampered=clone(gru);tampered.metrics.gru_arrecadada=123;
  assert.equal(buildGruMonthly(tampered,gru.metrics.gru_arrecadada).ok,false);
  const badQuality=clone(gru);badQuality.quality.ok=false;
  assert.equal(buildGruMonthly(badQuality,gru.metrics.gru_arrecadada).ok,false);
  const unknown=clone(gru);unknown.rows[0]['Emissão - Dia']='31/02/2026';
  assert.equal(buildGruMonthly(unknown,gru.metrics.gru_arrecadada).ok,false);
  const future=clone(gru);future.rows[0]['Emissão - Dia']='30/12/2026';
  assert.equal(buildGruMonthly(future,gru.metrics.gru_arrecadada).ok,false);
  const mismatch=clone(gru);mismatch.rows[0]['Emissão - Mês']='JAN/2026';
  assert.equal(buildGruMonthly(mismatch,gru.metrics.gru_arrecadada).ok,false);
});

test('GRU has valid month data without depending on snapshots; code never equates extraction with posting', () => {
  const expense=JSON.parse(read('data/reports/despesas-empenhadas-liquidadas-e-pagas-mes-lancamento.json'));
  const credit=JSON.parse(read('data/reports/credito-disponivel-mes-lancamento.json'));
  assert.equal(expense.columns.some(c=>/emiss[aã]o\s*-\s*dia/i.test(c)),false);
  assert.equal(credit.columns.some(c=>/emiss[aã]o\s*-\s*dia/i.test(c)),false);
  const series=JSON.parse(read('data/series/despesas-empenhadas-liquidadas-e-pagas-mes-lancamento.json'));
  assert.ok(Array.isArray(series.series));
  assert.ok(series.series.length > 0, 'Historical series must not be empty');
  const minimumDate = series.series_min_date;
  assert.match(minimumDate, /^\d{4}-\d{2}-\d{2}$/);
  const dates = series.series.map(item => item.date_iso);
  assert.ok(dates.every(date => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) && date >= minimumDate),
    'Historical entries must have valid dates within the configured range');
  assert.equal(new Set(dates).size, dates.length, 'Historical dates must be unique');
  assert.deepEqual(dates, [...dates].sort(), 'Historical entries must be chronological');
  const dashboard=read('assets/js/dashboard.js');
  const html=read('dashboard.html');
  assert.doesNotMatch(dashboard,/renderHistoricalLineChart\s*\(/);
  assert.doesNotMatch(dashboard,/renderExpenseHistory\s*\(/);
  assert.doesNotMatch(html,/id="historyRange"/);
  assert.match(html, /Mês de emissão não é necessariamente mês de recolhimento/);
});

test('Brazilian numeric interpretation is strict, zero is different from absent', () => {
  assert.equal(parseAmount('0'),0);
  assert.equal(parseAmount('5.853,52'),5853.52);
  assert.equal(parseAmount('(50,00)'),-50); // Real estorno contábil no relatório de GRU.
  assert.equal(parseAmount('(-50,00)'),null);
  assert.equal(parseAmount(''),null);
  assert.equal(parseAmount('123/2026'),null);
  assert.equal(parseAmount('=1+1'),null);
});

test('comparative charts use snapshot values without inventing times or subtracting balances',()=>{
  const container={innerHTML:''};
  renderComparison(container,[
    {label:'Empenhado',value:50000},{label:'Liquidado',value:30000},{label:'Pago',value:20000}
  ],{note:'Posição atual, não lançamentos por data.'});
  assert.equal((container.innerHTML.match(/class="financial-bar-row"/g)||[]).length,3);
  assert.ok(!container.innerHTML.includes('<svg'));
  assert.doesNotMatch(container.innerHTML,/chart-methodology/);
  const missing={innerHTML:''};
  renderComparison(missing,[{label:'Inexistente',value:null}],{});
  assert.match(missing.innerHTML,/Não há valores auditáveis/);
});

test('monthly chart is one compact interactive series without redundant disclosures', () => {
  const container = {innerHTML:''};
  renderGruMonthly(container,{
    ok:true,year:2026,sourceDate:'2026-11-17',records:3,total:-30,
    months:[
      {label:'JAN/2026',value:20,records:1},
      {label:'FEV/2026',value:-50,records:1},
      {label:'MAR/2026',value:null,records:0}
    ]
  }, {url:'report-viewer.html?report=gru.json'});
  assert.equal((container.innerHTML.match(/class="gru-month-button/g) || []).length,3);
  assert.match(container.innerHTML, /gru-month-button is-negative/);
  assert.match(container.innerHTML, /aria-pressed="false"/);
  assert.match(container.innerHTML, /Sem registros/);
  assert.match(container.innerHTML, /-R\$\s*50,00/);
  assert.doesNotMatch(container.innerHTML, /<details/);
  assert.match(container.innerHTML, /report-viewer.html/);
  assert.equal((container.innerHTML.match(/class="gru-month-axis-tick"/g)||[]).length,5);
  assert.match(container.innerHTML, /--gru-upper-height:105px;--gru-lower-height:105px/);
  assert.match(container.innerHTML, /class="gru-month-negative"><span class="gru-month-column-fill"/);
  assert.match(container.innerHTML, /class="gru-month-axis-tick" style="top:50%"/);
  assert.match(container.innerHTML, /Movimentação líquida \\(R\\$\\)/);
  const positiveOnly={innerHTML:''};
  renderGruMonthly(positiveOnly,{ok:true,months:[
    {label:'JAN/2026',value:100,records:2},
    {label:'FEV/2026',value:50,records:1}
  ]});
  assert.match(positiveOnly.innerHTML, /--gru-upper-height:210px;--gru-lower-height:0px/);
  assert.match(positiveOnly.innerHTML, /aria-label="Eixo vertical em reais"/);
  const mismatch={innerHTML:''};
  renderGruMonthly(mismatch,{ok:false,reason:'Reconciliacao falhou'});
  assert.match(mismatch.innerHTML,/Série mensal indisponível/);
  const empty={innerHTML:''};
  renderGruMonthly(empty,{ok:true,months:[],year:2026,total:0,sourceDate:'2026-11-17'});
  assert.match(empty.innerHTML,/gru-month-chart/);
});

test('public expenditure stages use auditable same-snapshot comparison without clamping', () => {
  const good = buildExpenseStages({committed:50000,liquidated:30000,paid:20000},
    {audited:true,quality:true,date:'2026-11-17'});
  assert.equal(good.ok,true);
  assert.equal(good.unliquidated,20000);
  assert.equal(good.unpaidLiquidated,10000);
  assert.equal(good.rates.liquidatedOfCommitted,0.6);
  assert.equal(good.rates.paidOfCommitted,0.4);
  assert.ok(Math.abs(good.rates.paidOfLiquidated-2/3) < 1e-12);
  for (const [values,options] of [
    [{committed:100,liquidated:110,paid:50},{}],
    [{committed:100,liquidated:50,paid:80},{}],
    [{committed:0,liquidated:0,paid:0},{}],
    [{committed:null,liquidated:10,paid:0},{}],
    [{committed:100,liquidated:30,paid:20},{audited:false}],
    [{committed:100,liquidated:30,paid:20},{quality:false}],
    [{committed:100,liquidated:30,paid:20},{date:'invalid'}]
  ]) {
    const invalid = buildExpenseStages(values,options);
    assert.equal(invalid.ok,false,JSON.stringify(values));
    assert.equal(invalid.rates,null);
  }
});

test('independent balances never use misleading percentage bars', () => {
  const container = {innerHTML:''};
  renderIndependentBalances(container,[
    {label:'Crédito disponível',value:40000,date:'17/11/2026'},
    {label:'Provisionamentos',value:null,date:'16/11/2026'}
  ],{note:'Saldos distintos',links:[{label:'Consultar',url:'report-viewer.html'}]});
  assert.equal((container.innerHTML.match(/financial-independent-item/g)||[]).length,2);
  assert.doesNotMatch(container.innerHTML,/financial-bar-track|width:/);
  assert.match(container.innerHTML,/Indisponível/);
  assert.doesNotMatch(container.innerHTML,/chart-methodology/);
});


test('treemap partitions all positive areas proportionally and preserves negative adjustments', () => {
  const { treemapLayout, renderGruCodes } = require('../assets/js/financial-chart-provenance.js');
  const items=[
    {code:'1',description:'A',value:100,records:1},
    {code:'2',description:'B',value:50,records:1},
    {code:'3',description:'C',value:25,records:1},
    {code:'4',description:'Estorno',value:-5,records:1}
  ];
  const layout=treemapLayout(items);
  assert.equal(layout.length,3);
  const area=layout.reduce((sum,item)=>sum+item.w*item.h,0);
  assert.ok(Math.abs(area-10000)<0.01);
  assert.equal(layout.find(item=>item.code==='1').w*layout.find(item=>item.code==='1').h >
    layout.find(item=>item.code==='2').w*layout.find(item=>item.code==='2').h,true);
  const container={innerHTML:''};
  renderGruCodes(container,{ok:true,year:2026,total:170,items});
  assert.equal((container.innerHTML.match(/class="gru-treemap-tile/g)||[]).length,3);
  assert.match(container.innerHTML,/Estorno/);
  assert.match(container.innerHTML,/aria-pressed="false"/);
  assert.doesNotMatch(container.innerHTML,/gru-code-more|<details/);
});

test('GRU code composition reconciles by code and description, including reversals', () => {
  const { buildGruByCode, renderGruCodes } = require('../assets/js/financial-chart-provenance.js');
  const valueColumn = '724210100 / = ARRECADACAO LIQUIDA POR COD DE RECOLHIMENTO / Movim. Líquido - R$ (Item Informação)';
  const report = {
    date_iso:'2026-11-17', metadata:{exercicio:2026}, quality:{ok:true},
    metrics:{gru_arrecadada:180},
    metrics_meta:{gru_arrecadada:{status:'ok'}},
    columns:['Emissão - Dia','Emissão - Mês','Cód. Recolhimento GRU','Cód. Recolhimento GRU (2)',valueColumn],
    rows:[
      {'Emissão - Dia':'02/01/2026','Emissão - Mês':'JAN/2026','Cód. Recolhimento GRU':'28832','Cód. Recolhimento GRU (2)':'SERVICOS EDUCACIONAIS',[valueColumn]:'100,00'},
      {'Emissão - Dia':'04/02/2026','Emissão - Mês':'FEV/2026','Cód. Recolhimento GRU':'28832','Cód. Recolhimento GRU (2)':'SERVICOS EDUCACIONAIS',[valueColumn]:'-20,00'},
      {'Emissão - Dia':'06/02/2026','Emissão - Mês':'FEV/2026','Cód. Recolhimento GRU':'28812','Cód. Recolhimento GRU (2)':'PRODUCAO ANIMAL',[valueColumn]:'100,00'}
    ]
  };
  const grouped = buildGruByCode(report, 180);
  assert.equal(grouped.ok,true,grouped.reason);
  assert.equal(grouped.items.length,2);
  assert.equal(grouped.items.find(x=>x.code==='28832').value,80);
  assert.equal(grouped.items.find(x=>x.code==='28812').value,100);
  const container={innerHTML:''};
  renderGruCodes(container,grouped);
  assert.match(container.innerHTML,/SERVICOS EDUCACIONAIS/);
  assert.equal((container.innerHTML.match(/gru-treemap-tile/g)||[]).length,2);
  assert.match(container.innerHTML,/R\$\s*100,00/);
  assert.equal(buildGruByCode(report,179).ok,false);
  assert.equal(buildGruByCode({...report,columns:report.columns.filter(c=>c!=='Cód. Recolhimento GRU (2)')},180).ok,false);
});

test('indicative committed/provisioned ratio requires audited same date and exercise', () => {
  const { buildCommitmentProvisionRatio } = require('../assets/js/financial-chart-provenance.js');
  const doc=(key,value,date='2026-11-17')=>({
    date_iso:date,metadata:{exercicio:2026},quality:{ok:true},
    metrics:{[key]:value},metrics_meta:{[key]:{status:'ok',fallback:false}}
  });
  const provision=doc('provisionado',100000);
  const expense=doc('empenhado',50000);
  assert.equal(buildCommitmentProvisionRatio(provision,expense).value,.5);
  const above = buildCommitmentProvisionRatio(provision,doc('empenhado',100001));
  assert.equal(above.ok,true);
  assert.equal(above.aboveScale,true);
  assert.ok(above.value > 1);
  const dateDiff = buildCommitmentProvisionRatio(provision,doc('empenhado',50000,'2026-11-16'));
  assert.equal(dateDiff.ok,true);
  assert.equal(dateDiff.provisional,true);
  const noExercise = buildCommitmentProvisionRatio({
    ...provision,metadata:{}
  },{...expense,metadata:{}});
  assert.equal(noExercise.ok,true);
  assert.equal(buildCommitmentProvisionRatio({...provision,metrics_meta:{provisionado:{status:'missing'}}},expense).ok,false);
});
