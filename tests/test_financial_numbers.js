const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function extract(source, name) {
  const start = source.indexOf('    function ' + name + '(');
  assert(start >= 0, 'Missing function: ' + name);
  const end = source.indexOf('\n    function ', start + 20);
  return source.slice(start, end < 0 ? undefined : end);
}
for (const file of ['dashboard', 'report-viewer']) {
  const source = fs.readFileSync('assets/js/' + file + '.js', 'utf8');
  const context = vm.createContext({});
  vm.runInContext(extract(source, 'parseBrNumber'), context);
  for (const [input, expected] of [['R$ 1.234,56', 1234.56], ['(1.234,56)', -1234.56],
      ['1.234', 1234], ['0,00', 0], ['', null], ['158459264222026NE000019', null],
      ['23349.002207/2025-40', null], ['OUT/2026', null]]) {
    assert.equal(context.parseBrNumber(input), expected, file + ': ' + input);
  }
}
const dashboard = fs.readFileSync('assets/js/dashboard.js', 'utf8');
const doc = {slug: 'expense', date: '08/10/2026', date_iso: '2026-10-08',
  metadata: {hash_conteudo: 'current'}, columns: ['Descricao', 'Saldo'],
  metrics: {pago: 3343400.94}, metrics_meta: {pago: {status: 'ok', source: 'totals'}},
  totals: [{label: 'Total Geral', raw: {Descricao: 'Total Geral', Saldo: '300,00'}},
           {label: 'Subtotal', raw: {Descricao: 'Subtotal', Saldo: '100,00'}}],
  series_data: {series: [{date_iso: '2026-10-07', hash_conteudo: 'old',
    metrics: {pago: 999999999}}]}};
const context = vm.createContext({financialReports: {expense: doc},
  normalize: text => String(text).trim().toLowerCase(), reportLabel: slug => slug});
for (const name of ['parseBrNumber', 'auditValue', 'valueOf', 'isAvailable', 'sourceDate',
  'metricIsReliable', 'latestSeriesMetric', 'metricFromReport', 'metricValue',
  'grandTotalRow', 'sumAudit']) {
  vm.runInContext(extract(dashboard, name), context);
}
assert.equal(context.metricValue('expense', 'pago').value, 3343400.94);
assert.equal(context.latestSeriesMetric(doc, 'pago'), null);
assert.equal(context.grandTotalRow(doc).Saldo, '300,00');
assert.equal(context.sumAudit('Liquidado', [{value: 3343400.94}, {value: 236210.65}]).value, 3579611.59);
console.log('OK: valores monetarios, total geral e origem atual do dashboard.');
