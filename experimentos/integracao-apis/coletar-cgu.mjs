/** Laboratório CGU: consulta documental estritamente separada da produção do Tesouro. */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const UG = '158459';
const BASE = 'https://api.portaldatransparencia.gov.br/api-de-dados/despesas';
const OUTPUT = new URL('./dados/cgu-ug-158459.json', import.meta.url);
const PHASES = { 1: 'Empenho', 2: 'Liquidação', 3: 'Pagamento' };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function parseBRL(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  let amount = value.trim().replace(/\s|R\$/gi, '');
  const parentheses = /^\(.*\)$/.test(amount);
  if (parentheses) amount = amount.slice(1, -1);
  if (!/^-?[\d.,]+$/.test(amount)) return null;
  if (amount.includes(',')) amount = amount.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(?:\.\d{3})+$/.test(amount)) amount = amount.replace(/\./g, '');
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? (parentheses ? -parsed : parsed) : null;
}

function integer(value, fallback, maximum) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw Error('Parâmetro inteiro inválido');
  }
  return number;
}

export function daysToQuery(now = new Date(), lookback = 7) {
  const count = integer(lookback, 7, 31);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric'
  }).formatToParts(now).map(part => [part.type, part.value]));
  const midnight = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(midnight - (count - i) * 86400000);
    return [String(d.getUTCDate()).padStart(2, '0'),
      String(d.getUTCMonth() + 1).padStart(2, '0'), d.getUTCFullYear()].join('/');
  });
}

export function buildUrl(date, phase, page) {
  if (!/^\d{2}\/\d{2}\/20\d{2}$/.test(date) || !PHASES[phase] ||
      !Number.isSafeInteger(page) || page < 1) throw Error('Consulta inválida');
  return BASE + '/documentos?' + new URLSearchParams({
    unidadeGestora: UG, dataEmissao: date, fase: String(phase), pagina: String(page)
  });
}

export function buildImpactedUrl(document, page) {
  // Código documental SIAFI (UG + gestão + identificação do documento), sem entrada livre.
  if (!/^158459\d{5}20\d{2}[A-Z]{2}\d{6}$/.test(document) ||
      !Number.isSafeInteger(page) || page < 1) throw Error('Documento CGU inválido');
  return BASE + '/empenhos-impactados?' + new URLSearchParams({
    codigoDocumento: document, fase: '2', pagina: String(page)
  });
}

async function fetchArray(url, { token, fetcher = fetch, wait = sleep } = {}) {
  if (!token || !token.trim()) throw Error('CGU_API_KEY não configurada');
  for (let attempt = 0; attempt < 4; attempt++) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 25000);
    let response;
    try {
      response = await fetcher(url, { signal: abort.signal, headers: {
        Accept: 'application/json', 'chave-api-dados': token
      } });
    } catch {
      if (attempt === 3) throw Error('CGU indisponível ou tempo esgotado');
      await wait(750 * (attempt + 1));
      continue;
    } finally {
      clearTimeout(timeout);
    }
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
      await wait(750 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw Error('CGU HTTP ' + response.status);
    let body;
    try {
      body = await response.json();
    } catch {
      throw Error('CGU retornou JSON inválido');
    }
    if (!Array.isArray(body)) throw Error('CGU retornou formato inválido');
    return body;
  }
  throw Error('CGU indisponível');
}

export function requestPage(date, phase, page, options) {
  return fetchArray(buildUrl(date, phase, page), options);
}

export function requestImpactedPage(document, page, options) {
  return fetchArray(buildImpactedUrl(document, page), options);
}

export function sanitizeDocument(row, date, phase) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('Registro inválido');
  const unit = String(row.codigoUg ?? row.codigoUG ?? row.unidadeGestora?.codigo ?? '');
  if (unit !== UG) throw Error('Documento sem UG 158459 comprovada');
  const document = String(row.documento || '').trim();
  if (!document || document.length > 96) throw Error('Identificador documental inválido');
  const amount = parseBRL(row.valor);
  // Lista fechada: não persiste observações, fornecedores, CPFs ou CNPJs.
  return { data: date, fase: phase, documento: document,
    valor: amount === null ? null : Math.round(amount * 100) / 100 };
}

function pageSignature(items, keys) {
  // Somente em memória: evita confundir página repetida com fim da paginação.
  return JSON.stringify(items.map(row => keys.map(key => row?.[key] ?? null)));
}

async function boundedMap(items, limit, task) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  }));
  return results;
}

export async function resolveLiquidation(document, {
  token, maxImpactPages = 8, request = requestImpactedPage
} = {}) {
  const limit = integer(maxImpactPages, 8, 30);
  let lineCount = 0;
  let cents = 0;
  const seenPages = new Set();
  try {
    for (let page = 1; page <= limit; page++) {
      const rows = await request(document, page, { token });
      if (!Array.isArray(rows)) throw Error('Página de impacto inválida');
      if (!rows.length) {
        // Sem empenhos impactados não significa liquidação de valor zero.
        return { valor: lineCount ? cents / 100 : null,
          situacao: lineCount ? 'recuperado' : 'sem_impactos', paginas: page };
      }
      const signature = pageSignature(rows, ['empenho', 'subitem', 'valorLiquidado']);
      if (seenPages.has(signature)) {
        return { valor: null, situacao: 'pagina_repetida', paginas: page };
      }
      seenPages.add(signature);
      for (const row of rows) {
        const amount = parseBRL(row?.valorLiquidado);
        if (amount === null || !Number.isSafeInteger(Math.round(amount * 100))) {
          return { valor: null, situacao: 'valor_impactado_invalido', paginas: page };
        }
        cents += Math.round(amount * 100);
        if (!Number.isSafeInteger(cents)) {
          return { valor: null, situacao: 'soma_invalida', paginas: page };
        }
        lineCount++;
      }
    }
    return { valor: null, situacao: 'limite_impactos', paginas: limit };
  } catch {
    // Falha de um documento não impede a visualização da contagem documental,
    // mas jamais produz um total de liquidações não auditável.
    return { valor: null, situacao: 'consulta_impactos_falhou', paginas: 0 };
  }
}

export async function collectPhase(date, phase, {
  token, maxPages = 30, maxImpactPages = 8,
  request = requestPage, requestImpact = requestImpactedPage
} = {}) {
  const limit = integer(maxPages, 30, 80);
  const documents = new Map();
  const seenPages = new Set();
  let complete = false;
  let pages = 0;
  let paginationIssue = null;

  for (let page = 1; page <= limit; page++) {
    const rows = await request(date, phase, page, { token });
    pages++;
    if (!Array.isArray(rows)) throw Error('Página CGU inválida');
    if (!rows.length) {
      complete = true;
      break;
    }
    const signature = pageSignature(rows, ['documento', 'codigoUg', 'valor']);
    if (seenPages.has(signature)) {
      paginationIssue = 'pagina_repetida';
      break;
    }
    seenPages.add(signature);
    for (const row of rows) {
      const item = sanitizeDocument(row, date, phase);
      if (documents.has(item.documento) &&
          documents.get(item.documento).valor !== item.valor) {
        throw Error('Duplicidade documental divergente');
      }
      documents.set(item.documento, item);
    }
  }
  if (!complete && !paginationIssue) paginationIssue = 'limite_paginas';

  const values = [...documents.values()].sort((a, b) =>
    a.documento.localeCompare(b.documento));
  let recovered = 0;
  let impactIssues = 0;
  let impactPages = 0;
  if (phase === 2) {
    const missing = values.filter(value => value.valor === null);
    const resolved = await boundedMap(missing, 2, item =>
      resolveLiquidation(item.documento, {
        token, maxImpactPages, request: requestImpact
      }));
    for (let i = 0; i < missing.length; i++) {
      impactPages += resolved[i].paginas;
      if (resolved[i].valor === null) {
        impactIssues++;
        continue;
      }
      missing[i].valor = resolved[i].valor;
      recovered++;
    }
  }

  const invalid = values.filter(value => value.valor === null).length;
  const cents = values.reduce((acc, value) =>
    acc + (value.valor === null ? 0 : Math.round(value.valor * 100)), 0);
  const safe = Number.isSafeInteger(cents);
  const total = complete && invalid === 0 && safe ? cents / 100 : null;

  return {
    data: date, fase: phase, etapa: PHASES[phase], quantidade: values.length,
    total, completo: complete, valores_invalidos: invalid,
    valores_recuperados_impactos: recovered, consultas_impactos_sem_valor: impactIssues,
    paginas_impactos: impactPages,
    paginas_consultadas: pages,
    ...(paginationIssue ? { motivo_parcial: paginationIssue } : {}),
    amostra: values.slice(0, 8)
  };
}

export async function collectSnapshot({
  now = new Date(), token, lookback = 7, maxPages = 30,
  maxImpactPages = 8, request = requestPage, requestImpact = requestImpactedPage
} = {}) {
  if (!token || !token.trim()) throw Error('CGU_API_KEY não configurada');
  const dates = daysToQuery(now, lookback);
  const queries = dates.flatMap(date => [1, 2, 3].map(phase => ({ date, phase })));
  const rows = await boundedMap(queries, 2, ({ date, phase }) =>
    collectPhase(date, phase, {
      token, maxPages, maxImpactPages, request, requestImpact
    }));

  const phases = [1, 2, 3].map(fase => {
    const selected = rows.filter(row => row.fase === fase);
    const complete = selected.every(row => row.completo);
    const valid = complete && selected.every(row => row.total !== null);
    const cents = valid ? selected.reduce((acc, row) =>
      acc + Math.round(row.total * 100), 0) : null;
    return {
      fase, etapa: PHASES[fase],
      quantidade: selected.reduce((acc, row) => acc + row.quantidade, 0),
      total: valid && Number.isSafeInteger(cents) ? cents / 100 : null,
      valores_invalidos: selected.reduce((acc, row) =>
        acc + row.valores_invalidos, 0),
      valores_recuperados_impactos: selected.reduce((acc, row) =>
        acc + row.valores_recuperados_impactos, 0),
      completo: complete
    };
  });

  return {
    schema_version: 1,
    origem: 'CGU - Portal da Transparência',
    gerado_em: now.toISOString(),
    unidade_gestora: UG,
    unidade_orcamentaria_referencia: '26422',
    criterio: 'Documentos por data de emissão da UG 158459; não são saldos contábeis do Tesouro.',
    data_inicial: dates[0],
    data_final: dates.at(-1),
    qualidade: {
      completo: rows.every(row => row.completo),
      valores_invalidos: rows.reduce((acc, row) => acc + row.valores_invalidos, 0),
      valores_recuperados_impactos: rows.reduce((acc, row) =>
        acc + row.valores_recuperados_impactos, 0),
      observacao: 'Valores das NS recuperados de empenhos impactados quando disponíveis. ' +
        'Sem paginação completa e cobertura monetária total, não divulgar somas. ' +
        'Não equivale aos saldos contábeis do SIAFI.'
    },
    fases: phases,
    dias: rows
  };
}

async function main() {
  const model = await collectSnapshot({
    token: process.env.CGU_API_KEY,
    lookback: process.env.CGU_LOOKBACK_DAYS || 7,
    maxPages: process.env.CGU_MAX_PAGES || 30,
    maxImpactPages: process.env.CGU_MAX_IMPACT_PAGES || 8
  });
  // Única saída persistida: JSON público do laboratório, jamais data/ ou emails/.
  await writeFile(OUTPUT, JSON.stringify(model, null, 2) + '\n', 'utf8');
  console.log('CGU UG 158459: ' + model.dias.length +
    ' consultas; paginação completa: ' + model.qualidade.completo +
    '; valores de NS recuperados: ' + model.qualidade.valores_recuperados_impactos +
    '; valores indisponíveis: ' + model.qualidade.valores_invalidos +
    '; nenhuma credencial ou dado pessoal publicado');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    console.error('Coleta CGU não concluída: ' +
      (error.message.startsWith('CGU HTTP ') || error.message.startsWith('CGU_API_KEY')
        ? error.message : String(error.message).slice(0, 120)));
    process.exitCode = 1;
  });
}
