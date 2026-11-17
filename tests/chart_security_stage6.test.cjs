'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const charts = require('../assets/js/interactive-charts.js');

function container() {
  return {innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
}

test('malicious category labels are escaped before inserting HTML',()=>{
  const el=container();
  charts.renderCategory(el,[{
    rowIndex:0,value:10,
    label:'<img src=x onerror=alert(1)>'
  }]);
  assert.ok(el.innerHTML.includes('&lt;img'));
  assert.ok(!el.innerHTML.includes('<img src=x onerror='));
});

test('historical series escape labels without changing numeric values',()=>{
  const el=container();
  charts.renderTime(el,[{
    label:'<script>alert(1)</script>',
    color:'var(--accent)',
    points:[
      {dateIso:'2026-01-01',value:0},
      {dateIso:'2026-01-02',value:1}
    ]
  }],{reportUrl:'report-viewer.html?report=data/reports/demo.json'});
  assert.ok(el.innerHTML.includes('&lt;script&gt;'));
  assert.ok(!el.innerHTML.includes('<script>alert(1)</script>'));
  assert.match(el.innerHTML,/data-value="0"/);
});

test('non-finite values and invalid dates are never drawn as zero',()=>{
  const el=container();
  charts.renderTime(el,[{label:'Valores',points:[
    {dateIso:'2026-02-30',value:25},
    {dateIso:'2026-02-28',value:Infinity},
    {dateIso:'2026-01-01',value:0}
  ]}]);
  assert.equal((el.innerHTML.match(/class="history-point"/g)||[]).length,1);
  assert.match(el.innerHTML,/data-value="0"/);
});
