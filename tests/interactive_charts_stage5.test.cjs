'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const charts = require('../assets/js/interactive-charts.js');

function mockContainer() {
  const node = {
    innerHTML: '', listeners: new Map(),
    querySelectorAll(selector) {
      const ids = [...this.innerHTML.matchAll(/data-record-index="(\d+)"/g)].map(m=>Number(m[1]));
      return ids.map(id=>({
        dataset:{recordIndex:String(id)},
        addEventListener(event,callback) { node.listeners.set(event+':'+id,callback); }
      }));
    }
  };
  return node;
}

test('column charts always preserve one bar per original record, with repeated labels',()=>{
  const container=mockContainer();
  const selected=[];
  charts.renderCategory(container,[
    {label:'Mesma natureza',value:0,rowIndex:5},
    {label:'Mesma natureza',value:150,rowIndex:9},
    {label:'Ausente',value:null,rowIndex:11}
  ],{onSelect:index=>selected.push(index)});
  assert.equal((container.innerHTML.match(/data-record-index=/g)||[]).length,2);
  assert.match(container.innerHTML,/sem somar registros nem períodos/);
  container.listeners.get('click:9')();
  assert.deepEqual(selected,[9]);
});

test('optional chart respects number, percentage, negative and zero formatting',()=>{
  const container=mockContainer();
  charts.renderCategory(container,[
    {label:'Janeiro',value:0,rowIndex:0},
    {label:'Fevereiro',value:-12.5,rowIndex:1}
  ],{formatValue:value=>value.toFixed(1)+' unidades'});
  assert.match(container.innerHTML,/0.0 unidades/);
  assert.match(container.innerHTML,/-12.5 unidades/);
  assert.match(container.innerHTML,/is-negative/);
  assert.doesNotMatch(container.innerHTML,/R\$/);
});

test('chart is capped at 25 visible records without modifying full source data',()=>{
  const container=mockContainer();
  const original=Array.from({length:40},(_,i)=>({label:'Reg '+i,value:i+1,rowIndex:i}));
  charts.renderCategory(container,original,{limit:25});
  assert.equal((container.innerHTML.match(/data-record-index=/g)||[]).length,25);
  assert.match(container.innerHTML,/Exibindo 25 de 40/);
  assert.equal(original.length,40);
});

test('report viewer includes chart module before its own code and hides charts initially',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../report-viewer.html'),'utf8');
  assert.ok(source.indexOf('interactive-charts.js')<source.indexOf('report-viewer.js'));
  assert.match(source,/<details id="reportChart"/);
  assert.doesNotMatch(source,/<details id="reportChart"[^>]*\sopen(?:\s|>)/);
});
