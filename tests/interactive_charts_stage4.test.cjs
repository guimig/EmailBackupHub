'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const charts = require('../assets/js/interactive-charts.js');

test('dates accept real civil dates, reject noncivil and SIAFI 013/014 as calendar dates',()=>{
  assert.deepEqual(charts.isoDate('02/11/2026'),{iso:'2026-11-02',time:Date.UTC(2026,10,2)});
  assert.equal(charts.isoDate('31/02/2026'),null);
  assert.equal(charts.isoDate('013/2025'),null);
  assert.equal(charts.isoDate('014/2025'),null);
});

test('history ordering uses timestamp and excludes absent, unsafe values',()=>{
  const original=[{label:'Liquidado',color:'green',points:[
    {dateIso:'2026-11-12',value:10},
    {dateIso:'2026-01-01',value:100},
    {dateIso:'2026-05-12',value:null},
    {dateIso:'2026-06-01',value:Number.NaN},
    {dateIso:'2026-09-01',value:50}
  ]}];
  const prepared=charts.prepareTimeSeries(original,0);
  assert.deepEqual(prepared.series[0].points.map(p=>p.date),[
    '2026-01-01','2026-09-01','2026-11-12'
  ]);
  assert.deepEqual(prepared.series[0].points.map(p=>p.value),[100,50,10]);
  assert.equal(original[0].points.length,5); // Non-destructive.
});

test('history range anchors on latest AVAILABLE source date, not todays system time',()=>{
  const series=[{label:'Pago',points:[
    {dateIso:'2026-04-01',value:100},
    {dateIso:'2026-04-05',value:200},
    {dateIso:'2026-04-30',value:300}
  ]}];
  assert.deepEqual(charts.prepareTimeSeries(series,30).series[0].points.map(p=>p.value),[100,200,300]);
  assert.deepEqual(charts.prepareTimeSeries(series, 90, ['Pago']).series,[]);
  assert.deepEqual(charts.prepareTimeSeries(series, 0).series[0].points.map(p=>p.value),[100,200,300]);
  assert.equal(charts.prepareTimeSeries(series,999).days,0);
});

test('SVG does not connect gaps longer than 45 days and supports real date axis',()=>{
  const html={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  charts.renderTime(html,[{label:'Empenhado',color:'#fff',points:[
    {dateIso:'2026-01-01',value:1},
    {dateIso:'2026-01-02',value:2},
    {dateIso:'2026-06-01',value:3}
  ]}],{rangeDays:0,reportUrl:'report-viewer.html?report=test'});
  assert.match(html.innerHTML,/history-point/);
  assert.match(html.innerHTML,/Consultar relatório/);
  assert.match(html.innerHTML,/Eixo horizontal proporcional/);
  const pathPoints=html.innerHTML.match(/<path d="([^"]+)" fill="none"/);
  assert.ok(pathPoints);
  assert.equal((pathPoints[1].match(/M/g)||[]).length,2,'Long intervals must start a new segment');
  assert.equal((pathPoints[1].match(/L/g)||[]).length,1,'Only consecutive dates connected');
});

test('no reliable data is shown as unavailable rather than numeric zero',()=>{
  const html={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  charts.renderTime(html,[{label:'Saldo',points:[{dateIso:'2026-01-01',value:null}]}],{rangeDays:0});
  assert.match(html.innerHTML,/Sem pontos confiáveis/);
  assert.doesNotMatch(html.innerHTML,/R\$ ?0,00/);
});

test('categorical bars never aggregate and preserve original row identifiers',()=>{
  const html={innerHTML:'',querySelectorAll:()=>[]};
  charts.renderCategory(html,[
    {label:'RAP',value:0,rowIndex:7},
    {label:'RAP',value:20,rowIndex:12},
    {label:'RAP',value:null,rowIndex:14}
  ]);
  assert.equal((html.innerHTML.match(/data-record-index=/g)||[]).length,2);
  assert.match(html.innerHTML,/data-record-index="7"/);
  assert.match(html.innerHTML,/data-record-index="12"/);
  assert.match(html.innerHTML,/sem somar registros nem períodos/);
});

test('dashboard loads reusable chart script before page code',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','dashboard.html'),'utf8');
  assert.ok(source.indexOf('interactive-charts.js')>0);
  assert.ok(source.indexOf('interactive-charts.js')<source.indexOf('dashboard.js'));
  assert.match(source,/id="historyRange"/);
});
