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
});

test('meaningful accounting explanations and links remain available', () => {
  assert.match(html, /Total acompanhado: pagos e a pagar/);
  assert.match(html, /saldos de relatórios independentes/);
  assert.match(html, /RAP pago dividido pela soma de RAP pago e RAP a pagar/);
  assert.match(html, /id="managementAlertsPanel"/);
  assert.match(html, /class="aux-panel glossary-panel"/);
  assert.match(html, /class="chart-help"/);
  assert.match(html, /id="gruViewCodesButton"/);
});

test('interactive charts retain one dedicated selection detail region', () => {
  for (const id of ['expenseChartDetail', 'rapChartDetail', 'stagesChartDetail', 'creditChartDetail']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(js, /function selectFinancialGraphic\(target\)/);
  assert.match(js, /event\.key !== 'Enter' && event\.key !== ' '/);
  assert.doesNotMatch(js, /function renderExecutiveInsights/);
});
