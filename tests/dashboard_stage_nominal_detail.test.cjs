'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dashboard = fs.readFileSync(path.join(__dirname, '..', 'assets/js/dashboard.js'), 'utf8');
const start = dashboard.indexOf('    function configureStageGaugeDetails(provisionModel, stageModel) {');
const end = dashboard.indexOf('    function renderStageInterpretation(model) {', start);
assert.ok(start >= 0 && end > start, 'Stage detail presenter must exist');

function harness() {
  const nodes = new Map();
  const cards = new Map();
  for (const id of ['provisionGauge', 'committedGauge', 'liquidatedGauge', 'openGauge']) {
    const attributes = new Map();
    const card = {
      dataset: {},
      title: '',
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute(name) { return attributes.get(name); }
    };
    cards.set(id, card);
    nodes.set(id, { title: '', closest: () => card });
    nodes.set(id + 'Value', { textContent: '60,0%' });
  }
  const disclosure = { hidden: false, textContent: 'old value' };
  nodes.set('stageGaugeDetail', disclosure);
  const context = vm.createContext({
    byId: id => nodes.get(id),
    formatMoney: value => new Intl.NumberFormat('pt-BR',
      { style: 'currency', currency: 'BRL' }).format(value)
  });
  vm.runInContext(dashboard.slice(start, end) + '\nglobalThis.configure = configureStageGaugeDetails;', context);
  return { configure: context.configure, cards, nodes, disclosure };
}

test('clickable semicircles carry exact numerator and denominator in BRL', () => {
  const { configure, cards, disclosure } = harness();
  configure({ ok: true, committed: 7000000, provisioned: 7350000, reason: 'Indicativo.' },
    { ok: true, committed: 7000000, liquidated: 5000000, paid: 4000000, unpaidLiquidated: 1000000 });
  assert.equal(disclosure.hidden, true);
  assert.equal(disclosure.textContent, '');
  assert.match(cards.get('provisionGauge').dataset.stageDetail, /R\$\s*7\.000\.000,00 de R\$\s*7\.350\.000,00/);
  assert.match(cards.get('committedGauge').dataset.stageDetail, /R\$\s*5\.000\.000,00 de R\$\s*7\.000\.000,00/);
  assert.match(cards.get('liquidatedGauge').dataset.stageDetail, /R\$\s*4\.000\.000,00 de R\$\s*5\.000\.000,00/);
  assert.match(cards.get('openGauge').dataset.stageDetail, /R\$\s*1\.000\.000,00 de R\$\s*5\.000\.000,00/);
  for (const card of cards.values()) {
    assert.equal(card.getAttribute('role'), 'button');
    assert.equal(card.getAttribute('tabindex'), '0');
    assert.equal(card.getAttribute('aria-controls'), 'stageGaugeDetail');
    assert.equal(card.getAttribute('aria-pressed'), 'false');
    assert.match(card.title, /Selecione para consultar/);
  }
});

test('unavailable stage avoids inventing monetary amounts', () => {
  const { configure, cards } = harness();
  configure({ ok: false, reason: 'Sem provisionamento auditado.' },
    { ok: false, reason: 'Métricas divergentes.' });
  assert.match(cards.get('provisionGauge').dataset.stageDetail, /Valores nominais indisponíveis: Sem provisionamento auditado/);
  assert.match(cards.get('committedGauge').dataset.stageDetail, /Valores nominais indisponíveis: Métricas divergentes/);
  assert.doesNotMatch(cards.get('openGauge').dataset.stageDetail, /R\$\s*0,00 de/);
});

test('liquidated zero does not display fabricated paid or unpaid ratios', () => {
  const { configure, cards } = harness();
  configure({ ok: true, committed: 100, provisioned: 200, reason: 'Indicativo.' },
    { ok: true, committed: 100, liquidated: 0, paid: 0, unpaidLiquidated: 0 });
  assert.match(cards.get('liquidatedGauge').dataset.stageDetail, /Valores nominais indisponíveis/);
  assert.match(cards.get('openGauge').dataset.stageDetail, /Valores nominais indisponíveis/);
});
