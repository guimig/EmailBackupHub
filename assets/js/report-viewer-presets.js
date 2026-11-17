/* Per-report saved views; stores settings only, never report rows or source JSON. */
(function (root) {
  'use strict';

  const VERSION = 1;
  const MAX_VIEWS = 12;
  const MAX_NAME = 60;
  const MAX_SEARCH = 500;
  const MAX_FILTER = 4000;
  const KEY_PREFIX = 'emailbackuphub:views:v1:';

  function keyFor(report) {
    const slug = String(report?.slug || '').trim();
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(slug)
      ? KEY_PREFIX + encodeURIComponent(slug) : '';
  }

  function safeName(name) {
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    return clean.length >= 1 && clean.length <= MAX_NAME && !/[\u0000-\u001f\u007f]/.test(clean)
      ? clean : null;
  }

  function safeFilter(value, column, report, filters, metaFor) {
    if (typeof value === 'string') {
      return value.trim() && value.length <= 500 ? value : null; // old fN links
    }
    if (!value || Array.isArray(value) || typeof value !== 'object') return null;
    const meta = typeof metaFor === 'function' ? metaFor(column) : filters.columnMeta(report, column);
    if (!filters.validFilter(value, meta)) return null;
    const raw = JSON.stringify(value);
    if (raw.length > MAX_FILTER) return null;
    return JSON.parse(raw);
  }

  function reconcile(report, snapshot, filters, metaFor) {
    const columns = Array.isArray(report?.columns) ? report.columns.filter(item => typeof item === 'string') : [];
    const allowed = new Set(columns);
    const input = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
    const invalidColumns = new Set();
    const checkColumn = column => {
      if (!allowed.has(column)) {
        if (column) invalidColumns.add(String(column));
        return false;
      }
      return true;
    };
    const unique = (value, accept) => Array.isArray(value)
      ? [...new Set(value.filter(item => typeof item === 'string' && checkColumn(item) && (!accept || accept(item))))]
      : [];
    const visible = unique(input.visibleColumns);
    const sums = unique(input.groupSumColumns, column =>
      ['money', 'number'].includes((typeof metaFor === 'function' ? metaFor(column) : filters.columnMeta(report, column)).type)
    );
    const filtered = Object.create(null);
    if (input.columnFilters && typeof input.columnFilters === 'object' && !Array.isArray(input.columnFilters)) {
      for (const [column, spec] of Object.entries(input.columnFilters)) {
        if (!checkColumn(column)) continue;
        const valid = safeFilter(spec, column, report, filters, metaFor);
        if (valid !== null) filtered[column] = valid;
      }
    }
    const widths = Object.create(null);
    if (input.columnWidths && typeof input.columnWidths === 'object' && !Array.isArray(input.columnWidths)) {
      for (const [column, width] of Object.entries(input.columnWidths)) {
        if (!checkColumn(column)) continue;
        if (Number.isInteger(width) && width >= 150 && width <= 720) widths[column] = width;
      }
    }
    const sort = input.sort && typeof input.sort === 'object' && !Array.isArray(input.sort) ? input.sort : {};
    const chosenSort = checkColumn(sort.column) && ['az', 'za'].includes(sort.direction)
      ? { column: sort.column, direction: sort.direction }
      : { column: null, direction: '' };
    const groupColumn = checkColumn(input.groupColumn) ? input.groupColumn : '';
    const baseColumnWidth = Number.isInteger(input.baseColumnWidth) && input.baseColumnWidth >= 150 && input.baseColumnWidth <= 440
      ? input.baseColumnWidth : 250;
    const proposedChart = input.chart && typeof input.chart === 'object' && !Array.isArray(input.chart) ? input.chart : null;
    const chart = proposedChart && ['records','count','sum','wide'].includes(proposedChart.mode)
      ? {
        mode: proposedChart.mode,
        type: ['bar','pie','line'].includes(proposedChart.type) ? proposedChart.type : 'bar',
        dimension: proposedChart.dimension && checkColumn(proposedChart.dimension) ? proposedChart.dimension : '',
        measure: proposedChart.measure && checkColumn(proposedChart.measure) ? proposedChart.measure : '',
        limit: [10,15,30,60].includes(proposedChart.limit) ? proposedChart.limit : 15
      } : null;
    return {
      state: {
        search: typeof input.search === 'string' ? input.search.slice(0, MAX_SEARCH) : '',
        visibleColumns: visible.length ? visible : columns.slice(0, 8),
        columnFilters: filtered,
        sort: chosenSort,
        groupColumn,
        groupSumColumns: sums,
        showTotals: input.showTotals === true,
        pageSize: input.pageSize === 'all' ? 'all'
          : [25, 50, 100, 250, 500, 1000].includes(Number(input.pageSize)) ? Number(input.pageSize) : 50,
        wrapCells: input.wrapCells === true,
        baseColumnWidth,
        columnWidths: widths,
        chart
      },
      removedColumns: [...invalidColumns]
    };
  }

  function capture(report, settings, filters, metaFor) {
    const sanitized = reconcile(report, settings, filters, metaFor);
    return { version: VERSION, ...sanitized.state };
  }

  function read(storage, report) {
    const key = keyFor(report);
    if (!key || !storage) return { views: [], available: false, error: 'Armazenamento local indisponível.' };
    try {
      const raw = storage.getItem(key);
      if (!raw) return { views: [], available: true, error: '' };
      const data = JSON.parse(raw);
      if (!data || data.version !== VERSION || !Array.isArray(data.views)) {
        return { views: [], available: true, error: 'Consultas em formato desconhecido; nada foi sobrescrito.' };
      }
      return { views: data.views.filter(item => item && safeName(item.name)
        && item.snapshot && item.snapshot.version === VERSION).slice(0, MAX_VIEWS),
        available: true, error: '' };
    } catch (error) {
      return { views: [], available: false, error: 'Não foi possível ler as consultas deste navegador.' };
    }
  }

  function save(storage, report, name, settings, filters, metaFor) {
    const cleaned = safeName(name);
    if (!cleaned) return { ok: false, message: 'Informe um nome de até 60 caracteres.' };
    const key = keyFor(report);
    if (!key || !storage) return { ok: false, message: 'Armazenamento local indisponível.' };
    const current = read(storage, report);
    if (!current.available) return { ok: false, message: current.error };
    if (current.error) return { ok: false, message: current.error };
    if (current.views.some(item => item.name.toLocaleLowerCase('pt-BR') === cleaned.toLocaleLowerCase('pt-BR'))) {
      return { ok: false, message: 'Já existe uma consulta com esse nome. Exclua-a para recriar.' };
    }
    if (current.views.length >= MAX_VIEWS) {
      return { ok: false, message: 'Limite de 12 consultas neste relatório. Exclua uma antes de salvar outra.' };
    }
    const snapshot = capture(report, settings, filters, metaFor);
    const next = { version: VERSION, views: [...current.views, {
      name: cleaned, savedAt: new Date().toISOString(), snapshot
    }] };
    try {
      storage.setItem(key, JSON.stringify(next));
      return { ok: true, message: 'Consulta salva neste navegador.', name: cleaned };
    } catch {
      return { ok: false, message: 'O navegador bloqueou o salvamento. Verifique o modo privado ou o espaço disponível.' };
    }
  }

  function remove(storage, report, name) {
    const key = keyFor(report);
    const current = read(storage, report);
    if (!current.available || current.error) return { ok: false, message: current.error };
    const views = current.views.filter(item => item.name !== name);
    if (views.length === current.views.length) return { ok: false, message: 'Consulta não encontrada.' };
    try {
      storage.setItem(key, JSON.stringify({ version: VERSION, views }));
      return { ok: true, message: 'Consulta excluída deste navegador.' };
    } catch {
      return { ok: false, message: 'Não foi possível excluir a consulta no armazenamento do navegador.' };
    }
  }

  const api = { VERSION, MAX_VIEWS, keyFor, reconcile, capture, read, save, remove };
  root.EmailBackupHubSavedViews = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
