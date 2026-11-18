'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'assets/js/dashboard.js'), 'utf8');
const start = dashboard.indexOf('    function renderHalfGauge(id, value) {');
const end = dashboard.indexOf('    function renderGauge(id, value) {', start);
assert.ok(start >= 0 && end > start, 'Half-gauge renderer must exist');

function harness() {
  const attributes = new Map();
  const element = {
    innerHTML: '',
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); }
  };
  const context = vm.createContext({
    byId: id => id === 'gauge' ? element : null,
    Number, Intl
  });
  vm.runInContext(dashboard.slice(start, end) + '\nglobalThis.render = renderHalfGauge;', context);
  return { render: context.render, element, attributes };
}

test('semicircle represents a normal audited percentage with accessible SVG', () => {
  const { render, element } = harness();
  render('gauge', .625);
  assert.match(element.innerHTML, /viewBox="0 0 144 84"/);
  assert.match(element.innerHTML, /aria-label="62,5%"/);
  assert.match(element.innerHTML, /stroke-dasharray="62\.500 100"/);
});

test('0% and 100% are represented without false empty state', () => {
  const { render, element } = harness();
  render('gauge', 0);
  assert.match(element.innerHTML, /stroke-dasharray="0\.000 100"/);
  render('gauge', 1);
  assert.match(element.innerHTML, /stroke-dasharray="100\.000 100"/);
});

test('missing or inconsistent percentages never become a fabricated arc', () => {
  const { render, element, attributes } = harness();
  for (const value of [null, NaN, -0.01, 1.01, Infinity]) {
    render('gauge', value);
    assert.doesNotMatch(element.innerHTML, /<svg/);
    assert.match(element.innerHTML, /Sem base/);
    assert.equal(attributes.get('aria-label'), 'Percentual indisponível');
  }
  render('gauge', .5);
  assert.match(element.innerHTML, /<svg/);
  assert.equal(attributes.has('aria-label'), false);
});
