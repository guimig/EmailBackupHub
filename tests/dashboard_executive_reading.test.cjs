'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../assets/js/dashboard.js'), 'utf8');
const start = source.indexOf('    function renderExecutiveInsights(values) {');
const end = source.indexOf('    function setInsight(', start);
assert.ok(start > 0 && end > start, 'Executive insights renderer must be defined');

function harness() {
  const elements = new Map();
  const byId = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', dataset: {} });
    return elements.get(id);
  };
  const valueOf = value => Number.isFinite(value?.value) ? value.value
    : Number.isFinite(value) ? value : null;
  const formatMoney = value => {
    const n = valueOf(value);
    return n === null ? '-' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  const formatPercent = (part, total) => {
    const p = valueOf(part), t = valueOf(total);
    return p === null || t === null || t <= 0 ? '-' :
      (p / t).toLocaleString('pt-BR', {
        style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1
      });
  };
  const context = vm.createContext({
    byId, valueOf, formatMoney, formatPercent,
    setText(id, value) { byId(id).textContent = String(value); }
  });
  vm.runInContext(source.slice(start, end) + '\nglobalThis.render = renderExecutiveInsights;', context);
  return { render: context.render, el: byId };
}

function data(overrides = {}) {
  return {
    committed: { value: 50000 }, liquidated: { value: 30000 }, paid: { value: 20000 },
    rapPaid: { value: 10000 }, rapPayable: { value: 2000 }, rapTotal: { value: 12000 },
    provisioned: { value: 100000 }, credit: { value: 40000 },
    ...overrides
  };
}

test('clear summary uses paid divided by committed and shows unpaid RAP without unsupported thresholds', () => {
  const { render, el } = harness();
  render(data());
  assert.match(el('expenseTakeawayTitle').textContent, /40,0% do valor empenhado/);
  assert.match(el('expenseTakeawayText').textContent, /não indica pagamentos realizados no dia/);
  assert.equal(el('expenseTakeaway').dataset.availability, 'available');
  assert.match(el('rapTakeaway').textContent, /R\$\s+2\.000,00 ainda constam a pagar/);
  assert.doesNotMatch(el('expenseTakeawayTitle').textContent, /ótimo|ruim|adequado/i);
});

test('missing financial values produce an explicit unavailable interpretation', () => {
  const { render, el } = harness();
  render(data({ paid: null, rapPayable: null }));
  assert.match(el('expenseTakeawayTitle').textContent, /indisponível/);
  assert.equal(el('expenseTakeaway').dataset.availability, 'missing');
  assert.match(el('rapTakeaway').textContent, /indisponível/);
  assert.doesNotMatch(el('rapTakeaway').textContent, /R\$/);
});

test('zero denominator and overpaid comparison never imply normal execution', () => {
  const { render, el } = harness();
  render(data({ committed: 0, rapPaid: 0, rapPayable: 0, rapTotal: 0 }));
  assert.match(el('expenseTakeawayTitle').textContent, /indisponível/);
  assert.match(el('rapTakeaway').textContent, /sem base positiva/);
  render(data({ committed: 100, paid: 200, rapPayable: -5 }));
  assert.match(el('expenseTakeawayTitle').textContent, /indisponível/);
  assert.match(el('rapTakeaway').textContent, /indisponível/);
  assert.doesNotMatch(el('expenseTakeawayTitle').textContent, /NaN|Infinity/);
});

test('explanatory copy preserves independent credit and provisioned balances', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../dashboard.html'), 'utf8');
  assert.match(html, /São saldos distintos/);
  assert.match(html, /não representa, necessariamente, crédito utilizado ou a utilizar/);
  assert.match(html, /id="otherFinancialIndicators"/);
  assert.match(html, /id="managementAlertsPanel"/);
  assert.match(html, /Base: RAP pago \+ RAP a pagar/);
});
