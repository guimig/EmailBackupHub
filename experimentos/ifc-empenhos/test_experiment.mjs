import test from 'node:test';
import assert from 'node:assert/strict';
import {queryForYear,parseSparql,parseSidra,computeCorrection,generate} from './coletar.mjs';

test('SPARQL usa UO e empenhado e restringe grafo',()=>{const q=queryForYear(2025);assert.match(q,/26422/);assert.match(q,/valorEmpenhado/);assert.match(q,/orcamento.dados.gov.br\/2025/);});
test('SIOP parseia soma e qualidade sem arredondar exercícios',()=>{const d={results:{bindings:[{ano:{value:'2025'},empenhado:{value:'602474851.19'},itens:{value:'88'},atualizadoEm:{value:'2026-11-17T00:00:00'}}]}};const r=parseSparql(d,2025);assert.equal(r.nominal,602474851.19);assert.equal(r.itens,88);});
test('SIOP não converte ausência em zero',()=>{const d={results:{bindings:[]}};assert.equal(parseSparql(d,2009).nominal,null);});
test('SIOP recusa ano incorreto e valor inválido',()=>{const d={results:{bindings:[{ano:{value:'2024'},empenhado:{value:'não há'},itens:{value:'8'}}]}};assert.throws(()=>parseSparql(d,2025));});
test('SIDRA aceita colunas de período, decimais e recusa duplicados divergentes',()=>{const d=[{}, {D3C:'200912',V:'109,22'}, {D3C:'202610',V:'180,54'}];assert.equal(parseSidra(d).get('202610'),180.54);assert.throws(()=>parseSidra([...d,{D3C:'202610',V:'181.00'}]));});
test('corrige índice e preserva zero verdadeiro',()=>{assert.equal(computeCorrection(100,100,150),150);assert.equal(computeCorrection(0,100,150),0);assert.equal(computeCorrection(100,0,150),null);});
test('gera série auditável, identifica lacunas, 2026 parcial e CGU opcional', async()=>{
 const fake = async y=>y===2025?{year:y,nominal:400,status:'ok',itens:4}:y===2026?{year:y,nominal:100,status:'ok',itens:1}:{year:y,status:'ausente',nominal:null,itens:0};
 const values = new Map([['200912',100],['202512',200],['202610',250]]);
 const d=await generate({now:new Date('2026-11-19T11:00:00Z'),fetchYear:fake,fetchIndex:async()=>values,getCgu:async()=>({status:'sem_credencial'})});
 assert.equal(d.anos.length,18);assert.equal(d.anos[0].nominal,null);assert.equal(d.anos.find(x=>x.year===2025).ipca,500);assert.equal(d.anos.find(x=>x.year===2026).status,'parcial');assert.equal(d.anos.find(x=>x.year===2026).ipca,100);assert.equal(d.cgu.status,'sem_credencial');
});