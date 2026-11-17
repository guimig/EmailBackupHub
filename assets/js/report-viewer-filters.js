/* Generic, conservative filters for the JSON report viewer. No per-report code required. */
(function (root) {
  'use strict';

  const MONTHS = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };
  const VALID_OPS = new Set(['contains', 'equals', 'starts', 'range', 'in', 'is_empty', 'not_empty', 'is_zero', 'not_zero']);
  const NUMERIC = new Set(['money', 'number', 'percent']);
  const MAX_VALUES = 120;

  function text(value) {
    return String(value ?? '').trim();
  }

  function normalize(value) {
    return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function isEmpty(value) {
    if (value === null || value === undefined) return true;
    return new Set(['', '-', '--', 'n/a', 'na', 'null', 'none', 'sem dado']).has(normalize(value));
  }

  function parseNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'boolean' || isEmpty(value)) return null;
    let raw = text(value);
    const negative = raw.startsWith('(') && raw.endsWith(')');
    if (negative) raw = raw.slice(1, -1).trim();
    raw = raw.replace(/^R\$\s*/i, '').replace(/\s*%$/, '').trim();
    if (!/^[+-]?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)$/.test(raw)) return null;
    if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
    else if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, '');
    const number = Number(raw);
    return Number.isFinite(number) ? (negative ? -number : number) : null;
  }

  function parseDate(value) {
    const raw = text(value);
    const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!br && !iso) return null;
    const year = Number(br ? br[3] : iso[1]);
    const month = Number(br ? br[2] : iso[2]);
    const day = Number(br ? br[1] : iso[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
    return year * 10000 + month * 100 + day;
  }

  function periodCode(value) {
    const match = /^(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ|0\d{2}|\d{2})\/(20\d{2})$/i.exec(text(value));
    if (!match) return null;
    const number = MONTHS[match[1].toUpperCase()] || Number(match[1]);
    return number >= 1 && number <= 14 ? Number(match[2]) * 100 + number : null;
  }

  function columnMeta(report, column) {
    const schema = report?.column_schema;
    const item = Array.isArray(schema) ? schema.find(entry => entry && entry.name === column) : null;
    if (item && typeof item.type === 'string') return item;
    const header = normalize(column);
    // Identifiers outrank numeric-looking values. Unknown columns stay textual.
    if (/(cpf|cnpj|ptres|\brip\b|ne ccor|conta contabil|fonte recurso|natureza despesa|codigo|c[oó]d\.?|num\.? processo|uasg|unidade orcamentaria)/.test(header)) {
      return { name: column, type: 'identifier', filter_kind: 'text', confidence: 'low' };
    }
    if (/(r\$|saldo|valor|empenhad|liquidad|movim liquido|credito disponivel|arrecadad|provisionad)/.test(header)) {
      return { name: column, type: 'money', filter_kind: 'numeric_range', confidence: 'low' };
    }
    if (/(percentual|porcentagem|%)/.test(header)) return { name: column, type: 'percent', filter_kind: 'numeric_range' };
    if (/(data|emissao - dia|vencimento)/.test(header)) return { name: column, type: 'date', filter_kind: 'date_range' };
    if (/(mes|competencia|periodo|exercicio)/.test(header)) return { name: column, type: 'period', filter_kind: 'period' };
    return { name: column, type: 'text', filter_kind: 'text', confidence: 'low' };
  }

  function filterKind(meta) {
    const type = meta?.type || 'text';
    if (NUMERIC.has(type)) return 'numeric';
    if (type === 'date') return 'date';
    if (type === 'category' || type === 'boolean' || type === 'period') return 'choices';
    return 'text';
  }

  function validFilter(filter, meta) {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter) || !VALID_OPS.has(filter.op)) return false;
    if (filter.op === 'is_empty' || filter.op === 'not_empty') return true;
    const kind = filterKind(meta);
    if (filter.op === 'is_zero' || filter.op === 'not_zero') return kind === 'numeric';
    if (filter.op === 'range') {
      if (kind !== 'numeric' && kind !== 'date') return false;
      if (isEmpty(filter.min) && isEmpty(filter.max)) return false;
      const parse = kind === 'date' ? parseDate : parseNumber;
      return (isEmpty(filter.min) || parse(filter.min) !== null)
        && (isEmpty(filter.max) || parse(filter.max) !== null)
        && (isEmpty(filter.min) || isEmpty(filter.max) || parse(filter.min) <= parse(filter.max));
    }
    if (filter.op === 'in') return kind === 'choices' && Array.isArray(filter.values)
      && filter.values.length > 0 && filter.values.length <= MAX_VALUES
      && filter.values.every(value => typeof value === 'string' && value.length <= 500);
    if (filter.op === 'contains' || filter.op === 'starts' || filter.op === 'equals') {
      return kind === 'text' && typeof filter.value === 'string' && filter.value.trim().length > 0 && filter.value.length <= 500;
    }
    return false;
  }

  function matches(value, filter, meta) {
    if (!filter) return true;
    if (!validFilter(filter, meta)) return false; // Invalid URL filters must not silently broaden results.
    if (filter.op === 'is_empty') return isEmpty(value);
    if (filter.op === 'not_empty') return !isEmpty(value);
    if (filter.op === 'in') return filter.values.includes(text(value));
    if (filter.op === 'contains') return normalize(value).includes(normalize(filter.value));
    if (filter.op === 'starts') return normalize(value).startsWith(normalize(filter.value));
    if (filter.op === 'equals') return normalize(value) === normalize(filter.value);
    if (filter.op === 'range') {
      const kind = filterKind(meta);
      const parse = kind === 'date' ? parseDate : parseNumber;
      const number = parse(value);
      if (number === null) return false;
      return (isEmpty(filter.min) || number >= parse(filter.min))
        && (isEmpty(filter.max) || number <= parse(filter.max));
    }
    const number = parseNumber(value);
    if (number === null) return false;
    return filter.op === 'is_zero' ? number === 0 : number !== 0;
  }

  function compare(a, b, meta) {
    const emptyA = isEmpty(a), emptyB = isEmpty(b);
    if (emptyA !== emptyB) return emptyA ? 1 : -1;
    if (emptyA) return 0;
    const kind = filterKind(meta);
    const parse = kind === 'numeric' ? parseNumber : kind === 'date' ? parseDate
      : meta?.type === 'period' ? periodCode : null;
    if (parse) {
      const av = parse(a), bv = parse(b);
      if (av !== null && bv !== null) return av - bv;
      if (av === null && bv !== null) return 1;
      if (av !== null && bv === null) return -1;
    }
    return text(a).localeCompare(text(b), 'pt-BR', { sensitivity: 'base', numeric: false });
  }

  function distinctOptions(rows, column, meta, limit = MAX_VALUES) {
    const values = new Set();
    for (const item of rows || []) {
      const value = text((item.raw || item)[column]);
      if (!value) continue;
      values.add(value);
      if (values.size > limit) return null; // High-cardinality columns must use text filter.
    }
    return [...values].sort((a, b) => compare(a, b, meta));
  }

  function describe(filter, meta) {
    if (!filter) return '';
    const labels = { is_empty: 'vazio', not_empty: 'preenchido', is_zero: 'igual a zero', not_zero: 'diferente de zero' };
    if (labels[filter.op]) return labels[filter.op];
    if (filter.op === 'in') return (filter.values || []).join(', ');
    if (filter.op === 'range') {
      return [filter.min ? 'de ' + filter.min : '', filter.max ? 'até ' + filter.max : ''].filter(Boolean).join(' ');
    }
    const names = { contains: 'contém', starts: 'começa com', equals: 'igual a' };
    return (names[filter.op] || filter.op) + ' ' + (filter.value || '');
  }

  const api = { parseNumber, parseDate, periodCode, columnMeta, filterKind, validFilter, matches, compare, distinctOptions, describe, isEmpty, normalize };
  root.EmailBackupHubFilters = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
