let report = null;
    let columnFilters = {};
    let columnSort = { column: null, direction: '' };
    let visibleColumns = new Set();
    let groupColumn = '';
    let groupSumColumns = new Set();
    let renderTimer = null;
    let restoringState = false;
    let reportDefinitions = {};
    const Filters = window.EmailBackupHubFilters;
    const SavedViews = window.EmailBackupHubSavedViews;
    const Charts = window.EmailBackupHubCharts;
    const ChartExplorer = window.EmailBackupHubChartExplorer;
    let chartSettings = null;
    let chartRecommended = null;
    let chartSelectedRow = null;
    let filterColumn = null;
    let currentPage = 1;
    let pageSize = 50;
    let filteredCache = null;
    let columnMetaCache = new Map();
    let columnOptionsCache = new Map();
    let displayedRows = [];
    let baseColumnWidth = 250;
    let columnWidths = new Map();
    let expanded = false;
    const byId = id => document.getElementById(id);

    const THEME_KEY = 'dap-dashboard-theme';

    function applyTheme(theme) {
      const nextTheme = theme === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = nextTheme;
      try { localStorage.setItem(THEME_KEY, nextTheme); } catch {}
      const button = byId('themeToggle');
      if (button) button.textContent = nextTheme === 'dark' ? 'Tema claro' : 'Tema escuro';
    }

    function initTheme() {
      let storedTheme = 'dark';
      try { storedTheme = localStorage.getItem(THEME_KEY) || 'dark'; } catch {}
      applyTheme(storedTheme);
    }

    const normalize = text => (text || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const infoQualityCodes = new Set(['date_from_filename', 'date_from_mtime', 'inconsistent_columns', 'totals_separated']);
    const qualityLabels = {
      date_from_filename: 'data obtida pelo nome do arquivo',
      date_from_mtime: 'data obtida pela modificação do arquivo',
      inconsistent_columns: 'largura de linhas normalizada',
      totals_separated: 'totais separados da tabela principal',
      rap_metric_unavailable: 'RAP sem linha de total geral confiável',
      rap_metric_invalid: 'RAP com métrica monetária inválida ou suspeita'
    };
    const reportFriendlyNames = {
      '2024-acompanhamento-das-liquidacoes-e-pagamentos-por-natureza-de-despesa': 'Liquida\u00e7\u00f5es e Pagamentos por Natureza - 2024',
      '2025-acompanhamento-das-liquidacoes-e-pagamentos-por-natureza-de-despesa': 'Liquida\u00e7\u00f5es e Pagamentos por Natureza - 2025',
      'acompanhamento-das-liquidacoes-e-pagamentos-por-data': 'Liquida\u00e7\u00f5es e Pagamentos por Data',
      'acompanhamento-das-liquidacoes-e-pagamentos-por-natureza-de-despesa': 'Liquida\u00e7\u00f5es e Pagamentos por Natureza',
      'credito-disponivel-mes-lancamento': 'Cr\u00e9dito Dispon\u00edvel por M\u00eas de Lan\u00e7amento',
      'despesas-empenhadas-liquidadas-e-pagas-2024': 'Despesas Empenhadas, Liquidadas e Pagas - 2024',
      'despesas-empenhadas-liquidadas-e-pagas-2025': 'Despesas Empenhadas, Liquidadas e Pagas - 2025',
      'despesas-empenhadas-liquidadas-e-pagas-mes-lancamento': 'Despesas Empenhadas, Liquidadas e Pagas por M\u00eas',
      'despesas-empenhadas-liquidadas-e-pagas-strictu-sensu': 'Despesas Empenhadas, Liquidadas e Pagas - Stricto Sensu',
      'evolucao-das-despesas-empenhadas': 'Evolu\u00e7\u00e3o das Despesas Empenhadas',
      'imoveis-por-ug-conta-contabil-e-rip': 'Im\u00f3veis por UG, Conta Cont\u00e1bil e RIP',
      'limite-de-saque-conta-contabil': 'Limite de Saque por Conta Cont\u00e1bil',
      'provisionamentos': 'Provisionamentos',
      'recolhimento-proprio-gru': 'Recolhimento Pr\u00f3prio - GRU',
      'restos-a-pagar-rap': 'Restos a Pagar - RAP',
      'saldo-de-empenhos-a-liquidar-mes-a-mes': 'Saldo de Empenhos a Liquidar M\u00eas a M\u00eas',
      'saldo-patrimonio-e-almoxarifado-conta-contabil': 'Saldo de Patrim\u00f4nio e Almoxarifado por Conta Cont\u00e1bil',
      'saldo-por-natureza-de-despesa': 'Saldo por Natureza de Despesa',
      'saldos-de-contas-de-contratos': 'Saldos de Contas de Contratos',
      'saldos-de-empenhos-do-exercicio-conta-contabil': 'Saldos de Empenhos do Exerc\u00edcio por Conta Cont\u00e1bil',
      'suprimento-de-fundos-empenhos': 'Suprimento de Fundos - Empenhos',
      'suprimento-de-fundos-liquidacoes-e-pagamentos': 'Suprimento de Fundos - Liquida\u00e7\u00f5es e Pagamentos'
    };
    const columnFriendlyNames = {
      'acompanhamento-das-liquidacoes-e-pagamentos-por-data': ['Data', 'Empenhado', 'Liquidado', 'Pago', 'Saldo a Liquidar'],
      'acompanhamento-das-liquidacoes-e-pagamentos-por-natureza-de-despesa': ['Natureza de Despesa', 'Empenhado', 'Liquidado', 'Pago', 'Saldo a Liquidar'],
      'credito-disponivel-mes-lancamento': ['Mes', 'Credito Inicial', 'Credito Atualizado', 'Credito Disponivel'],
      'despesas-empenhadas-liquidadas-e-pagas-mes-lancamento': ['Mes', 'Empenhado', 'Liquidado', 'Pago', 'Liquidado a Pagar'],
      'despesas-empenhadas-liquidadas-e-pagas-strictu-sensu': ['Natureza de Despesa', 'Empenhado', 'Liquidado', 'Pago', 'Liquidado a Pagar'],
      'recolhimento-proprio-gru': ['Unidade Gestora', 'Codigo de Recolhimento', 'Descricao', 'Arrecadado'],
      'restos-a-pagar-rap': ['Unidade Gestora', 'Natureza de Despesa', 'Inscrito', 'Cancelado', 'Pago', 'A Pagar', '% Pago'],
      'saldo-de-empenhos-a-liquidar-mes-a-mes': ['Natureza de Despesa', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', 'Total a Liquidar'],
      'saldos-de-empenhos-do-exercicio-conta-contabil': ['Conta Contabil', 'Empenhado', 'A Liquidar', 'Liquidado a Pagar', 'Pago']
    };
    const reportHighlightRules = {
      'restos-a-pagar-rap': [
        ['RAP inscrito', 'Valor 9'],
        ['RAP cancelado', 'Valor 10'],
        ['RAP pago', 'Valor 11'],
        ['RAP a pagar', 'Valor 12']
      ],
      'despesas-empenhadas-liquidadas-e-pagas-mes-lancamento': [
        ['Despesas empenhadas', 'Valor 7'],
        ['Despesas liquidadas', 'Valor 8'],
        ['Despesas pagas', 'Valor 9']
      ],
      'despesas-empenhadas-liquidadas-e-pagas-strictu-sensu': [
        ['Despesas empenhadas', 'Valor 7'],
        ['Despesas liquidadas', 'Valor 8'],
        ['Despesas pagas', 'Valor 9']
      ],
      'saldos-de-empenhos-do-exercicio-conta-contabil': [
        ['Empenhos a liquidar', 'Valor 8'],
        ['Liquidados a pagar', 'Valor 9'],
        ['Empenhos pagos', 'Valor 10']
      ],
      'recolhimento-proprio-gru': [
        ['GRU arrecadadas', '724210100 / = ARRECADACAO LIQUIDA POR COD DE RECOLHIMENTO / Movim. L\u00edquido - R$ (Item Informa\u00e7\u00e3o)', ['movim', 'liquido']]
      ],
      'provisionamentos': [
        ['Provisionamentos', 'Saldo - Moeda Origem (Item Informa\u00e7\u00e3o)', ['saldo', 'moeda']]
      ],
      'credito-disponivel-mes-lancamento': [
        ['Cr\u00e9dito dispon\u00edvel', 'Saldo - R$ (Conta Cont\u00e1bil)', ['saldo', 'r$']]
      ],
      'saldo-de-empenhos-a-liquidar-mes-a-mes': [
        ['Saldo total a liquidar', 'Total a Liquidar']
      ]
    };

    function reportUrl() {
      const params = new URLSearchParams(location.search);
      return params.get('report') || 'data/index.json';
    }

    function friendlyReportTitle() {
      return reportDefinition()?.title || reportFriendlyNames[report?.slug] || fixMojibake(report?.title) || report?.slug || 'Relat\u00f3rio';
    }

    function reportDefinition() {
      return EmailBackupHub.reportDefinition(reportDefinitions, report?.slug);
    }

    function fixMojibake(value) {
      let text = String(value || '');
      for (let index = 0; index < 2; index += 1) {
        try {
          const decoded = decodeURIComponent(escape(text));
          if (decoded === text) break;
          text = decoded;
        } catch {
          break;
        }
      }
      return text;
    }

    async function loadReport() {
      const url = reportUrl();
      const [response, definitions] = await Promise.all([
        fetch(url),
        EmailBackupHub.loadReportDefinitions()
      ]);
      reportDefinitions = definitions;
      report = await response.json();
      byId('title').textContent = friendlyReportTitle();
      byId('htmlLink').href = report.html_path || '#';
      byId('jsonLink').href = url;
      byId('meta').innerHTML = [
        `Data: ${report.date || '-'}`,
        `Periodicidade: ${report.metadata?.periodicidade || '-'}`,
        `Status: ${report.metadata?.status || '-'}`,
        `Idade: ${report.metadata?.idade_dias ?? '-'} dias`,
        `Exercício: ${report.metadata?.exercicio || '-'}`,
        `Linhas: ${report.metadata?.row_count ?? 0}`
      ].map(text => `<span class="tag">${escapeHtml(text)}</span>`).join('');
      const quality = qualitySummary(report);
      byId('quality').textContent = quality.text;
      byId('quality').className = quality.ok ? 'quality' : 'quality bad';
      renderMetricAudit();
      columnFilters = {};
      columnSort = { column: null, direction: '' };
      filteredCache = null;
      columnMetaCache = new Map();
      columnOptionsCache = new Map();
      currentPage = 1;
      pageSize = 50;
      visibleColumns = new Set(report.columns || []);
      groupColumn = '';
      groupSumColumns = new Set();
      byId('showTotals').checked = false;
      restoreStateFromUrl();
      ensureDefaultVisibleColumns();
      renderTableShell();
      renderColumnVisibilityControls();
      renderGroupingControls();
      byId('columnWidthRange').value = String(baseColumnWidth);
      byId('columnWidthValue').textContent = baseColumnWidth + ' px';
      chartSettings = null;
      chartRecommended = null;
      chartSelectedRow = null;
      renderRows();
      prepareReportChartControls();
      refreshSavedViews();
    }

    function columnMetaFor(column) {
      if (columnMetaCache.has(column)) return columnMetaCache.get(column);
      let meta = Filters.columnMeta(report, column);
      // Some Tesouro Gerencial exports infer code-like fields as numbers.
      // Keep identifiers textual even when their values look numeric.
      if (ChartExplorer && ChartExplorer.typeFor(report, column, Filters) === 'identifier'
        && meta.type !== 'identifier') {
        meta = { ...meta, type:'identifier', filter_kind:'text', inferred_from:'identifier_header' };
      }
      if (Filters.filterKind(meta) === 'choices') {
        const options = Filters.distinctOptions(report.rows || [], column, meta);
        if (options) columnOptionsCache.set(column, options);
        else meta = { ...meta, type: 'text', filter_kind: 'text', inferred_from: 'high_cardinality_fallback' };
      }
      columnMetaCache.set(column, meta);
      return meta;
    }

    function filteredRows() {
      const term = normalize(byId('globalSearch').value);
      const cacheKey = JSON.stringify([term, columnFilters, columnSort, byId('showTotals').checked]);
      if (filteredCache?.report === report && filteredCache.key === cacheKey) return filteredCache.rows;
      const filters = Object.entries(columnFilters)
        .filter(([, spec]) => Boolean(spec))
        .map(([column, spec]) => [column, spec, columnMetaFor(column)]);
      const rows = visibleRows().filter(item => {
        const row = item.raw || item;
        if (term && !normalize(Object.values(row).join(' ')).includes(term)) return false;
        return filters.every(([column, spec, meta]) =>
          typeof spec === 'string'
            ? normalize(row[column]).includes(normalize(spec)) // Preserve old ?f0=... URLs.
            : Filters.matches(row[column], spec, meta)
        );
      });
      if (columnSort.column && columnSort.direction) {
        const meta = columnMetaFor(columnSort.column);
        const factor = columnSort.direction === 'az' ? 1 : -1;
        rows.sort((a, b) => {
          const av = (a.raw || a)[columnSort.column];
          const bv = (b.raw || b)[columnSort.column];
          if (Filters.isEmpty(av) !== Filters.isEmpty(bv)) return Filters.isEmpty(av) ? 1 : -1;
          return Filters.compare(av, bv, meta) * factor;
        });
      }
      filteredCache = { report, key: cacheKey, rows };
      return rows;
    }

    function visibleReportColumns() {
      const columns = report?.columns || [];
      if (!visibleColumns.size) return columns;
      return columns.filter(column => visibleColumns.has(column));
    }

    function suggestedVisibleColumns() {
      const columns = report?.columns || [];
      if (columns.length <= 8) return new Set(columns);
      const chosen = new Set([...columns.slice(0, 3), ...columns.slice(-3)]);
      // The primary document key is often in the middle of an exported report.
      for (const column of columns) {
        if (/(^ptres$|^ne ccor$|\brip\b|n[uú]m.*processo)/i.test(column)) chosen.add(column);
      }
      return chosen;
    }

    function ensureDefaultVisibleColumns() {
      const columns = report?.columns || [];
      const params = new URLSearchParams(location.search);
      if (!params.has('cols') || !visibleColumns.size) {
        visibleColumns = suggestedVisibleColumns();
      }
    }

    function columnIndex(column) {
      return (report?.columns || []).indexOf(column);
    }

    function columnsFromIndexes(value) {
      const columns = report?.columns || [];
      return String(value || '').split(',').map(index => columns[Number(index)]).filter(Boolean);
    }

    function indexList(columns) {
      return columns.map(columnIndex).filter(index => index >= 0).join(',');
    }

    function groupedRows(rows) {
      if (!groupColumn) return [{ key: '', rows }];
      const groups = new Map();
      for (const item of rows) {
        const row = item.raw || item;
        const key = fixMojibake(row[groupColumn]) || '(vazio)';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
      return [...groups.entries()].map(([key, items]) => ({ key, rows: items }));
    }

    function measureColumns() {
      return ChartExplorer ? ChartExplorer.numericColumns(report, Filters) : (report?.columns || []).filter(column =>
        ['money','number','percent'].includes(columnMetaFor(column).type));
    }

    function chartOption(select, value, label) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }

    function chartFieldNames() {
      return friendlyColumns(report?.columns || []);
    }

    function chartRowLabel(item, index) {
      const row = item.raw || item;
      const identity = (report.columns || []).find(column =>
        /(ne ccor$|ptres$|c[oó]d.*recolhimento|rip$|numero.*processo)/i.test(column));
      const named = identity ? String(row[identity] || '').trim() : '';
      const title = named || String(Object.values(row).find(value => String(value || '').trim()) || '').trim();
      return 'Registro ' + (index + 1) + (title ? ' · ' + (title.length > 80 ? title.slice(0, 77) + '…' : title) : '');
    }

    function updateChartSuggestion() {
      if (!ChartExplorer || !report) return;
      const suggested = ChartExplorer.suggest(report, filteredRows(), Filters);
      chartRecommended = suggested;
      byId('chartSuggestedTitle').textContent = 'Sugestão: ' + suggested.title;
      byId('chartSuggestedReason').textContent = suggested.reason;
    }

    function prepareReportChartControls() {
      if (!report || !ChartExplorer) return;
      updateChartSuggestion();
      if (!chartSettings) chartSettings = { ...chartRecommended };
      const dimensions = ChartExplorer.dimensions(report, Filters);
      const measures = measureColumns();
      const columnNames = chartFieldNames();
      const dimSelect = byId('chartDimension');
      const measureSelect = byId('chartMeasure');
      dimSelect.replaceChildren();
      measureSelect.replaceChildren();
      dimensions.forEach(column => chartOption(dimSelect, column,
        columnNames[(report.columns || []).indexOf(column)] || column));
      measures.forEach(column => chartOption(measureSelect, column,
        columnNames[(report.columns || []).indexOf(column)] || column));
      const hasWide = ChartExplorer.wideColumns(report, Filters).length >= 2;
      const wideOption = byId('chartMode').querySelector('option[value="wide"]');
      if (wideOption) wideOption.disabled = !hasWide;
      if (chartSettings.mode === 'wide' && !hasWide) chartSettings = { ...chartRecommended };
      if (!dimensions.includes(chartSettings.dimension)) chartSettings.dimension = dimensions[0] || '';
      if (!measures.includes(chartSettings.measure)) chartSettings.measure = measures[0] || '';
      const modes = ['records','count','sum','wide'];
      if (!modes.includes(chartSettings.mode)) chartSettings.mode = chartRecommended.mode;
      if (!['bar','pie','line'].includes(chartSettings.type)) chartSettings.type = chartRecommended.type;
      byId('chartMode').value = chartSettings.mode;
      byId('chartType').value = chartSettings.type;
      dimSelect.value = chartSettings.dimension;
      measureSelect.value = chartSettings.measure;
      byId('chartLimit').value = String(chartSettings.limit || 15);
      populateChartRecords();
      updateChartControlVisibility();
    }

    function populateChartRecords() {
      const select = byId('chartRecord');
      const all = filteredRows();
      const data = all.filter(item => item.type !== 'total');
      const previous = Number(chartSettings?.rowIndex);
      const remembered = chartSelectedRow
        ? all.findIndex(item => (item.raw || item) === chartSelectedRow) : -1;
      select.replaceChildren();
      const max = Math.min(data.length, 200);
      let chosen = 0, found = false;
      for (let i = 0; i < max; i++) {
        const index = all.indexOf(data[i]);
        chartOption(select, String(index), chartRowLabel(data[i], index));
        if (index === remembered || (chartSelectedRow === null && index === previous)) {
          chosen = index;
          found = true;
        }
      }
      if (data.length > max) chartOption(select, '', 'Filtre a tabela para localizar outros registros (' + data.length + ' no total)');
      if (!found && max) chosen = all.indexOf(data[0]);
      select.value = max ? String(chosen) : '';
      chartSettings.rowIndex = chosen;
      chartSelectedRow = max ? (all[chosen].raw || all[chosen]) : null;
    }

    function updateChartControlVisibility() {
      const mode = chartSettings?.mode;
      byId('chartDimensionControl').hidden = mode === 'wide';
      byId('chartMeasureControl').hidden = mode === 'wide' || mode === 'count';
      byId('chartRowControl').hidden = mode !== 'wide';
      byId('chartType').querySelector('option[value="pie"]').disabled = mode === 'records' || mode === 'wide';
      byId('chartType').querySelector('option[value="line"]').disabled = mode === 'records';
    }

    function readChartSettingsFromControls() {
      if (!chartSettings) chartSettings = { ...chartRecommended };
      const mode = byId('chartMode').value;
      const type = byId('chartType').value;
      chartSettings = {
        ...chartSettings, mode, type,
        dimension: byId('chartDimension').value,
        measure: byId('chartMeasure').value,
        rowIndex: Number(byId('chartRecord').value) || 0,
        limit: Number(byId('chartLimit').value) || 15
      };
      if (mode === 'records' && (type === 'pie' || type === 'line')) chartSettings.type = 'bar';
      if (mode === 'wide' && type === 'pie') chartSettings.type = 'bar';
      byId('chartType').value = chartSettings.type;
      updateChartControlVisibility();
    }

    function chartSelectPoint(point, result) {
      if (result.mode === 'records' || result.mode === 'wide') {
        openRowDetails(point.rowIndex);
        return;
      }
      const column = result.dimension;
      const meta = columnMetaFor(column);
      const key = point.key;
      let filter;
      if (!key) filter = { op:'is_empty' };
      else if (meta.type === 'date') filter = { op:'range', min:key, max:key };
      else if (Filters.filterKind(meta) === 'choices') filter = { op:'in', values:[key] };
      else filter = { op:'equals', value:key };
      if (!Filters.validFilter(filter,meta)) {
        byId('chartSummary').textContent = 'Não foi possível aplicar um filtro seguro para esta categoria.';
        return;
      }
      columnFilters[column] = filter;
      filteredCache = null;
      currentPage = 1;
      renderRows();
      byId('chartSummary').textContent = 'Filtro aplicado à tabela: ' + friendlyColumnName(column) + ' = ' +
        (key || '(vazio)') + '. Use “Limpar” para desfazer.';
      const table = byId('readerWorkspace');
      if (typeof table.scrollIntoView === 'function') table.scrollIntoView({ behavior:'smooth',block:'start' });
    }

    function renderReportChart() {
      const container = byId('reportChartVisual');
      if (!byId('reportChart')?.open || !report || !container || !ChartExplorer) return;
      if (!chartSettings) prepareReportChartControls();
      if (chartSettings.mode === 'wide') populateChartRecords();
      const source = filteredRows();
      updateChartSuggestion();
      const result = ChartExplorer.build(report, source, chartSettings, Filters);
      const label = byId('chartSummary');
      if (result.ok) {
        const shown = result.points.length;
        label.textContent = (result.description || '') + ' Registros filtrados: ' + result.totalDataRows +
          '. Itens no gráfico: ' + shown +
          (result.omitted ? '. Valores inválidos/vazios ignorados: ' + result.omitted : '') +
          (result.warning ? ' Atenção: ' + result.warning : '');
      } else label.textContent = result.reason;
      ChartExplorer.render(container, result, { onSelect:chartSelectPoint });
    }

    function applyChartSuggestion() {
      if (!chartRecommended || !report) return;
      chartSettings = { ...chartRecommended };
      chartSelectedRow = null;
      prepareReportChartControls();
      renderReportChart();
    }

    function onChartControlsChanged(event) {
      const priorMode = chartSettings?.mode;
      readChartSettingsFromControls();
      if (event?.target?.id === 'chartRecord') {
        const item = filteredRows()[chartSettings.rowIndex];
        chartSelectedRow = item ? (item.raw || item) : null;
      }
      if (priorMode !== chartSettings.mode) {
        if (chartSettings.mode === 'wide') populateChartRecords();
        if (chartSettings.mode === 'count' && chartSettings.type === 'line'
          && !['period','date'].includes(columnMetaFor(chartSettings.dimension).type)) {
          chartSettings.type = 'bar';
          byId('chartType').value = 'bar';
        }
        updateChartControlVisibility();
      }
      renderReportChart();
    }

    function groupTotals(rows) {
      return [...groupSumColumns].filter(eligibleSumColumn).map(column => {
        let total = 0;
        let count = 0;
        for (const item of customTotalRows(rows)) {
          const number = parseBrNumber((item.raw || item)[column]);
          if (Number.isFinite(number)) {
            total += number;
            count += 1;
          }
        }
        return { column, total, count };
      }).filter(item => item.count > 0);
    }

    function sortCellValue(value) {
      const number = parseBrNumber(value);
      return Number.isFinite(number) ? number : normalize(value);
    }

    function compareCellValues(a, b) {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      return String(a ?? '').localeCompare(String(b ?? ''), 'pt-BR', { numeric: true });
    }

    function visibleRows() {
      const cleanRows = rows => rows.filter(item => item.type === 'total' || !isHeaderLikeRow(item.raw || item));
      if (byId('showTotals').checked && Array.isArray(report.row_types) && report.row_types.length) {
        return cleanRows(report.row_types);
      }
      return cleanRows((report.rows || []).map(row => ({ type: 'data', raw: row })));
    }

    function isHeaderLikeRow(row) {
      const values = Object.values(row || {}).map(value => normalize(fixMojibake(value))).filter(Boolean);
      if (!values.length) return true;
      const joined = values.join(' ');
      const numericCount = values.filter(value => Number.isFinite(parseBrNumber(value))).length;
      const headerTerms = ['natureza despesa', 'item informacao', 'ne ccor', 'saldo r', 'restos a pagar', 'valor', 'unidade gestora', 'mes lancamento'];
      const matches = headerTerms.filter(term => joined.includes(term)).length;
      return matches >= 2 && numericCount <= Math.max(4, values.length * 0.35);
    }

    function qualitySummary(report) {
      const quality = report.quality || {};
      const rawIssues = quality.issues || [];
      const warnings = [...(quality.warnings || []), ...rawIssues.filter(issue => infoQualityCodes.has(issue))];
      const issues = rawIssues.filter(issue => !infoQualityCodes.has(issue));
      if (issues.length) return { ok: false, text: `Problemas de parsing: ${issues.map(qualityLabel).join(', ')}` };
      if (warnings.length) return { ok: true, text: `Observações de leitura: ${[...new Set(warnings)].map(qualityLabel).join(', ')}` };
      return { ok: true, text: 'Parsing concluído sem problemas.' };
    }

    function qualityLabel(code) {
      return qualityLabels[code] || code;
    }

    function friendlyColumns(columns) {
      const friendly = reportDefinition().columns || columnFriendlyNames[report.slug] || [];
      const allColumns = report.columns || columns;
      const generated = allColumns.length && allColumns.every(column => /^Coluna \d+$/.test(column || ''));
      return columns.map((column, index) => {
        const originalIndex = allColumns.indexOf(column);
        const sourceIndex = originalIndex >= 0 ? originalIndex : index;
        const inferred = inferredColumnName(column, sourceIndex);
        if (inferred) return inferred;
        if (generated && friendly.length === allColumns.length && friendly[sourceIndex]) return friendly[sourceIndex];
        if (/^Coluna \d+$/.test(column || '')) return index === 0 ? 'Descricao' : `Valor ${index}`;
        return column;
      });
    }

    function inferredColumnName(column, index) {
      if (report?.parser_version) return null;
      if (report?.slug === 'restos-a-pagar-rap') {
        const labels = {
          'Valor 8': 'Valor do empenho',
          'Valor 9': 'RAP inscrito',
          'Valor 10': 'RAP cancelado',
          'Valor 11': 'RAP pago',
          'Valor 12': 'RAP a pagar'
        };
        if (labels[column]) return labels[column];
        const baseLabels = ['Natureza de despesa', 'Cod. natureza', 'Natureza detalhada', 'Empenho', 'Descricao do empenho', 'Favorecido', 'Processo'];
        return baseLabels[index] || null;
      }
      const headerRows = (report.rows || []).slice(0, 4);
      const terms = headerRows.map(row => fixMojibake(row?.[column])).filter(Boolean);
      const meaningful = terms.find(term => /saldo|r\$|valor|pago|liquidado|empenhado|credito|provision|arrecad/i.test(term));
      if (!meaningful || String(meaningful).length > 80) return null;
      return String(meaningful).replace(/\s+/g, ' ').trim();
    }


    function defaultColumnWidth(column) {
      if (columnWidths.has(column)) return columnWidths.get(column);
      const kind = columnMetaFor(column)?.type;
      const label = normalize(column);
      const factor = kind === 'identifier' ? .83
        : ['money', 'number', 'percent'].includes(kind) ? .85
          : /descricao|observacao|historico|favorecido|justificativa/.test(label) ? 1.4
            : /^(ptres|mes|ano|data)$/.test(label) ? .67 : 1;
      return Math.max(150, Math.min(560, Math.round(baseColumnWidth * factor)));
    }

    function applyColumnSizing() {
      const table = byId('table');
      if (!table?.querySelectorAll) return;
      const columns = visibleReportColumns();
      const cols = table.querySelectorAll('col[data-column-index]');
      let total = 52;
      cols.forEach((col, index) => {
        const width = defaultColumnWidth(columns[index]);
        col.style.width = width + 'px';
        total += width;
      });
      table.style.width = total + 'px';
      table.style.minWidth = total + 'px';
      byId('columnWidthValue').textContent = baseColumnWidth + ' px';
    }

    function toggleSort(column) {
      if (columnSort.column !== column) columnSort = { column, direction: 'az' };
      else if (columnSort.direction === 'az') columnSort.direction = 'za';
      else columnSort = { column: null, direction: '' };
      currentPage = 1;
      renderTableShell();
      renderRows();
    }

    function attachColumnResizers() {
      document.querySelectorAll('[data-resize-column]').forEach(grip => {
        const column = grip.dataset.resizeColumn;
        grip.addEventListener('pointerdown', event => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          const startX = event.clientX;
          const initialWidth = defaultColumnWidth(column);
          const move = next => {
            columnWidths.set(column, Math.max(150, Math.min(720, Math.round(initialWidth + next.clientX - startX))));
            applyColumnSizing();
          };
          const finish = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', finish);
            document.removeEventListener('pointercancel', finish);
          };
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', finish);
          document.addEventListener('pointercancel', finish);
        });
        grip.addEventListener('keydown', event => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          event.preventDefault();
          columnWidths.set(column, Math.max(150, Math.min(720, defaultColumnWidth(column) + (event.key === 'ArrowRight' ? 25 : -25))));
          applyColumnSizing();
        });
      });
    }

    function renderTableShell() {
      const columns = visibleReportColumns();
      const displayColumns = friendlyColumns(columns);
      const tableWrap = byId('tableWrap');
      const previousScroll = tableWrap?.scrollLeft || 0;
      byId('table').innerHTML = `
        <colgroup>
          <col class="action-column" style="width:52px">
          ${columns.map((column, index) => `<col data-column-index="${index}" style="width:${defaultColumnWidth(column)}px">`).join('')}
        </colgroup>
        <thead><tr>
          <th class="action-head" scope="col" title="Abrir registro completo">Ver</th>
          ${columns.map((column, index) => {
            const active = columnSort.column === column && Boolean(columnSort.direction);
            const sort = active ? (columnSort.direction === 'az' ? '↑' : '↓') : '↕';
            const ariaSort = active ? (columnSort.direction === 'az' ? 'ascending' : 'descending') : 'none';
            return `<th scope="col" class="${index === 0 ? 'first-data-col' : ''}" aria-sort="${ariaSort}">
              <div class="th-inner">
                <button type="button" data-sort-heading="${escapeHtml(column)}"
                  class="sort-heading${active ? ' is-active' : ''}" title="Ordenar por ${escapeHtml(displayColumns[index])}">
                  ${escapeHtml(displayColumns[index])}<span class="sort-mark" aria-hidden="true">${sort}</span>
                </button>
                <button type="button" class="column-filter-button${columnFilters[column] ? ' is-active' : ''}"
                  data-filter-column="${escapeHtml(column)}" title="Filtrar ${escapeHtml(displayColumns[index])}"
                  aria-label="Filtrar ${escapeHtml(displayColumns[index])}"
                  aria-pressed="${Boolean(columnFilters[column])}">⌕</button>
              </div>
              <span class="resize-grip" role="separator" tabindex="0" aria-orientation="vertical"
                aria-label="Redimensionar ${escapeHtml(displayColumns[index])}" data-resize-column="${escapeHtml(column)}"></span>
            </th>`;
          }).join('')}
        </tr></thead>
        <tbody></tbody>
        <tfoot></tfoot>
      `;
      applyColumnSizing();
      if (tableWrap) tableWrap.scrollLeft = previousScroll;
      document.querySelectorAll('[data-filter-column]').forEach(button => {
        button.addEventListener('click', event => openFilterEditor(event.currentTarget.dataset.filterColumn));
      });
      document.querySelectorAll('[data-sort-heading]').forEach(button => {
        button.addEventListener('click', event => toggleSort(event.currentTarget.dataset.sortHeading));
      });
      attachColumnResizers();
      updateColumnCount();
    }

    function filterOperationOptions(operations, selected) {
      return operations.map(([op, label]) => `<option value="${op}" ${selected === op ? 'selected' : ''}>${label}</option>`).join('');
    }

    function openFilterEditor(column) {
      if (!(report?.columns || []).includes(column)) return;
      closeColumnPanel();
      filterColumn = column;
      const picker = byId('filterColumnPicker');
      picker.innerHTML = (report.columns || []).map(key =>
        `<option value="${escapeHtml(key)}">${escapeHtml(friendlyColumnName(key))}</option>`
      ).join('');
      picker.value = column;
      const meta = columnMetaFor(column);
      const kind = Filters.filterKind(meta);
      const existing = columnFilters[column];
      const spec = typeof existing === 'object' && existing ? existing : null;
      const select = (operations, fallback) => `<label>Operação
        <select data-filter-operation>${filterOperationOptions(operations, spec?.op || fallback)}</select>
      </label>`;
      const textOperations = [
        ['contains', 'Contém'], ['equals', 'Igual a'], ['starts', 'Começa com'],
        ['is_empty', 'Está vazio'], ['not_empty', 'Está preenchido']
      ];
      const emptyOperations = [['is_empty', 'Está vazio'], ['not_empty', 'Está preenchido']];
      const fields = byId('filterEditorFields');
      if (kind === 'numeric') {
        fields.innerHTML = select([
          ['range', 'Intervalo'], ['is_zero', 'Igual a zero'], ['not_zero', 'Diferente de zero'],
          ...emptyOperations
        ], 'range') + `
          <div class="filter-input-fields" data-filter-input-fields>
            <label>Mínimo (inclusive)<input type="text" inputmode="decimal" data-filter-min
              placeholder="Ex.: -1.234,56" value="${escapeHtml(spec?.min || '')}"></label>
            <label>Máximo (inclusive)<input type="text" inputmode="decimal" data-filter-max
              placeholder="Ex.: 1.234,56" value="${escapeHtml(spec?.max || '')}"></label>
          </div>`;
      } else if (kind === 'date') {
        fields.innerHTML = select([['range', 'Intervalo de datas'], ...emptyOperations], 'range') + `
          <div class="filter-input-fields" data-filter-input-fields>
            <label>Data inicial<input type="date" data-filter-min value="${escapeHtml(spec?.min || '')}"></label>
            <label>Data final<input type="date" data-filter-max value="${escapeHtml(spec?.max || '')}"></label>
          </div>`;
      } else if (kind === 'choices') {
        const options = columnOptionsCache.get(column) || [];
        const selected = new Set(spec?.values || []);
        fields.innerHTML = select([['in', 'Uma ou mais opções'], ...emptyOperations], 'in') + `
          <div class="filter-input-fields" data-filter-input-fields>
            <label>Selecione uma ou mais opções
              <select multiple size="${Math.min(8, Math.max(3, options.length))}" class="facet-select" data-filter-values
                aria-label="Opções da coluna ${escapeHtml(friendlyColumnName(column))}">
                ${options.map(value => `<option value="${escapeHtml(value)}" ${selected.has(value) ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}
              </select>
            </label>
            <small>Use Ctrl ou Cmd para selecionar vários valores. As opções da mesma coluna funcionam como alternativas.</small>
          </div>`;
      } else {
        fields.innerHTML = select(textOperations, 'contains') + `
          <div class="filter-input-fields" data-filter-input-fields>
            <label>Texto a pesquisar<input type="search" data-filter-text
              placeholder="Digite parte do conteúdo" value="${escapeHtml(typeof existing === 'string' ? existing : spec?.value || '')}"></label>
          </div>`;
      }
      byId('filterEditorTitle').textContent = `Filtrar registros`;
      byId('filterError').hidden = true;
      byId('filterEditor').hidden = false;
      const opSelect = fields.querySelector('[data-filter-operation]');
      opSelect.addEventListener('change', updateFilterInputVisibility);
      updateFilterInputVisibility();
      opSelect.focus();
    }

    function updateFilterInputVisibility() {
      const fields = byId('filterEditorFields');
      const op = fields.querySelector('[data-filter-operation]')?.value;
      const inputs = fields.querySelector('[data-filter-input-fields]');
      if (inputs) inputs.hidden = ['is_empty', 'not_empty', 'is_zero', 'not_zero'].includes(op);
    }

    function closeFilterEditor() {
      byId('filterEditor').hidden = true;
      filterColumn = null;
      byId('filterError').hidden = true;
    }

    function applyColumnFilter() {
      if (!filterColumn) return;
      const meta = columnMetaFor(filterColumn);
      const kind = Filters.filterKind(meta);
      const fields = byId('filterEditorFields');
      const op = fields.querySelector('[data-filter-operation]')?.value;
      let spec = { op };
      if (op === 'range') {
        spec.min = fields.querySelector('[data-filter-min]')?.value.trim() || '';
        spec.max = fields.querySelector('[data-filter-max]')?.value.trim() || '';
      } else if (op === 'in') {
        spec.values = [...(fields.querySelector('[data-filter-values]')?.selectedOptions || [])].map(item => item.value);
      } else if (['contains', 'equals', 'starts'].includes(op)) {
        spec.value = fields.querySelector('[data-filter-text]')?.value.trim() || '';
      }
      if (!Filters.validFilter(spec, meta)) {
        const message = byId('filterError');
        message.textContent = kind === 'numeric'
          ? 'Informe um intervalo válido no formato brasileiro, ou selecione outra operação.'
          : kind === 'date' ? 'Informe um intervalo válido de datas.'
            : kind === 'choices' ? 'Selecione pelo menos uma opção.'
              : 'Informe o texto a pesquisar.';
        message.hidden = false;
        return;
      }
      columnFilters[filterColumn] = spec;
      currentPage = 1;
      closeFilterEditor();
      renderTableShell();
      renderRows();
    }

    function removeColumnFilter(column) {
      if (!column) return;
      delete columnFilters[column];
      currentPage = 1;
      if (filterColumn === column) closeFilterEditor();
      renderTableShell();
      renderRows();
    }

    function renderFilterChips() {
      const entries = Object.entries(columnFilters).filter(([, spec]) => Boolean(spec));
      const container = byId('filterChips');
      container.innerHTML = entries.length
        ? entries.map(([column, spec]) => `
            <button type="button" class="filter-chip" data-remove-filter="${escapeHtml(column)}"
              aria-label="Remover filtro de ${escapeHtml(friendlyColumnName(column))}">
              ${escapeHtml(friendlyColumnName(column))}: ${escapeHtml(typeof spec === 'string' ? 'contém ' + spec : Filters.describe(spec, columnMetaFor(column)))} ×
            </button>`).join('')
        : '<span class="control-help">Nenhum filtro de coluna ativo.</span>';
      container.querySelectorAll('[data-remove-filter]').forEach(button => {
        button.addEventListener('click', () => removeColumnFilter(button.dataset.removeFilter));
      });
    }


    function updateColumnCount() {
      const count = visibleReportColumns().length;
      const total = report?.columns?.length || 0;
      const label = byId('visibleColumnsCount');
      if (label) label.textContent = `(${count}/${total})`;
    }

    function closeColumnPanel() {
      byId('columnPanel').hidden = true;
      byId('toggleColumns').setAttribute('aria-expanded', 'false');
    }

    function toggleColumnPanel() {
      const panel = byId('columnPanel');
      if (panel.hidden) {
        closeFilterEditor();
        panel.hidden = false;
        byId('toggleColumns').setAttribute('aria-expanded', 'true');
        renderColumnVisibilityControls();
        byId('columnSearch').focus();
      } else closeColumnPanel();
    }

    function refreshColumnSearch() {
      const term = normalize(byId('columnSearch').value);
      byId('columnVisibilityOptions').querySelectorAll('[data-column-label]').forEach(label => {
        label.hidden = Boolean(term) && !normalize(label.dataset.columnLabel).includes(term);
      });
    }

    function selectVisibleColumns(next) {
      visibleColumns = new Set(next);
      if (!visibleColumns.size && report?.columns?.length) visibleColumns.add(report.columns[0]);
      currentPage = 1;
      renderTableShell();
      renderColumnVisibilityControls();
      renderRows();
    }

    function renderColumnVisibilityControls() {
      const columns = report.columns || [];
      const displayColumns = friendlyColumns(columns);
      const options = byId('columnVisibilityOptions');
      options.innerHTML = columns.map((column, index) => `
        <label data-column-label="${escapeHtml(displayColumns[index])}">
          <input type="checkbox" data-visible-column="${escapeHtml(column)}" ${visibleColumns.has(column) ? 'checked' : ''}>
          <span>${escapeHtml(displayColumns[index])}</span>
        </label>
      `).join('');
      options.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', event => {
          const column = event.target.dataset.visibleColumn;
          if (event.target.checked) visibleColumns.add(column);
          else visibleColumns.delete(column);
          if (!visibleColumns.size) visibleColumns.add(column);
          renderTableShell();
          renderColumnVisibilityControls();
          renderRows();
        });
      });
      updateColumnCount();
      refreshColumnSearch();
    }

    function eligibleSumColumn(column) {
      const kind = columnMetaFor(column).type;
      // Manual opt-in only; no automatic sum from a monetary-looking label.
      return kind === 'money' || kind === 'number';
    }

    function renderGroupingControls() {
      const columns = report.columns || [];
      const displayColumns = friendlyColumns(columns);
      const groupSelect = byId('groupColumn');
      groupSelect.innerHTML = `<option value="">Sem agrupamento</option>${columns.map((column, index) => `<option value="${escapeHtml(column)}">${escapeHtml(displayColumns[index])}</option>`).join('')}`;
      groupSelect.value = groupColumn || '';
      groupSelect.onchange = event => {
        groupColumn = event.target.value;
        currentPage = 1;
        renderRows();
      };
      const options = byId('groupSumOptions');
      options.innerHTML = '<p class="control-help">Somas são opcionais e aplicadas apenas aos registros de detalhe filtrados. Não somar saldos de períodos diferentes sem verificar sua natureza contábil.</p>'
        + columns.filter(eligibleSumColumn).map(column => `
        <label>
          <input type="checkbox" data-group-sum-column="${escapeHtml(column)}" ${groupSumColumns.has(column) ? 'checked' : ''}>
          <span>${escapeHtml(friendlyColumnName(column))}</span>
        </label>
      `).join('');
      options.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', event => {
          const column = event.target.dataset.groupSumColumn;
          if (event.target.checked && eligibleSumColumn(column)) groupSumColumns.add(column);
          else groupSumColumns.delete(column);
          renderRows();
        });
      });
    }

    function scheduleRenderRows() {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(renderRows, 250);
    }

    function renderRows() {
      if (!report) return;
      const columns = visibleReportColumns();
      const rows = filteredRows();
      displayedRows = rows;
      const count = rows.length;
      const totalPages = Math.max(1, Math.ceil(count / pageSize));
      currentPage = Math.max(1, Math.min(currentPage, totalPages));
      const start = (currentPage - 1) * pageSize;
      const end = Math.min(count, start + pageSize);
      const tbody = byId('table').querySelector('tbody');
      tbody.innerHTML = count
        ? groupedTableHtml(rows, columns, start, end)
        : `<tr class="empty-row"><td colspan="${Math.max(1, columns.length + 1)}">Nenhum registro corresponde aos filtros. Ajuste ou remova os filtros para ampliar a pesquisa.</td></tr>`;
      byId('pageInfo').textContent = count
        ? `Exibindo ${start + 1}–${end} de ${count} registros.`
        : 'Nenhum registro encontrado.';
      const quickStatus = byId('quickStatus');
      if (quickStatus) quickStatus.textContent = `${count} registros · ${columns.length} de ${report.columns?.length || 0} colunas`;
      byId('pageNumber').textContent = `Página ${currentPage} de ${totalPages}`;
      byId('previousPage').disabled = currentPage <= 1;
      byId('nextPage').disabled = currentPage >= totalPages;
      byId('pageSize').value = String(pageSize);
      renderFilterChips();
      updateUrlState();
      if (byId('reportChart')?.open) renderReportChart();
    }

    function groupedTableHtml(rows, columns, start = 0, end = rows.length) {
      if (!groupColumn) return rows.slice(start, end).map(item => rowHtml(item, columns)).join('');
      let cursor = 0;
      const output = [];
      for (const group of groupedRows(rows)) {
        const groupStart = cursor;
        const groupEnd = cursor + group.rows.length;
        cursor = groupEnd;
        if (groupEnd <= start || groupStart >= end) continue;
        const from = Math.max(0, start - groupStart);
        const to = Math.min(group.rows.length, end - groupStart);
        const label = `${friendlyColumnName(groupColumn)}: ${group.key}`;
        output.push(`
          <tr class="group-row"><td colspan="${Math.max(1, columns.length + 1)}">${escapeHtml(label)}
            (${group.rows.length} linha(s)${from ? ', continuação' : ''})</td></tr>
          ${group.rows.slice(from, to).map(item => rowHtml(item, columns)).join('')}
        `);
        // Totals always refer to the FULL filtered group, never only to this page.
        if (to === group.rows.length) {
          output.push(groupSummaryRowHtml(groupTotals(group.rows), columns, 'Total do grupo'));
        }
      }
      if (end >= rows.length) output.push(groupSummaryRowHtml(groupTotals(rows), columns, 'Total geral do agrupamento'));
      return output.join('');
    }


    function rowHtml(item, columns) {
      const row = item.raw || item;
      const isTotal = item.type === 'total';
      const index = displayedRows.indexOf(item);
      const cells = columns.map((column, position) => {
        const value = String(row[column] ?? '');
        const safe = escapeHtml(value);
        return `<td class="${position === 0 ? 'first-data-col' : ''}"
          title="${escapeHtml(value.slice(0, 300))}"><span class="cell-value">${safe || '—'}</span></td>`;
      }).join('');
      return `<tr class="${isTotal ? 'total-row' : ''} row-openable" data-row-index="${index}">
        <td class="row-open-cell"><button class="row-open-button" type="button"
          data-open-row="${index}" aria-label="Abrir registro ${index + 1} completo" title="Ver todos os campos">↗</button></td>
        ${cells}
      </tr>`;
    }

    function groupSummaryRowHtml(totals, columns, label) {
      if (!totals.length) return '';
      const totalByColumn = new Map(totals.map(item => [item.column, item]));
      return `<tr class="group-summary"><td class="row-open-cell"></td>${columns.map((column, index) => {
        const total = totalByColumn.get(column);
        if (total) return `<td class="${index === 0 ? 'first-data-col' : ''}">${escapeHtml(formatMoneyValue(total.total))}</td>`;
        return `<td class="${index === 0 ? 'first-data-col' : ''}">${index === 0 ? escapeHtml(label) : ''}</td>`;
      }).join('')}</tr>`;
    }

    function openRowDetails(index) {
      if (!report || !Number.isSafeInteger(index) || index < 0 || index >= displayedRows.length) return;
      const item = displayedRows[index];
      const row = item.raw || item;
      const names = friendlyColumns(report.columns || []);
      byId('rowDialogTitle').textContent = `Registro ${index + 1}${item.type === 'total' ? ' · Total' : ''}`;
      byId('rowDetails').innerHTML = (report.columns || []).map((column, position) => `
        <div><dt>${escapeHtml(names[position] || column)}</dt>
          <dd>${escapeHtml(row[column] ?? '') || '—'}</dd></div>
      `).join('');
      const dialog = byId('rowDialog');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }

    function closeRowDetails() {
      const dialog = byId('rowDialog');
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }

    function customTotalRows(rows) {
      return rows.filter(item => item.type !== 'total');
    }

    function groupedReportTableHtml(rows, columns) {
      if (!groupColumn) {
        return rows.map(item => {
          const row = item.raw || item;
          return `<tr class="${item.type === 'total' ? 'total-row' : ''}">${columns.map(column => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`;
        }).join('');
      }
      const groupHtml = groupedRows(rows).map(group => {
        const totals = groupTotals(group.rows);
        return `
          <tr><td colspan="${Math.max(1, columns.length)}"><strong>${escapeHtml(friendlyColumnName(groupColumn))}: ${escapeHtml(group.key)}</strong> (${group.rows.length} linha(s))</td></tr>
          ${group.rows.map(item => {
            const row = item.raw || item;
            return `<tr class="${item.type === 'total' ? 'total-row' : ''}">${columns.map(column => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`;
          }).join('')}
          ${groupSummaryRowHtml(totals, columns, 'Total do grupo')}
        `;
      }).join('');
      return `${groupHtml}${groupSummaryRowHtml(groupTotals(rows), columns, 'Total geral do agrupamento')}`;
    }

    function exportCsv() {
      const columns = visibleReportColumns();
      const displayColumns = friendlyColumns(columns);
      const lines = [displayColumns.map(csvCell).join(',')];
      const rows = filteredRows();
      for (const group of groupedRows(rows)) {
        if (groupColumn) lines.push([`Grupo: ${friendlyColumnName(groupColumn)} = ${group.key}`, ...columns.slice(1).map(() => '')].map(csvCell).join(','));
        for (const item of group.rows) {
          const row = item.raw || item;
          lines.push(columns.map(column => csvCell(row[column])).join(','));
        }
        if (groupColumn) {
          const totals = groupTotals(group.rows);
          if (totals.length) {
            const totalByColumn = new Map(totals.map(item => [item.column, item]));
            lines.push(columns.map((column, index) => {
              const total = totalByColumn.get(column);
              if (total) return csvCell(formatMoneyValue(total.total));
              return csvCell(index === 0 ? 'Total do grupo' : '');
            }).join(','));
          }
        }
      }
      if (groupColumn) {
        const totals = groupTotals(rows);
        if (totals.length) {
          const totalByColumn = new Map(totals.map(item => [item.column, item]));
          lines.push(columns.map((column, index) => {
            const total = totalByColumn.get(column);
            if (total) return csvCell(formatMoneyValue(total.total));
            return csvCell(index === 0 ? 'Total geral do agrupamento' : '');
          }).join(','));
        }
      }
      download(`${report.slug || 'relatorio'}.csv`, lines.join('\n'));
    }

    function exportHtmlReport() {
      const html = buildHtmlReport();
      if (!html) return;
      openHtmlReport(html);
      download(`${report?.slug || 'relatorio'}-relatorio.html`, html, 'text/html;charset=utf-8');
    }

    function printHtmlReport() {
      const html = buildHtmlReport();
      if (!html) return;
      openHtmlReport(html, true);
    }

    function openHtmlReport(html, shouldPrint = false) {
      const reportWindow = window.open('', '_blank');
      if (!reportWindow) return false;
      reportWindow.document.open();
      reportWindow.document.write(html);
      reportWindow.document.close();
      reportWindow.focus();
      if (shouldPrint) setTimeout(() => reportWindow.print(), 500);
      return true;
    }

    function buildHtmlReport() {
      if (!report) return;
      const columns = visibleReportColumns();
      const displayColumns = friendlyColumns(columns);
      const rows = filteredRows();
      const generatedAt = new Date().toLocaleString('pt-BR');
      const title = friendlyReportTitle();
      const metadata = [
        ['Fonte', 'Tesouro Gerencial'],
        ['Arquivo est\u00e1tico', report.html_path || '-'],
        ['Data do relat\u00f3rio', report.date || '-'],
        ['Periodicidade', report.metadata?.periodicidade || '-'],
        ['Status', report.metadata?.status || '-'],
        ['Idade', `${report.metadata?.idade_dias ?? '-'} dias`],
        ['Exerc\u00edcio', report.metadata?.exercicio || '-'],
        ['Linhas no arquivo', report.metadata?.row_count ?? 0],
        ['Exportado em', generatedAt]
      ];
      const tesouroContext = tesouroContextEntries();
      const activeFilters = activeFilterSummary();
      const highlights = numericHighlights(rows, columns, displayColumns);
      const auditEntries = metricAuditEntries();
      const quality = qualitySummary(report);
      const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Relat\u00f3rio</title>
  <style>
    :root { --bg:#f8fbf7; --panel:#ffffff; --soft:#edf6ed; --line:#dce6dc; --text:#233128; --muted:#657269; --brand:#2f7a3e; --warn:#9a6a00; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: var(--bg); color: var(--text); }
    header { padding: 28px 32px; background: var(--soft); border-bottom: 1px solid var(--line); }
    main { padding: 24px 32px; }
    h1 { margin: 0 0 8px; font-size: 1.7rem; }
    h2 { margin: 24px 0 10px; font-size: 1.1rem; }
    .subtitle { color: var(--muted); margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(160px, 1fr)); gap: 10px; margin-top: 16px; }
    .card { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; padding: 12px; }
    .card span { display: block; color: var(--muted); font-size: .78rem; margin-bottom: 6px; }
    .card strong { display: block; overflow-wrap: anywhere; }
    .note { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; padding: 12px; color: var(--muted); line-height: 1.45; }
    .footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--muted); font-size: .82rem; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    table { width: 100%; border-collapse: collapse; background: var(--panel); }
    th, td { border: 1px solid var(--line); padding: 7px 8px; text-align: left; vertical-align: top; font-size: .82rem; }
    th { background: var(--soft); }
    .total-row td, tr.total-row td { background: #fff4c2; color: #233128; font-weight: 700; }
    .group-summary td { background: #fff4c2; color: #233128; font-weight: 700; }
    @media print { body { background: #fff; } header, main { padding: 14mm; } .card, .note, table { break-inside: avoid; } }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } main, header { padding: 16px; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">Relat\u00f3rio obtido do Tesouro Gerencial e exportado a partir do painel local DAP.</p>
    <section class="grid">${metadata.map(([label, value]) => `<div class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</section>
  </header>
  <main>
    <section class="note"><strong>Resumo:</strong> ${escapeHtml(reportSummary(rows, columns, activeFilters, quality))}</section>
    ${tesouroContextHtml(tesouroContext)}
    <h2>Filtros aplicados</h2>
    <section class="grid">${activeFilters.map(([label, value]) => `<div class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</section>
    <h2>Principais informa\u00e7\u00f5es obtidas</h2>
    <section class="grid">${highlights.map(([label, value]) => `<div class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</section>
    ${metricAuditHtml(auditEntries)}
    <h2>Tabela</h2>
    <table>
      <thead><tr>${displayColumns.map(column => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
      <tbody>${groupedReportTableHtml(rows, columns)}</tbody>
    </table>
    <footer class="footer"><span>Desenvolvido por Guilherme Migliorini.</span><span>https://github.com/guimig/EmailBackupHub</span></footer>
  </main>
</body>
</html>`;
      return html;
    }

    function activeFilterSummary() {
      const filters = [];
      filters.push(['Busca geral', byId('globalSearch').value || 'Sem busca geral']);
      for (const [column, value] of Object.entries(columnFilters)) {
        if (value) filters.push([friendlyColumnName(column),
          typeof value === 'string' ? 'contém ' + value : Filters.describe(value, columnMetaFor(column))]);
      }
      if (columnSort.column && columnSort.direction) filters.push(['Ordena\u00e7\u00e3o', `${friendlyColumnName(columnSort.column)} (${columnSort.direction === 'az' ? 'A-Z' : 'Z-A'})`]);
      filters.push(['Totais na tabela', byId('showTotals').checked ? 'Inclu\u00eddos' : 'Ocultos']);
      filters.push(['Colunas vis\u00edveis', visibleReportColumns().map(friendlyColumnName).join(', ') || 'Nenhuma']);
      filters.push(['Agrupamento', groupColumn ? friendlyColumnName(groupColumn) : 'Sem agrupamento']);
      filters.push(['Somas por grupo', groupSumColumns.size ? [...groupSumColumns].map(friendlyColumnName).join(', ') : 'Nenhuma coluna selecionada']);
      return filters;
    }

    function tesouroContextEntries() {
      const entries = [];
      const handledMetadata = new Set(['periodicidade', 'status', 'idade_dias', 'exercicio', 'row_count']);
      appendObjectEntries(entries, 'Metadados do arquivo', report.metadata, handledMetadata);
      for (const key of ['filters', 'filter', 'filtros', 'filtro', 'applied_filters', 'tesouro_filters', 'tesouroGerencialFilters', 'parameters', 'params', 'query', 'consulta', 'criterios', 'criteria']) {
        appendObjectEntries(entries, 'Filtros/consulta do Tesouro Gerencial', report[key]);
      }
      return entries;
    }

    function metricAuditEntries() {
      const metrics = report?.metrics || {};
      const meta = report?.metrics_meta || report?.metric_sources || {};
      return Object.entries(metrics).map(([metric, value]) => {
        const source = meta[metric] || {};
        const sourceParts = [
          source.source ? `origem: ${source.source}` : null,
          source.method ? `metodo: ${source.method}` : null,
          source.line ? `linha: ${source.line}` : null,
          source.column ? `coluna: ${source.column}` : null,
          source.fallback ? 'fallback posicional' : null,
          source.status && source.status !== 'ok' ? `status: ${source.status}` : null
        ].filter(Boolean);
        return {
          metric,
          value,
          sourceText: sourceParts.join('; ') || 'Origem nao informada',
          ok: source.status === 'ok' || Boolean(source.source || source.method)
        };
      });
    }

    function renderMetricAudit() {
      const container = byId('metricAudit');
      if (!container) return;
      const entries = metricAuditEntries();
      if (!entries.length) {
        container.classList.add('is-hidden');
        container.innerHTML = '';
        return;
      }
      container.classList.remove('is-hidden');
      container.innerHTML = `<h2>Metricas auditaveis</h2><div class="metric-audit-grid">${entries.map(entry => `
        <div class="metric-audit-card">
          <span>${escapeHtml(humanizeKey(entry.metric))}</span>
          <strong>${escapeHtml(formatMetricValue(entry.value))}</strong>
          <small>${escapeHtml(entry.sourceText)}</small>
        </div>`).join('')}</div>`;
    }

    function metricAuditHtml(entries) {
      if (!entries.length) return '';
      return `<h2>Metricas auditaveis</h2><section class="grid">${entries.map(entry => `<div class="card"><span>${escapeHtml(humanizeKey(entry.metric))}</span><strong>${escapeHtml(formatMetricValue(entry.value))}</strong><br><small>${escapeHtml(entry.sourceText)}</small></div>`).join('')}</section>`;
    }

    function appendObjectEntries(target, group, value, skipKeys = new Set()) {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach((item, index) => appendObjectEntries(target, `${group} ${index + 1}`, item, skipKeys));
        return;
      }
      if (typeof value !== 'object') {
        target.push([group, value]);
        return;
      }
      for (const [key, entryValue] of Object.entries(value)) {
        if (skipKeys.has(key) || entryValue == null || entryValue === '') continue;
        const label = `${group}: ${humanizeKey(key)}`;
        if (typeof entryValue === 'object') {
          target.push([label, JSON.stringify(entryValue)]);
        } else {
          target.push([label, entryValue]);
        }
      }
    }

    function humanizeKey(key) {
      return String(key || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function tesouroContextHtml(entries) {
      if (!entries.length) return '';
      return `<h2>Metadados e filtros do Tesouro Gerencial</h2><section class="grid">${entries.map(([label, value]) => `<div class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</section>`;
    }

    function friendlyColumnName(column) {
      const columns = report.columns || [];
      const index = columns.indexOf(column);
      return friendlyColumns(columns)[index] || column || '-';
    }

    function reportSummary(rows, columns, activeFilters, quality) {
      const filterText = activeFilters.filter(([, value]) => !String(value).startsWith('Sem ') && value !== 'Ocultos').length;
      return `${rows.length} linha(s) exportada(s), ${columns.length} coluna(s), ${filterText} filtro(s)/op\u00e7\u00e3o(\u00f5es) aplicados. Qualidade da leitura: ${quality.text}.`;
    }

    function numericHighlights(rows, columns, displayColumns) {
      const totalHighlights = totalsHighlights(rows, columns, displayColumns);
      if (totalHighlights.length) return totalHighlights.slice(0, 8);
      return [
        ['Linhas exportadas', rows.length],
        ['Colunas', columns.length],
        ['Totais consolidados', 'N\u00e3o dispon\u00edveis neste relat\u00f3rio']
      ];
    }

    function totalsHighlights(rows, columns, displayColumns) {
      const byColumn = new Map(columns.map((column, index) => [column, displayColumns[index]]));
      const totals = report.totals || [];
      const grandTotals = totals.filter(total => normalize(total.label) === 'total' || normalize(total.raw?.[columns[0]]) === 'total');
      const highlights = [];
      for (const total of grandTotals) {
        const known = knownTotalHighlights(total);
        highlights.push(...(known.length ? known : genericTotalHighlights(total, columns, byColumn)));
      }
      highlights.push(...partialTotalHighlights(totals, grandTotals, columns, byColumn));
      return uniqueHighlights(highlights);
    }

    function knownTotalHighlights(total) {
      const rules = highlightRules();
      return rules.map(([label, column, terms]) => {
        const matchedColumn = findTotalColumn(total, column, terms);
        const value = numericTotalValue(total, matchedColumn);
        return Number.isFinite(value) ? [`Total ${label}`, formatMoneyValue(value)] : null;
      }).filter(Boolean);
    }

    function findTotalColumn(total, column, terms = []) {
      const keys = [...Object.keys(total?.values || {}), ...Object.keys(total?.raw || {})];
      if (keys.includes(column)) return column;
      const normalizedTerms = terms.map(normalize).filter(Boolean);
      if (normalizedTerms.length) {
        const matched = keys.find(key => normalizedTerms.every(term => normalize(fixMojibake(key)).includes(term)));
        if (matched) return matched;
      }
      return column;
    }

    function genericTotalHighlights(total, columns, byColumn) {
      return columns.map(column => {
        const displayColumn = byColumn.get(column) || inferredColumnName(column, columns.indexOf(column)) || column;
        if (!isSummableColumn(column, displayColumn)) return null;
        const value = numericTotalValue(total, column);
        return Number.isFinite(value) ? [`Total ${displayColumn}`, formatMoneyValue(value)] : null;
      }).filter(Boolean);
    }

    function partialTotalHighlights(totals, grandTotals, columns, byColumn) {
      const grandSet = new Set(grandTotals);
      const primaryRules = highlightRules();
      const primaryColumns = primaryRules.length
        ? primaryRules.slice(0, 2).map(([label, column, terms]) => ({ label, column, terms }))
        : monetaryColumns(columns, byColumn).slice(0, 2).map(column => ({ label: byColumn.get(column) || column, column }));
      const partials = [];
      for (const rule of primaryColumns) {
        for (const total of totals) {
          if (grandSet.has(total)) continue;
          const label = cleanTotalLabel(total.label || total.raw?.[columns[0]]);
          if (!label || normalize(label) === 'total') continue;
          const matchedColumn = findTotalColumn(total, rule.column, rule.terms);
          const value = numericTotalValue(total, matchedColumn);
          if (Number.isFinite(value) && value !== 0) {
            partials.push({ label: `${shortText(label, 34)} - ${rule.label}`, value });
          }
        }
      }
      return partials
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 3)
        .map(item => [item.label, formatMoneyValue(item.value)]);
    }

    function highlightRules() {
      const definitions = reportDefinition().highlights || [];
      if (definitions.length) {
        return definitions.map(item => [item.label, item.column, item.match_terms]);
      }
      return reportHighlightRules[report?.slug] || [];
    }

    function monetaryColumns(columns, byColumn) {
      return columns.filter(column => isSummableColumn(column, byColumn.get(column) || column));
    }

    function numericTotalValue(total, column) {
      const values = total?.values || {};
      if (Object.prototype.hasOwnProperty.call(values, column)) {
        const value = typeof values[column] === 'number' ? values[column] : parseBrNumber(values[column]);
        if (Number.isFinite(value)) return value;
      }
      return parseBrNumber(total?.raw?.[column]);
    }

    function uniqueHighlights(items) {
      const seen = new Set();
      return items.filter(([label]) => {
        const key = normalize(label);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function cleanTotalLabel(label) {
      return fixMojibake(label).replace(/\s+/g, ' ').trim();
    }

    function shortText(value, max) {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 3)}...` : text;
    }

    function formatMoneyValue(value) {
      return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatMetricValue(value) {
      const number = typeof value === 'number' ? value : parseBrNumber(value);
      return Number.isFinite(number) ? formatMoneyValue(number) : String(value ?? '-');
    }

    function isSummableColumn(column, displayColumn) {
      const label = normalize(fixMojibake(`${column || ''} ${displayColumn || ''}`));
      const classificationPattern = /(codigo|cod\.?|classificacao|fonte|recurso|ug|uo|ptres|programa|acao|plano|natureza|nd|elemento|subitem|modalidade|categoria|grupo|identificador|id\b|cpf|cnpj|conta contabil|rip|mes|ano|data)/;
      if (/(saldo|r\$|moeda origem|despesas empenhadas|despesas liquidadas|despesas pagas)/.test(label)) return true;
      if (classificationPattern.test(label)) return false;
      return /(r\$|valor|saldo|total|pago|pagos|pagamento|empenhado|empenhos|liquidado|liquidar|a pagar|credito|provisionado|provisionamento|despesa|arrecadado|inscrito|cancelado|disponivel|movim liquido|moeda origem)/.test(label);
    }
    function restoreStateFromUrl() {
      restoringState = true;
      const params = new URLSearchParams(location.search);
      const columns = report.columns || [];
      byId('globalSearch').value = params.get('q') || '';
      byId('showTotals').checked = params.get('totals') === '1';
      const visible = columnsFromIndexes(params.get('cols'));
      visibleColumns = new Set(visible.length ? visible : columns);
      groupSumColumns = new Set(columnsFromIndexes(params.get('groupSums')).filter(eligibleSumColumn));
      const groupIndex = params.get('group');
      groupColumn = groupIndex === null || groupIndex === '' ? '' : columns[Number(groupIndex)] || '';
      const sortIndex = params.get('sort');
      columnSort = {
        column: sortIndex === null || sortIndex === '' ? null : columns[Number(sortIndex)] || null,
        direction: ['az', 'za'].includes(params.get('dir')) ? params.get('dir') : ''
      };
      const requestedSize = Number(params.get('ps'));
      pageSize = [25, 50, 100].includes(requestedSize) ? requestedSize : 50;
      const requestedPage = Number(params.get('p'));
      currentPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
      columnFilters = {};
      columns.forEach((column, index) => {
        const typed = params.get(`tf${index}`);
        if (typed && typed.length <= 4000) {
          try {
            const parsed = JSON.parse(typed);
            if (Filters.validFilter(parsed, columnMetaFor(column))) {
              columnFilters[column] = parsed;
              return;
            }
          } catch (error) {
            console.warn('Filtro compartilhado inválido ignorado:', index, error);
          }
        }
        // Legacy URLs from prior releases use text substring filters f0, f1...
        const legacy = params.get(`f${index}`);
        if (legacy && legacy.length <= 500) columnFilters[column] = legacy;
      });
      restoringState = false;
    }

    function updateUrlState() {
      if (restoringState || !report) return;
      const params = new URLSearchParams(location.search);
      const columns = report.columns || [];
      params.set('report', reportUrl());
      setOrDelete(params, 'q', byId('globalSearch').value);
      params.set('totals', byId('showTotals').checked ? '1' : '0');
      setOrDelete(params, 'cols', visibleColumns.size === columns.length ? '' : indexList(visibleReportColumns()));
      params.delete('customTotals');
      setOrDelete(params, 'group', groupColumn ? String(columnIndex(groupColumn)) : '');
      setOrDelete(params, 'groupSums', indexList([...groupSumColumns]));
      setOrDelete(params, 'sort', columnSort.column ? String(columnIndex(columnSort.column)) : '');
      setOrDelete(params, 'dir', columnSort.direction);
      setOrDelete(params, 'ps', pageSize === 50 ? '' : String(pageSize));
      setOrDelete(params, 'p', currentPage <= 1 ? '' : String(currentPage));
      columns.forEach((column, index) => {
        const spec = columnFilters[column];
        setOrDelete(params, `f${index}`, typeof spec === 'string' ? spec : '');
        setOrDelete(params, `tf${index}`, spec && typeof spec === 'object' ? JSON.stringify(spec) : '');
      });
      history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
    }

    function setOrDelete(params, key, value) {
      if (value == null || value === '') params.delete(key);
      else params.set(key, value);
    }

    function parseBrNumber(value) {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      let text = String(value ?? '').trim();
      const negative = text.startsWith('(') && text.endsWith(')');
      if (negative) text = text.slice(1, -1).trim();
      text = text.replace(/^R\$\s*/i, '').replace(/\s*%$/, '').trim();
      if (!/^[+-]?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)$/.test(text)) return null;
      if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
      else if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(text)) text = text.replace(/\./g, '');
      const number = Number(text);
      return Number.isFinite(number) ? (negative ? -number : number) : null;
    }

    function csvCell(value) {
      const text = String(value ?? '');
      // Conservar zeros e evitar interpretacao de texto como formula em planilhas.
      const numeric = /^[+-]?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)$/.test(text.trim());
      const safeText = !numeric && (/^[\t\r\n]/.test(text) || /^\s*[=+@-]/.test(text)) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    }
    function download(name, content, type = 'text/csv;charset=utf-8') {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    }
    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
    }



    function savedViewStorage() {
      try { return window.localStorage; } catch { return null; }
    }

    function setSavedViewStatus(message) {
      const status = byId('savedViewStatus');
      if (status) status.textContent = message || '';
    }

    function currentViewSettings() {
      return {
        search: byId('globalSearch').value,
        visibleColumns: [...visibleColumns],
        columnFilters,
        sort: columnSort,
        groupColumn,
        groupSumColumns: [...groupSumColumns],
        showTotals: byId('showTotals').checked,
        pageSize,
        wrapCells: byId('wrapCells').checked,
        baseColumnWidth,
        columnWidths: Object.fromEntries(columnWidths),
        chart: chartSettings ? {
          mode: chartSettings.mode,
          type: chartSettings.type,
          dimension: chartSettings.dimension,
          measure: chartSettings.measure,
          limit: chartSettings.limit
        } : null
      };
    }

    function refreshSavedViews(preferredName = '') {
      if (!report || !SavedViews) return;
      const data = SavedViews.read(savedViewStorage(), report);
      const select = byId('savedViewSelect');
      if (!select) return;
      const oldValue = preferredName || select.value;
      select.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = data.views.length ? 'Selecione uma consulta...' : 'Nenhuma consulta salva';
      select.appendChild(placeholder);
      for (const view of data.views) {
        const item = document.createElement('option');
        item.value = view.name;
        item.textContent = view.name;
        select.appendChild(item);
      }
      select.value = data.views.some(view => view.name === oldValue) ? oldValue : '';
      byId('loadView').disabled = !select.value;
      byId('deleteView').disabled = !select.value;
      byId('saveView').disabled = !data.available;
      byId('savedViewsCount').textContent = data.views.length ? '(' + data.views.length + ')' : '';
      if (data.error) setSavedViewStatus(data.error);
    }

    function saveCurrentView() {
      if (!report || !SavedViews) return;
      const name = byId('savedViewName').value.trim();
      const result = SavedViews.save(savedViewStorage(), report, name,
        currentViewSettings(), Filters, columnMetaFor);
      setSavedViewStatus(result.message);
      if (result.ok) {
        byId('savedViewName').value = '';
        refreshSavedViews(result.name);
      }
    }

    function applySavedView() {
      const name = byId('savedViewSelect').value;
      if (!name || !report || !SavedViews) return;
      const data = SavedViews.read(savedViewStorage(), report);
      const view = data.views.find(item => item.name === name);
      if (!view) { setSavedViewStatus('Consulta não encontrada neste navegador.'); return; }
      const result = SavedViews.reconcile(report, view.snapshot, Filters, columnMetaFor);
      const state = result.state;
      clearTimeout(renderTimer);
      byId('globalSearch').value = state.search;
      columnFilters = Object.fromEntries(Object.entries(state.columnFilters));
      columnSort = { ...state.sort };
      visibleColumns = new Set(state.visibleColumns);
      groupColumn = state.groupColumn;
      groupSumColumns = new Set(state.groupSumColumns);
      pageSize = state.pageSize;
      currentPage = 1;
      byId('showTotals').checked = state.showTotals;
      byId('wrapCells').checked = state.wrapCells;
      baseColumnWidth = state.baseColumnWidth;
      columnWidths = new Map(Object.entries(state.columnWidths));
      byId('columnWidthRange').value = String(baseColumnWidth);
      filteredCache = null;
      closeFilterEditor();
      applyWrapPreference();
      renderTableShell();
      renderColumnVisibilityControls();
      renderGroupingControls();
      renderRows();
      chartSettings = state.chart ? { ...state.chart, rowIndex:0 } : null;
      chartSelectedRow = null;
      prepareReportChartControls();
      if (byId('reportChart')?.open) renderReportChart();
      const removed = result.removedColumns.length;
      setSavedViewStatus(removed
        ? 'Consulta aplicada. ' + removed + ' coluna(s) já não existem neste relatório e foram ignoradas.'
        : 'Consulta "' + name + '" aplicada. A URL foi atualizada para compartilhar a seleção.');
    }

    function deleteSavedView() {
      const name = byId('savedViewSelect').value;
      if (!name || !report || !SavedViews) return;
      if (typeof window.confirm === 'function' && !window.confirm('Excluir a consulta "' + name + '" deste navegador?')) return;
      const result = SavedViews.remove(savedViewStorage(), report, name);
      refreshSavedViews();
      setSavedViewStatus(result.message);
    }

    async function copyCurrentViewLink() {
      if (!report) return;
      updateUrlState();
      try {
        if (!window.navigator?.clipboard?.writeText) throw new Error('Área de transferência indisponível');
        await window.navigator.clipboard.writeText(window.location.href);
        setSavedViewStatus('Link da consulta atual copiado. Ele inclui os filtros e pode ser compartilhado.');
      } catch {
        setSavedViewStatus('Não foi possível copiar automaticamente. Copie o endereço da barra do navegador.');
      }
    }

    function setExpanded(next) {
      expanded = Boolean(next);
      document.body.classList.toggle('table-expanded', expanded);
      byId('expandTable').textContent = expanded ? 'Fechar ampliação' : 'Ampliar tabela';
      byId('expandTable').setAttribute('aria-pressed', String(expanded));
      if (expanded) byId('tableWrap').focus();
    }

    function applyWrapPreference() {
      byId('readerWorkspace').classList.toggle('wrap-cells', byId('wrapCells').checked);
    }

    function clearColumnWidths() {
      columnWidths.clear();
      baseColumnWidth = 250;
      byId('columnWidthRange').value = '250';
      applyColumnSizing();
    }

    byId('globalSearch').addEventListener('input', () => {
      currentPage = 1;
      scheduleRenderRows();
    });
    byId('clearFilters').addEventListener('click', () => {
      clearTimeout(renderTimer);
      columnFilters = {};
      columnSort = { column: null, direction: '' };
      groupColumn = '';
      groupSumColumns = new Set();
      currentPage = 1;
      byId('globalSearch').value = '';
      closeFilterEditor();
      renderTableShell();
      renderGroupingControls();
      renderRows();
    });
    byId('openFilterPanel').addEventListener('click', () => openFilterEditor(filterColumn || visibleReportColumns()[0] || report?.columns?.[0]));
    byId('filterColumnPicker').addEventListener('change', event => openFilterEditor(event.target.value));
    byId('closeFilterEditor').addEventListener('click', closeFilterEditor);
    byId('applyColumnFilter').addEventListener('click', applyColumnFilter);
    byId('removeColumnFilter').addEventListener('click', () => removeColumnFilter(filterColumn));
    byId('reportChart').addEventListener('toggle', () => {
      if (byId('reportChart').open) {
        prepareReportChartControls();
        renderReportChart();
      }
    });
    ['chartMode','chartType','chartDimension','chartMeasure','chartLimit','chartRecord'].forEach(id =>
      byId(id).addEventListener('change', onChartControlsChanged));
    byId('chartUseSuggestion').addEventListener('click', applyChartSuggestion);
    byId('pageSize').addEventListener('change', event => {
      const size = Number(event.target.value);
      if (![25, 50, 100].includes(size)) return;
      pageSize = size;
      currentPage = 1;
      renderRows();
    });
    byId('previousPage').addEventListener('click', () => {
      if (currentPage <= 1) return;
      currentPage -= 1;
      renderRows();
    });
    byId('nextPage').addEventListener('click', () => {
      const total = filteredRows().length;
      if (currentPage * pageSize >= total) return;
      currentPage += 1;
      renderRows();
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (!byId('filterEditor').hidden) closeFilterEditor();
      else if (!byId('columnPanel').hidden) closeColumnPanel();
      else if (expanded && !byId('rowDialog').open) setExpanded(false);
    });
    byId('toggleColumns').addEventListener('click', toggleColumnPanel);
    byId('closeColumnPanel').addEventListener('click', closeColumnPanel);
    byId('columnSearch').addEventListener('input', refreshColumnSearch);
    byId('showAllColumns').addEventListener('click', () => selectVisibleColumns(report?.columns || []));
    byId('resetColumns').addEventListener('click', () => selectVisibleColumns(suggestedVisibleColumns()));
    byId('columnWidthRange').addEventListener('input', event => {
      baseColumnWidth = Number(event.target.value) || 250;
      columnWidths.clear();
      applyColumnSizing();
    });
    byId('resetWidths').addEventListener('click', clearColumnWidths);
    byId('wrapCells').addEventListener('change', applyWrapPreference);
    byId('expandTable').addEventListener('click', () => setExpanded(!expanded));
    byId('closeRowDialog').addEventListener('click', closeRowDetails);
    byId('table').addEventListener('click', event => {
      const button = event.target.closest('[data-open-row]');
      if (button) {
        openRowDetails(Number(button.dataset.openRow));
        return;
      }
      const row = event.target.closest('tbody tr[data-row-index]');
      if (row) openRowDetails(Number(row.dataset.rowIndex));
    });
    byId('saveView').addEventListener('click', saveCurrentView);
    byId('loadView').addEventListener('click', applySavedView);
    byId('deleteView').addEventListener('click', deleteSavedView);
    byId('copyViewLink').addEventListener('click', copyCurrentViewLink);
    byId('savedViewSelect').addEventListener('change', event => {
      const chosen = Boolean(event.target.value);
      byId('loadView').disabled = !chosen;
      byId('deleteView').disabled = !chosen;
    });
    byId('exportCsv').addEventListener('click', exportCsv);
    byId('exportHtml').addEventListener('click', exportHtmlReport);
    byId('printHtml').addEventListener('click', printHtmlReport);
    byId('themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    initTheme();
    byId('showTotals').addEventListener('change', () => {
      currentPage = 1;
      renderRows();
    });
    loadReport().catch(error => { byId('title').textContent = `Erro ao carregar relatório: ${error.message}`; });
