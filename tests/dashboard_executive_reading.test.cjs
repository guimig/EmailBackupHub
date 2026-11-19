'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../dashboard.html'), 'utf8');
const js = fs.readFileSync(path.resolve(__dirname, '../assets/js/dashboard.js'), 'utf8');

test('executive summary removes duplicate monetary sections and long introductory copy', () => {
  assert.doesNotMatch(html, /id="otherFinancialIndicators"|id="expenseTakeaway"|id="rapTakeaway"/);
  assert.doesNotMatch(html, /class="aux-panel source-context"|class="panel-note"/);
  assert.doesNotMatch(html, /chart-kicker|Posição consolidada dos relatórios disponíveis/);
  assert.doesNotMatch(html, /Orçamento provisionado acompanhado|Saldo na posição atual do relatório|Movimentação líquida auditada/);
  assert.doesNotMatch(html, /Os indicadores refletem métricas auditáveis dos relatórios recebidos/);
  assert.equal((html.match(/<article class="chart-card chart-card--/g) || []).length, 5);
  assert.equal((html.match(/<h3>/g) || []).length, 5);
  assert.doesNotMatch(html, /chart-card--credit|id="creditDonut"|id="gruValue"/);
});

test('meaningful accounting explanations and links remain available', () => {
  assert.doesNotMatch(html, /Total acompanhado: pagos e a pagar/);
  assert.match(html, /id="creditAvailable"/);
  assert.match(html, /id="budgetBase"/);
  assert.match(html, /RAP pago dividido pela soma de RAP pago e RAP a pagar/);
  assert.match(html, /id="managementAlertsPanel"/);
  assert.doesNotMatch(html, /class="aux-panel glossary-panel"|Glossário dos conceitos/);
  assert.match(html, /id="ndCommitmentsChart"/);
  assert.match(html, /Conta Contábil \/ NE CCor - Valor/);
  assert.match(html, /class="chart-help"/);
  assert.match(html, /id="gruViewCodesButton"/);
});

test('only GRU drilldown remains clickable; redundant readback is absent', () => {
  assert.doesNotMatch(html, /id="expenseChartDetail"|id="rapChartDetail"|id="stagesChartDetail"|id="creditChartDetail"/);
  assert.doesNotMatch(js, /function selectFinancialGraphic\(target\)/);
  assert.match(html, /id="gruViewCodesButton"/);
  assert.match(html, /id="gruSelectionDetail"/);
  assert.match(js, /selected\.dataset\.gruRecords/);
});

test('KPIs expose four distinct accessible report actions while balances remain unique', () => {
  const expected = [
    'budgetReportLink', 'creditReportLink', 'rapReportLink', 'gruReportKpiLink'
  ];
  for (const id of expected) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.equal((html.match(/class="kpi-report-link"/g) || []).length, 4);
  assert.match(js, /chartSourceUrl\(slug\)/);
  assert.match(js, /link\.hidden = true/);
  assert.doesNotMatch(html, /chart-card--credit/);
});

test('execution prioritizes budget commitment ratio and hides valid-state notice', () => {
  const gaugeTitles = [...html.matchAll(/class="stage-gauge-title">([^<]+)/g)].map(match => match[1]);
  assert.deepEqual(gaugeTitles, [
    'Empenhado / provisionado', 'Liquidado / empenhado',
    'Pago / liquidado', 'Liquidado ainda não pago'
  ]);
  assert.match(html, /id="stagesInterpretation"[^>]*hidden/);
  assert.match(js, /banner\.hidden = true/);
  assert.match(js, /banner\.hidden = false/);
});

test('ND value composition is linked to a named grouping and no duplicate stage exists', () => {
  assert.doesNotMatch(html, /id="paidGauge"|id="paidGaugeValue"/);
  assert.doesNotMatch(js, /renderHalfGauge\('paidGauge'/);
  assert.match(js, /query\.set\('vg', 'Natureza Despesa Detalhada \(2\)'\)/);
  for (const account of ['622920101', '622920103', '622920104']) {
    assert.match(js, new RegExp(account + ' \\/ = EMPENHOS'));
    assert.match(html, new RegExp(account));
  }
  assert.doesNotMatch(js, /query\\.set\\('vgs', JSON\\.stringify\\(\\['Conta Contábil \\/ NE CCor - Valor'\\]\\)\\)/);
});
