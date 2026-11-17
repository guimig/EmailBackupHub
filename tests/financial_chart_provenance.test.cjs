'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildGruMonthly, parseAmount, locateGruColumns, renderComparison, renderGruMonthly
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
  assert.equal(series.series.length,6);
  const dashboard=read('assets/js/dashboard.js');
  const html=read('dashboard.html');
  assert.doesNotMatch(dashboard,/renderHistoricalLineChart\s*\(/);
  assert.doesNotMatch(dashboard,/renderExpenseHistory\s*\(/);
  assert.doesNotMatch(html,/id="historyRange"/);
  assert.match(html,/financeiro.*não a data de cada lançamento|não a data de cada lançamento/i);
});

test('Brazilian numeric interpretation is strict, zero is different from absent', () => {
  assert.equal(parseAmount('0'),0);
  assert.equal(parseAmount('5.853,52'),5853.52);
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
  assert.match(container.innerHTML,/não lançamentos por data/);
  const missing={innerHTML:''};
  renderComparison(missing,[{label:'Inexistente',value:null}],{});
  assert.match(missing.innerHTML,/Não há valores auditáveis/);
});

test('monthly chart represents missing separately from explicit zero and does not interpolate',()=>{
  const container={innerHTML:''};
  renderGruMonthly(container,{ok:true,year:2026,sourceDate:'2026-11-17',records:2,total:0,
    months:[{label:'JAN/2026',value:0,records:1},{label:'FEV/2026',value:null,records:0}]
  });
  assert.match(container.innerHTML,/R\$\s*0,00/);
  assert.match(container.innerHTML,/Sem registros/);
  assert.equal((container.innerHTML.match(/class="financial-bar-row financial-month-row"/g)||[]).length,2);
  assert.ok(!container.innerHTML.includes('history-point'));
  const mismatch={innerHTML:''};
  renderGruMonthly(mismatch,{ok:false,reason:'Reconciliacao falhou'});
  assert.match(mismatch.innerHTML,/Série mensal não disponível/);
});
