'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/js/dashboard.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');

function harness(startName, endName, helpers = {}) {
  const start = source.indexOf('    function ' + startName + '(');
  const end = source.indexOf('    function ' + endName + '(', start);
  assert.ok(start >= 0 && end > start, 'Expected functions are not found in dashboard.js');
  const elements = new Map();
  const byId = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '' });
    return elements.get(id);
  };
  const valueOf = value => Number.isFinite(value?.value) ? value.value
    : Number.isFinite(value) ? value : null;
  const context = vm.createContext({
    byId,
    valueOf,
    isAvailable: value => Number.isFinite(valueOf(value)),
    formatMoney: value => {
      const n = valueOf(value);
      return n === null ? '-' : n.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
    },
    escapeHtml: value => String(value ?? '').replace(/[&<>"]/g, char => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'
    }[char])),
    chartSourceUrl: slug => 'report-viewer.html?report=data%2Freports%2F' + slug + '.json',
    unavailableChart: id => { byId(id).innerHTML = '<p class="chart-empty">Dados indisponíveis.</p>'; },
    setText: (id, value) => {byId(id).textContent = String(value);},
    ...helpers
  });
  vm.runInContext(source.slice(start, end), context);
  return { byId, context };
}

test('RAP panel shows exact basis: paid 10000, payable 2000, total 12000 and both rates', () => {
  const { byId, context } = harness('renderRapHistory', 'gruBreakdown');
  context.renderRapHistory('rapStackChart', {rapPaid:{value:10000},rapPayable:{value:2000}});
  const content = byId('rapStackChart').innerHTML;
  assert.match(content, /rap-composition-track/);
  assert.doesNotMatch(content, /rap-bars/);
  assert.match(content, /width:83\.333%/);
  assert.match(content, /width:16\.667%/);
  for(const amount of ['10.000','2.000','12.000','83,3','16,7']) {
    assert.ok(content.includes(amount), 'Missing value or rate: '+amount);
  }
  assert.match(content, /base dos percentuais/);
  assert.match(content, /Consultar relatório de Restos a Pagar/);
});

test('RAP preserves valid zero percent, but does not divide by zero', () => {
  const {byId,context}=harness('renderRapHistory','gruBreakdown');
  context.renderRapHistory('rapStackChart',{rapPaid:0,rapPayable:2000});
  const validZero = byId('rapStackChart').innerHTML;
  assert.match(validZero,/width:0\.000%/);
  assert.match(validZero,/0,0%/);
  assert.match(validZero,/2\.000/);
  context.renderRapHistory('rapStackChart',{rapPaid:0,rapPayable:0});
  assert.match(byId('rapStackChart').innerHTML,/Não há total positivo/);
  assert.doesNotMatch(byId('rapStackChart').innerHTML,/width:NaN/);
});

test('RAP unavailable and negative inputs do not produce misleading composition',()=>{
  const {byId,context}=harness('renderRapHistory','gruBreakdown');
  context.renderRapHistory('rapStackChart',{rapPaid:null,rapPayable:10});
  assert.match(byId('rapStackChart').innerHTML,/Dados indisponíveis/);
  context.renderRapHistory('rapStackChart',{rapPaid:-100,rapPayable:300});
  assert.match(byId('rapStackChart').innerHTML,/Não é possível representar/);
  assert.doesNotMatch(byId('rapStackChart').innerHTML,/rap-composition-track/);
});

test('management alerts count changes without modifying original alert definitions',()=>{
  let statuses=[];
  const {byId,context}=harness('renderManagementAlerts','statusAlerts',{
    statusAlerts:()=>statuses,
    qualityAlerts:()=>[],
    expectedMetricAlerts:()=>[],
    financialAlerts:()=>[],
    alertHtml:alert=>'<article class="alert-item">'+alert.type+'</article>'
  });
  context.renderManagementAlerts({});
  assert.equal(byId('managementAlertCount').textContent,'0 avisos');
  assert.match(byId('managementAlerts').innerHTML,/Nenhum alerta gerencial identificado/);
  statuses=[{type:'Inconsistência A'}];
  context.renderManagementAlerts({});
  assert.equal(byId('managementAlertCount').textContent,'1 aviso');
  assert.match(byId('managementAlerts').innerHTML,/Inconsistência A/);
  statuses=[...statuses,{type:'Inconsistência B'}];
  context.renderManagementAlerts({});
  assert.equal(byId('managementAlertCount').textContent,'2 avisos');
  assert.equal((byId('managementAlerts').innerHTML.match(/alert-item/g)||[]).length,2);
});

test('management details are collapsed by default and RAP heading explains the percent denominator',()=>{
  assert.match(html,/<details id="managementAlertsPanel" class="management-alerts">/);
  assert.doesNotMatch(html,/<details id="managementAlertsPanel"[^>]+\sopen(?:\s|>)/);
  assert.match(html,/id="managementAlertCount"/);
  assert.match(html,/id="rapShareMeaning"/);
  assert.match(html,/Base: RAP pago \+ RAP a pagar/);
  assert.match(html,/não o total originalmente inscrito/);
});
