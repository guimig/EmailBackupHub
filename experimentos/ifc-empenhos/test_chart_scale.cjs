'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const scaleSource = fs.readFileSync(path.join(dir, 'chart-scale.js'), 'utf8');
function getScale() {
  const context = vm.createContext({Intl, globalThis: {}});
  vm.runInContext(scaleSource, context, {filename: 'chart-scale.js'});
  return context.globalThis.IFCChartScale;
}
const api = getScale();

function points(first, last, nominal, corrected) {
  return Array.from({length:last - first + 1}, (_, i) => ({
    year:first + i, nominal:nominal(i), ipca:corrected(i), inpc:corrected(i) * .98
  }));
}

test('UG Araquari ajusta eixo X ao início real e Y a 20 milhões, sem teto fixo de 100 milhões', () => {
  const p = points(2014, 2026, i => 7e6 + i * 1e5, i => i === 0 ? 17.4e6 : 15e6 - i * 7e5);
  const result = api.compute(p, ['nominal','ipca']);
  assert.equal(result.x.min, 2014);
  assert.equal(result.x.max, 2026);
  assert.equal(result.y.max, 20e6);
  assert.equal(result.unit.label, 'R$ milhões');
  assert.equal(result.y.ticks.length, 5);
  assert.equal(result.x.ticks.at(-1), 2026);
});

test('UO IFC adapta escala na casa de centenas de milhões', () => {
  const p = points(2009, 2026, i => i * 30e6, i => i * 35e6);
  const result = api.compute(p, ['nominal','ipca']);
  assert.equal(result.x.min, 2009);
  assert.equal(result.x.max, 2026);
  assert.ok(result.y.max >= 17 * 35e6);
  assert.ok(result.y.max < 1e9);
  assert.ok(result.y.ticks.length >= 4 && result.y.ticks.length <= 8);
});

test('muda limite Y ao ocultar uma série ou trocar índice', () => {
  const p = [{year:2024,nominal:5e6,ipca:12e6,inpc:7e6}, {year:2025,nominal:4e6,ipca:11e6,inpc:6e6}];
  const nominal = api.compute(p,['nominal']);
  const ipca = api.compute(p,['ipca']);
  const inpc = api.compute(p,['inpc']);
  assert.ok(nominal.y.max < inpc.y.max && inpc.y.max < ipca.y.max);
});

test('ano futuro excepcional estende ambos os eixos automaticamente', () => {
  const p = [{year:2024,nominal:5e6,ipca:7e6}, {year:2034,nominal:2e9,ipca:2.2e9}];
  const result = api.compute(p, ['nominal','ipca']);
  assert.equal(result.x.max,2034);
  assert.ok(result.y.max >= 2.2e9);
  assert.equal(result.unit.label,'R$ bilhões');
});

test('ignora valores ausentes e não converte null em zero', () => {
  const p = [{year:2009,nominal:null,ipca:null}, {year:2014,nominal:0,ipca:null}, {year:2015,nominal:8e6,ipca:10e6}];
  const result=api.compute(p,['nominal','ipca']);
  assert.equal(result.x.min,2014);
  assert.equal(result.x.max,2015);
});

test('série com apenas um ano mantém faixa horizontal válida', () => {
  const result=api.compute([{year:2025,nominal:9e6,ipca:11e6}],['nominal','ipca']);
  assert.equal(result.x.min,result.x.max);
  assert.equal(result.x.ticks.length,1);
  assert.ok(result.y.max > 11e6);
});

test('série zerada tem ticks não degenerados', () => {
  const result=api.compute([{year:2009,nominal:0,ipca:0}],['nominal','ipca']);
  assert.ok(result.y.max > 0);
  assert.equal(result.y.ticks[0],0);
});

test('série vazia, desativada ou inválida não gera domínio fictício', () => {
  assert.equal(api.compute([],['nominal']),null);
  assert.equal(api.compute([{year:2015,nominal:null}],['nominal']),null);
  assert.equal(api.compute([{year:2015,nominal:15}],[]),null);
  assert.equal(api.compute([{year:2015,nominal:Infinity}],['nominal']),null);
});

test('rótulos móveis são menos numerosos sem perder primeiro e último ano', () => {
  const p=points(2014,2035,()=>1e6,()=>2e6);
  const desktop=api.compute(p,['nominal','ipca']);
  const mobile=api.compute(p,['nominal','ipca'],{mobile:true});
  assert.ok(mobile.x.ticks.length < desktop.x.ticks.length);
  assert.equal(mobile.x.ticks[0],2014);
  assert.equal(mobile.x.ticks.at(-1),2035);
});

test('unidades e rótulos legíveis em diferentes magnitudes', () => {
  assert.equal(api.compute([{year:2025,nominal:500}],['nominal']).unit.label,'R$');
  assert.equal(api.compute([{year:2025,nominal:25000}],['nominal']).unit.label,'R$ mil');
  assert.equal(api.formatTick(2.5,2.5),'2,5');
});

for(const filename of ['index.html','araquari.html']) {
  test(`integração em ${filename}: escala compartilhada e JavaScript embutido sintaticamente correto`, () => {
    const html=fs.readFileSync(path.join(dir,filename),'utf8');
    assert.match(html,/<script src="\.\/chart-scale\.js"><\/script>/);
    assert.match(html,/IFCChartScale\.compute\(points,lines\.map\(line=>line\.key\)/);
    assert.match(html,/IFCChartScale\.formatTick/);
    assert.doesNotMatch(html,/Math\.min\(2009,\.\.\.allYears\)/);
    assert.doesNotMatch(html,/Math\.max\(2026,\.\.\.allYears\)/);
    const inline=html.match(/<script>\s*([\s\S]*?)<\/script>/);
    assert.ok(inline,'script embutido esperado');
    new vm.Script(inline[1],{filename});
  });
}