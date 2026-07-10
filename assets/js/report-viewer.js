let report = null;
    let columnFilters = {};
    let columnSort = { column: null, direction: '' };
    let visibleColumns = new Set();
    let groupColumn = '';
    let groupSumColumns = new Set();
    let renderTimer = null;
    let restoringState = false;
    let reportDefinitions = {};
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
      visibleColumns = new Set(report.columns || []);
      groupColumn = '';
      groupSumColumns = new Set();
      byId('showTotals').checked = true;
      restoreStateFromUrl();
      ensureDefaultVisibleColumns();
      renderTableShell();
      renderColumnVisibilityControls();
      renderGroupingControls();
      renderRows();
    }

    function filteredRows() {
      const term = normalize(byId('globalSearch').value);
      const rows = visibleRows().filter(item => {
        const row = item.raw || item;
        const values = Object.values(row).join(' ');
        if (term && !normalize(values).includes(term)) return false;
        return Object.entries(columnFilters).every(([column, value]) => !value || normalize(row[column]).includes(normalize(value)));
      });
      if (!columnSort.column || !columnSort.direction) return rows;
      return rows.sort((a, b) => {
        const av = sortCellValue((a.raw || a)[columnSort.column]);
        const bv = sortCellValue((b.raw || b)[columnSort.column]);
        return compareCellValues(av, bv) * (columnSort.direction === 'az' ? 1 : -1);
      });
    }

    function visibleReportColumns() {
      const columns = report?.columns || [];
      if (!visibleColumns.size) return columns;
      return columns.filter(column => visibleColumns.has(column));
    }

    function ensureDefaultVisibleColumns() {
      const columns = report?.columns || [];
      const params = new URLSearchParams(location.search);
      if (!params.has('cols') || !visibleColumns.size) {
        visibleColumns = new Set(columns);
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

    function groupTotals(rows) {
      return [...groupSumColumns].map(column => {
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
        if (generated && friendly[sourceIndex]) return friendly[sourceIndex];
        if (/^Coluna \d+$/.test(column || '')) return index === 0 ? 'Descricao' : `Valor ${index}`;
        return column;
      });
    }

    function inferredColumnName(column, index) {
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

    function renderTableShell() {
      const columns = visibleReportColumns();
      const displayColumns = friendlyColumns(columns);
      byId('table').innerHTML = `
        <thead><tr>${columns.map((column, index) => `
          <th>
            ${escapeHtml(displayColumns[index])}
            <input data-column="${escapeHtml(column)}" placeholder="Filtrar" value="${escapeHtml(columnFilters[column] || '')}">
            <select data-sort-column="${escapeHtml(column)}" aria-label="Ordenar ${escapeHtml(displayColumns[index])}">
              <option value="" ${columnSort.column === column && !columnSort.direction ? 'selected' : ''}>Ordem original</option>
              <option value="az" ${columnSort.column === column && columnSort.direction === 'az' ? 'selected' : ''}>A-Z</option>
              <option value="za" ${columnSort.column === column && columnSort.direction === 'za' ? 'selected' : ''}>Z-A</option>
            </select>
          </th>
        `).join('')}</tr></thead>
        <tbody></tbody>
        <tfoot></tfoot>
      `;
      document.querySelectorAll('th input').forEach(input => {
        input.addEventListener('input', event => {
          columnFilters[event.target.dataset.column] = event.target.value;
          scheduleRenderRows();
        });
      });
      document.querySelectorAll('th select').forEach(select => {
        select.addEventListener('change', event => {
          document.querySelectorAll('th select').forEach(item => {
            if (item !== event.target) item.value = '';
          });
          columnSort = { column: event.target.dataset.sortColumn, direction: event.target.value };
          renderRows();
        });
      });
    }

    function renderColumnVisibilityControls() {
      const columns = report.columns || [];
      const displayColumns = friendlyColumns(columns);
      const options = byId('columnVisibilityOptions');
      options.innerHTML = columns.map((column, index) => `
        <label>
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
          renderGroupingControls();
          renderRows();
        });
      });
    }

    function renderGroupingControls() {
      const columns = report.columns || [];
      const displayColumns = friendlyColumns(columns);
      const groupSelect = byId('groupColumn');
      groupSelect.innerHTML = `<option value="">Sem agrupamento</option>${columns.map((column, index) => `<option value="${escapeHtml(column)}">${escapeHtml(displayColumns[index])}</option>`).join('')}`;
      groupSelect.value = groupColumn || '';
      groupSelect.onchange = event => {
        groupColumn = event.target.value;
        renderRows();
      };
      const options = byId('groupSumOptions');
      options.innerHTML = columns.map((column, index) => `
        <label>
          <input type="checkbox" data-group-sum-column="${escapeHtml(column)}" ${groupSumColumns.has(column) ? 'checked' : ''}>
          <span>${escapeHtml(displayColumns[index])}</span>
        </label>
      `).join('');
      options.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', event => {
          const column = event.target.dataset.groupSumColumn;
          if (event.target.checked) groupSumColumns.add(column);
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
      const tbody = byId('table').querySelector('tbody');
      tbody.innerHTML = groupedTableHtml(rows, columns);
      updateUrlState();
    }

    function groupedTableHtml(rows, columns) {
      if (!groupColumn) {
        return rows.map(item => rowHtml(item, columns)).join('');
      }
      const groupHtml = groupedRows(rows).map(group => {
        const label = `${friendlyColumnName(groupColumn)}: ${group.key}`;
        const totals = groupTotals(group.rows);
        return `
          <tr class="group-row"><td colspan="${Math.max(1, columns.length)}">${escapeHtml(label)} (${group.rows.length} linha(s))</td></tr>
          ${group.rows.map(item => rowHtml(item, columns)).join('')}
          ${groupSummaryRowHtml(totals, columns, 'Total do grupo')}
        `;
      }).join('');
      return `${groupHtml}${groupSummaryRowHtml(groupTotals(rows), columns, 'Total geral do agrupamento')}`;
    }

    function rowHtml(item, columns) {
      const row = item.raw || item;
      const isTotal = item.type === 'total';
      return `<tr class="${isTotal ? 'total-row' : ''}">${columns.map(column => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`;
    }

    function groupSummaryRowHtml(totals, columns, label) {
      if (!totals.length) return '';
      const totalByColumn = new Map(totals.map(item => [item.column, item]));
      return `<tr class="group-summary">${columns.map((column, index) => {
        const total = totalByColumn.get(column);
        if (total) return `<td>${escapeHtml(formatMoneyValue(total.total))}</td>`;
        return `<td>${index === 0 ? escapeHtml(label) : ''}</td>`;
      }).join('')}</tr>`;
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
        if (value) filters.push([friendlyColumnName(column), value]);
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
      if (classificationPattern.test(label)) return false;
      return /(r\$|valor|saldo|total|pago|pagos|pagamento|empenhado|empenhos|liquidado|liquidar|a pagar|credito|provisionado|provisionamento|despesa|arrecadado|inscrito|cancelado|disponivel|movim liquido|moeda origem)/.test(label);
    }
    function restoreStateFromUrl() {
      restoringState = true;
      const params = new URLSearchParams(location.search);
      const columns = report.columns || [];
      byId('globalSearch').value = params.get('q') || '';
      byId('showTotals').checked = params.get('totals') !== '0';
      const visible = columnsFromIndexes(params.get('cols'));
      visibleColumns = new Set(visible.length ? visible : columns);
      groupSumColumns = new Set(columnsFromIndexes(params.get('groupSums')));
      const groupIndex = params.get('group');
      groupColumn = groupIndex === null || groupIndex === '' ? '' : columns[Number(groupIndex)] || '';
      const sortIndex = params.get('sort');
      columnSort = {
        column: sortIndex === null || sortIndex === '' ? null : columns[Number(sortIndex)] || null,
        direction: params.get('dir') || ''
      };
      columnFilters = {};
      columns.forEach((column, index) => {
        const value = params.get(`f${index}`);
        if (value) columnFilters[column] = value;
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
      columns.forEach((column, index) => setOrDelete(params, `f${index}`, columnFilters[column] || ''));
      history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
    }

    function setOrDelete(params, key, value) {
      if (value == null || value === '') params.delete(key);
      else params.set(key, value);
    }

    function parseBrNumber(value) {
      if (typeof value === 'number') return value;
      const clean = String(value || '').replace(/[^\d,.-]/g, '');
      if (!clean) return null;
      const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
      const number = Number(normalized);
      return Number.isFinite(number) ? number : null;
    }

    function csvCell(value) { return `"${String(value || '').replace(/"/g, '""')}"`; }
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

    byId('globalSearch').addEventListener('input', scheduleRenderRows);
    byId('clearFilters').addEventListener('click', () => {
      columnFilters = {};
      columnSort = { column: null, direction: '' };
      visibleColumns = new Set(report?.columns || []);
      groupColumn = '';
      groupSumColumns = new Set();
      byId('globalSearch').value = '';
      byId('showTotals').checked = true;
      document.querySelectorAll('th input').forEach(input => { input.value = ''; });
      document.querySelectorAll('th select').forEach(select => { select.value = ''; });
      renderTableShell();
      renderColumnVisibilityControls();
      renderGroupingControls();
      renderRows();
    });
    byId('exportCsv').addEventListener('click', exportCsv);
    byId('exportHtml').addEventListener('click', exportHtmlReport);
    byId('printHtml').addEventListener('click', printHtmlReport);
    byId('themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    initTheme();
    byId('showTotals').addEventListener('change', renderRows);
    loadReport().catch(error => { byId('title').textContent = `Erro ao carregar relatório: ${error.message}`; });
