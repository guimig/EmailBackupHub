/** Experimento isolado IFC. Consulta fontes oficiais; grava somente ./dados.json.
 * Não importa nem altera módulos do processamento do Tesouro Gerencial.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const HERE = new URL('./dados.json', import.meta.url);
const START_YEAR = 2009;
const UO = '26422';
const SPARQL = 'https://www1.siop.planejamento.gov.br/sparql/';
const CGU = 'https://api.portaldatransparencia.gov.br/api-de-dados/despesas/por-orgao';
const SERIES = {
  IPCA: 'https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/all',
  INPC: 'https://apisidra.ibge.gov.br/values/t/1736/n1/all/v/2289/p/all',
};

export function queryForYear(year) {
  if (!Number.isInteger(year) || year < START_YEAR || year > 2100) throw new Error('Exercicio invalido');
  return `PREFIX loa: <http://vocab.e.gov.br/2013/09/loa#>\nSELECT ?ano ?atualizadoEm (SUM(?valor) AS ?empenhado) (COUNT(?item) AS ?itens) WHERE {\n GRAPH <http://orcamento.dados.gov.br/${year}/> {\n  ?item a loa:ItemDespesa ; loa:temExercicio ?exercicio ;\n        loa:temUnidadeOrcamentaria ?uo ; loa:valorEmpenhado ?valor .\n  ?uo loa:codigo "${UO}" .\n  ?exercicio loa:identificador ?ano ; loa:dataUltimaAtualizacao ?atualizadoEm .\n }\n} GROUP BY ?ano ?atualizadoEm`;
}

async function fetchWithTimeout(url, options = {}, ms = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal,
      headers: { 'User-Agent': 'IFC-Emprenhos-Historicos-Experimental/1.0', ...options.headers } });
  } finally { clearTimeout(timer); }
}

export function parseSparql(payload, year) {
  const records = payload?.results?.bindings;
  if (!Array.isArray(records)) throw new Error('Formato JSON do SIOP inesperado');
  if (records.length === 0) return { year, status: 'ausente', nominal: null, itens: 0 };
  if (records.length !== 1) throw new Error('SIOP retornou mais de uma agregacao para o exercicio');
  const row = records[0];
  const returnedYear = Number(row.ano?.value);
  const amount = Number(row.empenhado?.value);
  const count = Number(row.itens?.value);
  if (returnedYear !== year || !Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(count) || count <= 0) {
    throw new Error('SIOP: exercicio, valor ou quantidade inconsistentes');
  }
  return {
    year, nominal: Math.round((amount + Number.EPSILON) * 100) / 100,
    itens: count, status: 'ok', carregadoEm: String(row.atualizadoEm?.value || ''),
  };
}

async function fetchSIOP(year) {
  const query = queryForYear(year);
  const options = { method: 'POST', headers: {
    Accept: 'application/sparql-results+json',
    'Content-Type': 'application/x-www-form-urlencoded',
  }, body: new URLSearchParams({ query }) };
  let response;
  try { response = await fetchWithTimeout(SPARQL, options); }
  catch { response = null; }
  if (!response?.ok) {
    const getUrl = SPARQL + '?' + new URLSearchParams({ query, format: 'application/sparql-results+json' });
    response = await fetchWithTimeout(getUrl, { headers: { Accept: 'application/sparql-results+json' } });
  }
  if (!response.ok) throw new Error(`SIOP HTTP ${response.status}`);
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('SIOP nao devolveu JSON SPARQL'); }
  return parseSparql(payload, year);
}

export function parseSidra(payload) {
  if (!Array.isArray(payload) || payload.length < 2) throw new Error('SIDRA: tabela vazia ou inesperada');
  const rows = new Map();
  for (const item of payload.slice(1)) {
    const periods = Object.entries(item).filter(([key, value]) => /^D\d+C$/.test(key) && /^20\d{4}$/.test(String(value)));
    if (periods.length !== 1) continue;
    const period = String(periods[0][1]);
    const month = Number(period.slice(4));
    const index = Number(String(item.V).replace(',', '.'));
    if (month < 1 || month > 12 || !Number.isFinite(index) || index <= 0) continue;
    if (rows.has(period) && rows.get(period) !== index) throw new Error('SIDRA: indice mensal duplicado e divergente');
    rows.set(period, index);
  }
  if (!rows.has('200912')) throw new Error('SIDRA: falta indice dezembro/2009');
  return rows;
}

async function fetchSidra(url) {
  const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 30000);
  if (!response.ok) throw new Error(`SIDRA HTTP ${response.status}`);
  const payload = await response.json();
  return parseSidra(payload);
}

export function computeCorrection(amount, indexBase, indexReference) {
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(indexBase) || indexBase <= 0 || !Number.isFinite(indexReference) || indexReference <= 0) return null;
  return Math.round((amount * indexReference / indexBase + Number.EPSILON) * 100) / 100;
}

function publicError(error) {
  return String(error?.message || error || 'Erro desconhecido').slice(0, 150);
}

async function cguDiagnostic() {
  const secret = process.env.CGU_API_KEY;
  if (!secret) return { status: 'sem_credencial', info: 'Opcional. Nenhuma chave foi configurada; nao houve consulta CGU.' };
  try {
    const url = CGU + '?' + new URLSearchParams({ ano: '2025', orgao: UO, pagina: '1' });
    const response = await fetchWithTimeout(url, { headers: { 'chave-api-dados': secret, Accept: 'application/json' } });
    if (!response.ok) return { status: 'falha', info: `CGU HTTP ${response.status}` };
    const data = await response.json();
    if (!Array.isArray(data)) return { status: 'formato_incompativel', info: 'Resposta nao e lista; conferir contrato da API.' };
    // Nao comparamos recortes UG/órgão x UO sem classificacao correspondente.
    return { status: 'consultado_nao_conciliado', ano: 2025, registros: data.length,
      campos: data[0] && typeof data[0] === 'object' ? Object.keys(data[0]).sort() : [],
      info: 'Consulta efetuada. A classificacao institucional requer verificacao antes de comparar totais.' };
  } catch (error) { return { status: 'falha', info: publicError(error) }; }
}

async function mapLimited(items, limit, fn) {
  let cursor = 0;
  const result = new Array(items.length);
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const at = cursor++;
      result[at] = await fn(items[at]);
    }
  });
  await Promise.all(workers);
  return result;
}

export async function generate({ now = new Date(), fetchYear = fetchSIOP, fetchIndex = fetchSidra,
  getCgu = cguDiagnostic } = {}) {
  const endYear = now.getUTCFullYear();
  if (endYear < START_YEAR || endYear > 2100) throw new Error('Ano atual fora da faixa prevista');
  // O teste sentinela impede 18 consultas simultaneas quando o endpoint esta indisponivel.
  const sentinela = await fetchYear(2025);
  if (sentinela.status !== 'ok') throw new Error('SIOP: 2025 nao retornou um total confiavel');
  const remaining = Array.from({ length: endYear - START_YEAR + 1 }, (_, i) => START_YEAR + i)
    .filter(year => year !== 2025);
  const values = await mapLimited(remaining, 3, async year => {
    try { return await fetchYear(year); }
    catch (error) { return { year, status: 'falha', nominal: null, info: publicError(error) }; }
  });
  const datasets = Object.fromEntries(await Promise.all(Object.entries(SERIES).map(async ([name, url]) => {
    try { return [name, { status: 'ok', values: await fetchIndex(url) }]; }
    catch (error) { return [name, { status: 'falha', values: new Map(), info: publicError(error) }]; }
  })));
  const latest = Object.fromEntries(Object.entries(datasets).map(([name, data]) =>
    [name, data.values.size ? [...data.values.keys()].sort().at(-1) : null]));
  const references = Object.values(latest).filter(Boolean);
  const reference = references.length === 2 ? references.sort()[0] : null;
  const rows = [...values, sentinela].sort((a, b) => a.year - b.year).map(row => {
    const annualBase = row.year === endYear ? reference : `${row.year}12`;
    const corrected = {};
    for (const name of Object.keys(SERIES)) {
      const values = datasets[name].values;
      corrected[name] = row.status === 'ok' && reference ? computeCorrection(
        row.nominal, values.get(annualBase), values.get(reference)) : null;
    }
    return { ...row, ...(row.year === endYear && row.status === 'ok' ? { status: 'parcial' } : {}),
      ipca: corrected.IPCA, inpc: corrected.INPC, referencia: annualBase || null };
  });
  const cgu = await getCgu();
  return { schema_version: 1, gerado_em: now.toISOString(), unidade_orcamentaria: UO,
    criterio: 'Empenho executado da unidade orcamentaria (UO) 26422, nao total por UG',
    siop: { endpoint: SPARQL, codigo: UO, anos_ok: rows.filter(r => ['ok', 'parcial'].includes(r.status)).length },
    sidra: { referencia: reference, ultima_competencia: latest,
      status: Object.fromEntries(Object.entries(datasets).map(([name, data]) => [name, { status: data.status, info: data.info || '' }])) },
    cgu, anos: rows };
}

async function run() {
  const result = await generate();
  if (!result.siop.anos_ok) throw new Error('Nenhum dado oficial recuperado: JSON nao substituido');
  // Saida so no experimento. Nunca sobrescrever arquivos do Tesouro.
  const serialized = JSON.stringify(result, null, 2) + '\n';
  await writeFile(HERE, serialized, { encoding: 'utf-8', flag: 'w' });
  console.log(`SIOP: ${result.siop.anos_ok} exercicios, SIDRA ref ${result.sidra.referencia || 'indisponivel'}, CGU ${result.cgu.status}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run().catch(error => { console.error('Falha na coleta experimental:', publicError(error)); process.exitCode = 1; });
}