let indexData = null;
    let searchData = null;
    let reports = [];
    let financialReports = {};
    let reportDefinitions = {};
    let sortKey = 'title';
    let sortDir = 1;

    const byId = id => document.getElementById(id);

    const THEME_KEY = 'dap-dashboard-theme';

    function applyTheme(theme) {
      const nextTheme = theme === 'dark' ? 'dark' : 'light';
      document.documentElement.dataset.theme = nextTheme;
      try { localStorage.setItem(THEME_KEY, nextTheme); } catch {}
      const button = byId('themeToggle');
      if (button) button.textContent = nextTheme === 'dark' ? 'Tema claro' : 'Tema escuro';
      if (Object.keys(financialReports).length) renderFinancialSummary();
    }

    function initTheme() {
      let storedTheme = 'light';
      try { storedTheme = localStorage.getItem(THEME_KEY) || 'light'; } catch {}
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
    const qualityCodes = {
      date_from_filename: 'D',
      date_from_mtime: 'M',
      inconsistent_columns: 'L',
      totals_separated: 'T'
    };
    const friendlyNames = {
      '2024-acompanhamento-das-liquidacoes-e-pagamentos-por-natureza-de-despesa': 'Liquidações e Pagamentos por Natureza - 2024',
      '2025-acompanhamento-das-liquidacoes-e-pagamentos-por-natureza-de-despesa': 'Liquidações e Pagamentos por Natureza - 2025',
      'acompanhamento-das-liquidacoes-e-pagamentos-por-data': 'Liquidações e Pagamentos por Data',
      'acompanhamento-das-liquidacoes-e-pagamentos-por-natureza-de-despesa': 'Liquidações e Pagamentos por Natureza',
      'credito-disponivel-mes-lancamento': 'Crédito Disponível por Mês de Lançamento',
      'despesas-empenhadas-liquidadas-e-pagas-mes-lancamento': 'Despesas Empenhadas, Liquidadas e Pagas por Mês',
      'despesas-empenhadas-liquidadas-e-pagas-2024': 'Despesas Empenhadas, Liquidadas e Pagas - 2024',
      'despesas-empenhadas-liquidadas-e-pagas-2025': 'Despesas Empenhadas, Liquidadas e Pagas - 2025',
      'despesas-empenhadas-liquidadas-e-pagas-strictu-sensu': 'Despesas Empenhadas, Liquidadas e Pagas - Stricto Sensu',
      'evolucao-das-despesas-empenhadas': 'Evolução das Despesas Empenhadas',
      'imoveis-por-ug-conta-contabil-e-rip': 'Imóveis por UG, Conta Contábil e RIP',
      'limite-de-saque-conta-contabil': 'Limite de Saque por Conta Contábil',
      'provisionamentos': 'Provisionamentos',
      'recolhimento-proprio-gru': 'Recolhimento Próprio - GRU',
      'restos-a-pagar-rap': 'Restos a Pagar - RAP',
      'saldo-de-empenhos-a-liquidar-mes-a-mes': 'Saldo de Empenhos a Liquidar Mês a Mês',
      'saldo-patrimonio-e-almoxarifado-conta-contabil': 'Saldo de Patrimônio e Almoxarifado por Conta Contábil',
      'saldo-por-natureza-de-despesa': 'Saldo por Natureza de Despesa',
      'saldos-de-contas-de-contratos': 'Saldos de Contas de Contratos',
      'saldos-de-empenhos-do-exercicio-conta-contabil': 'Saldos de Empenhos do Exercício por Conta Contábil',
      'suprimento-de-fundos-empenhos': 'Suprimento de Fundos - Empenhos',
      'suprimento-de-fundos-liquidacoes-e-pagamentos': 'Suprimento de Fundos - Liquidações e Pagamentos'
    };

    async function loadData() {
      const [indexResponse, searchResponse, definitions] = await Promise.all([
        fetch('data/index.json'),
        fetch('data/search-index.json'),
        loadReportDefinitions()
      ]);
      indexData = await indexResponse.json();
      searchData = await searchResponse.json();
      reportDefinitions = definitions;
      const textBySlug = Object.fromEntries((searchData.documents || []).map(item => [item.slug, item.text || '']));
      reports = (indexData.reports || []).map(report => ({ ...report, displayTitle: friendlyTitle(report), searchText: textBySlug[report.slug] || '' }));
      await loadFinancialReports();
      populateFilters();
      render();
    }

    async function loadReportDefinitions() {
      try {
        const response = await fetch('data/report-definitions.json');
        if (!response.ok) return {};
        const payload = await response.json();
        return payload.reports || {};
      } catch {
        return {};
      }
    }

    function populateFilters() {
      const values = [...new Set(reports.map(report => report.metadata.periodicidade).filter(Boolean))].sort();
      byId('periodicity').insertAdjacentHTML('beforeend', values.map(value => `<option value="${value}">${value}</option>`).join(''));
    }

    function filteredReports() {
      const term = normalize(byId('search').value);
      const periodicity = byId('periodicity').value;
      const status = byId('status').value;
      return reports.filter(report => {
        const matchesTerm = !term || normalize(`${report.displayTitle} ${report.title} ${report.date} ${report.html_path} ${report.searchText}`).includes(term);
        const matchesPeriodicity = !periodicity || report.metadata.periodicidade === periodicity;
        const matchesStatus = !status || reportStatus(report) === status;
        return matchesTerm && matchesPeriodicity && matchesStatus;
      }).sort((a, b) => {
        const av = sortValue(a, sortKey);
        const bv = sortValue(b, sortKey);
        return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true }) * sortDir;
      });
    }

    function sortValue(report, key) {
      if (key === 'title') return report.displayTitle || report.title;
      if (key in report) return report[key];
      return report.metadata[key] || '';
    }

    function friendlyTitle(report) {
      const definition = reportDefinitions[report.slug] || {};
      return definition.title || friendlyNames[report.slug] || report.title || report.slug || 'Relatório';
    }

    function qualitySummary(report) {
      const quality = report.quality || {};
      const rawIssues = quality.issues || [];
      const warnings = [...(quality.warnings || []), ...rawIssues.filter(issue => infoQualityCodes.has(issue))];
      const issues = rawIssues.filter(issue => !infoQualityCodes.has(issue));
      if (issues.length) return { ok: false, codes: ['P'], text: issues.map(qualityLabel).join(', ') };
      if (warnings.length) {
        const uniqueWarnings = [...new Set(warnings)];
        return { ok: true, codes: uniqueWarnings.map(warning => qualityCodes[warning] || 'O'), text: uniqueWarnings.map(qualityLabel).join(', ') };
      }
      return { ok: true, codes: ['OK'], text: 'sem alerta' };
    }

    function qualityBadges(report) {
      const quality = qualitySummary(report);
      const badgeClass = quality.ok ? (quality.codes[0] === 'OK' ? '' : ' warn') : ' bad';
      return `<div class="quality-badges" title="${escapeHtml(quality.text)}">${quality.codes.map(code => `<span class="quality-code${badgeClass}">${escapeHtml(code)}</span>`).join('')}</div>`;
    }
    function qualityLabel(code) {
      return qualityLabels[code] || code;
    }

    async function loadFinancialReports() {
      const slugs = [
        'saldo-de-empenhos-a-liquidar-mes-a-mes',
        'saldos-de-empenhos-do-exercicio-conta-contabil',
        'despesas-empenhadas-liquidadas-e-pagas-mes-lancamento',
        'restos-a-pagar-rap',
        'recolhimento-proprio-gru',
        'credito-disponivel-mes-lancamento',
        'provisionamentos'
      ];
      const targets = reports.filter(report => slugs.includes(report.slug));
      const loaded = await Promise.all(targets.map(async report => {
        try {
          const [reportResponse, seriesResponse] = await Promise.all([
            fetch(report.json_path),
            report.series_path ? fetch(report.series_path).catch(() => null) : null
          ]);
          const doc = await reportResponse.json();
          if (seriesResponse?.ok) doc.series_data = await seriesResponse.json();
          return [report.slug, doc];
        } catch {
          return [report.slug, null];
        }
      }));
      financialReports = Object.fromEntries(loaded.filter(([, doc]) => doc));
    }

    function reportStatus(report) {
      const metadata = report.metadata || {};
      if (metadata.periodicidade === 'diaria' && metadata.status === 'desatualizado') {
        const today = new Date();
        if (today.getDay() === 1 && Number(metadata.idade_dias) <= 2) return 'atualizado';
      }
      return metadata.status || '';
    }

    function reportLimit(report) {
      const metadata = report.metadata || {};
      if (metadata.periodicidade === 'diaria' && new Date().getDay() === 1 && metadata.limite_dias != null) {
        return Math.max(Number(metadata.limite_dias), 2);
      }
      return metadata.limite_dias;
    }

    function render() {
      const rows = filteredReports();
      byId('totalReports').textContent = reports.length;
      byId('updatedReports').textContent = reports.filter(report => reportStatus(report) === 'atualizado').length;
      byId('staleReports').textContent = reports.filter(report => reportStatus(report) === 'desatualizado').length;
      byId('qualityIssues').textContent = reports.filter(report => !qualitySummary(report).ok).length;
      renderFinancialSummary();
      byId('rows').innerHTML = rows.map(report => `
        <tr>
          <td><a href="report-viewer.html?report=${encodeURIComponent(report.json_path)}">${escapeHtml(report.displayTitle)}</a></td>
          <td>${report.date}</td>
          <td><span class="tag">${report.metadata.periodicidade}</span></td>
          <td class="${reportStatus(report) === 'atualizado' ? 'ok' : 'bad'}">${reportStatus(report)}</td>
          <td>${report.metadata.idade_dias} dias${reportLimit(report) != null ? ` / limite ${reportLimit(report)}` : ''}</td>
          <td>${qualityBadges(report)}</td>
          <td><a href="${report.html_path}">HTML</a> | <a href="${report.json_path}">JSON</a> | <a href="${report.series_path}">Série</a></td>
        </tr>
      `).join('');
    }

    function renderFinancialSummary() {
      const committed = firstValue([
        metricValue('despesas-empenhadas-liquidadas-e-pagas-mes-lancamento', 'empenhado', ['Valor 7']),
        metricValue('saldos-de-empenhos-do-exercicio-conta-contabil', 'empenhado', ['Empenhado'])
      ]);
      const liquidated = firstValue([
        metricValue('despesas-empenhadas-liquidadas-e-pagas-mes-lancamento', 'liquidado', ['Valor 8']),
        metricValue('saldos-de-empenhos-do-exercicio-conta-contabil', 'liquidado_a_pagar', ['Valor 9'])
      ]);
      const paid = firstValue([
        metricValue('saldos-de-empenhos-do-exercicio-conta-contabil', 'pago', ['Valor 10']),
        metricValue('despesas-empenhadas-liquidadas-e-pagas-mes-lancamento', 'pago', ['Valor 9'])
      ]);
      const rapPaid = metricValue('restos-a-pagar-rap', 'rap_pago', ['Valor 11']);
      const rapPayable = metricValue('restos-a-pagar-rap', 'rap_a_pagar', ['Valor 12']);
      const gru = metricValue('recolhimento-proprio-gru', 'gru_arrecadada', ['last']);
      const provisioned = metricValue('provisionamentos', 'provisionado', ['last']);
      const credit = metricValue('credito-disponivel-mes-lancamento', 'credito_disponivel', ['last']);
      const rapTotal = sumAudit('Restos a pagar total', [rapPaid, rapPayable]);
      const budget = provisioned;
      const committedRatio = ratio(committed, provisioned);
      const liquidatedRatio = ratio(liquidated, committed);
      const paidRatio = ratio(paid, liquidated);
      const rapPaidRatio = ratio(rapPaid, rapTotal);
      const provisionOpen = subtractAudit('Saldo estimado a empenhar', provisioned, committed);
      const creditUsed = subtractAudit('Provisionado utilizado ou indisponível', budget, credit);

      setText('budgetBase', formatMoney(budget));
      setText('creditAvailable', formatMoney(credit));
      setText('rapTotal', formatMoney(rapTotal));
      setText('gruCollected', formatMoney(gru));
      setText('committedTotal', formatMoney(committed));
      setText('liquidatedTotal', formatMoney(liquidated));
      setText('paidTotal', formatMoney(paid));
      setText('financePanelDate', latestFinancialDate());
      setText('trendValue', isAvailable(committed) ? `${formatMoney(committed)} empenhados` : 'indisponivel');
      setText('provisionShareValue', formatPercent(committed, provisioned));
      setText('creditShareValue', formatPercent(credit, budget));
      setText('rapShareValue', formatPercent(rapPaid, rapTotal));
      setText('gruValue', formatMoney(gru));
      setText('committedGaugeValue', formatPercent(committed, provisioned));
      setText('liquidatedGaugeValue', formatPercent(liquidated, committed));
      setText('paidGaugeValue', formatPercent(paid, liquidated));

      renderExpenseHistory('expenseTrendChart', { committed, liquidated, paid });
      renderDonut('provisionDonut', [committed, provisionOpen], ['var(--accent)', 'var(--accent-2)']);
      renderCreditHistory('creditDonut', credit);
      renderRapHistory('rapStackChart', { rapPaid, rapPayable });
      renderGruHistory('gruTreeChart', 'gruLegend', gru);
      renderGauge('committedGauge', committedRatio);
      renderGauge('liquidatedGauge', liquidatedRatio);
      renderGauge('paidGauge', paidRatio);
      updateDashboardInsights({ budget, credit, rapTotal, rapPaid, rapPayable, gru, committed, liquidated, paid, provisioned, provisionOpen, creditUsed, rapPaidRatio });
      updateGraphInsights({ budget, credit, rapTotal, rapPaid, rapPayable, gru, committed, liquidated, paid, provisioned, provisionOpen, creditUsed });
      renderManagementAlerts({ budget, credit, rapTotal, rapPaid, rapPayable, gru, committed, liquidated, paid, provisioned });
    }

    function setInsight(anchorId, title, text) {
      const card = byId(anchorId)?.closest('.kpi-card, .chart-card');
      if (!card) return;
      card.tabIndex = 0;
      card.dataset.insightTitle = title;
      card.dataset.insightText = text;
      card.title = text;
    }

    function showInsight(card) {
      setText('insightTitle', card.dataset.insightTitle || 'Explore o painel');
      setText('insightText', card.dataset.insightText || 'Passe o mouse sobre cartões e gráficos para ver uma leitura objetiva do indicador.');
    }
    function setElementInsight(id, title, text) {
      const element = byId(id);
      if (!element) return;
      element.tabIndex = 0;
      element.dataset.insightTitle = title;
      element.dataset.insightText = text;
      element.title = text;
    }

    function grandTotalRow(doc) {
      const totals = doc?.totals || [];
      if (totals.length) return totals[totals.length - 1].raw || totals[totals.length - 1].values || null;
      const typedTotals = (doc?.row_types || []).filter(item => item.type === 'total').map(item => item.raw || item);
      if (typedTotals.length) return typedTotals[typedTotals.length - 1];
      return null;
    }

    function renderTreemap(id, legendId, items) {
      const top = items.slice(0, 4);
      byId(id).innerHTML = `<div class="treemap">${top.map(item => `<div class="tree-cell" title="${escapeHtml(item.label)}">${escapeHtml(shortLabel(item.label))}</div>`).join('')}</div>`;
      byId(legendId).innerHTML = top.map((item, index) => `<span><i class="legend-dot" style="background:${['var(--accent)', 'var(--tree-2)', 'var(--tree-3)', 'var(--tree-4)'][index]}"></i>${escapeHtml(shortLabel(item.label))}</span>`).join('');
    }

    function shortLabel(value) {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length > 28 ? `${text.slice(0, 25)}...` : text;
    }

    function sumReport(slug, columnPatterns) {
      const doc = financialReports[slug];
      if (!doc) return null;
      const rows = doc.totals?.length ? doc.totals.map(total => total.raw || total.values || {}) : (doc.rows || []);
      let total = 0;
      let matched = false;
      for (const row of rows) {
        for (const [column, value] of Object.entries(row)) {
          if (!matchesAnyColumn(column, columnPatterns)) continue;
          const number = parseBrNumber(value);
          if (Number.isFinite(number)) {
            total += number;
            matched = true;
          }
        }
      }
      return matched ? total : null;
    }

    function matchesAnyColumn(column, patterns) {
      const normalizedColumn = normalize(column);
      return patterns.some(parts => parts.every(part => normalizedColumn.includes(normalize(part))));
    }

    function parseBrNumber(value) {
      if (typeof value === 'number') return value;
      const text = String(value || '').trim();
      const negative = text.startsWith('(') && text.endsWith(')');
      const clean = text.replace(/[^\d,.-]/g, '');
      if (!clean) return null;
      const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
      const number = Number(normalized);
      return Number.isFinite(number) ? (negative ? -number : number) : null;
    }

    function auditValue(value, source = 'Origem nao informada.', fallback = false) {
      return { value: Number.isFinite(value) ? value : null, source, fallback };
    }

    function valueOf(item) {
      return Number.isFinite(item?.value) ? item.value : (Number.isFinite(item) ? item : null);
    }

    function isAvailable(item) {
      return Number.isFinite(valueOf(item));
    }

    function sourceDate(doc, item) {
      return item?.date || doc?.date || 'data indisponivel';
    }

    function latestSeriesMetric(doc, metric) {
      const series = doc?.series_data?.series || [];
      for (let index = series.length - 1; index >= 0; index -= 1) {
        const item = series[index];
        const value = item?.metrics?.[metric];
        if (Number.isFinite(value) && metricIsReliable(item, metric)) return { value, date: item.date || item.date_iso, meta: item?.metrics_meta?.[metric] };
      }
      return null;
    }

    function metricIsReliable(item, metric) {
      if (item?.metrics_quality && item.metrics_quality.ok === false) return false;
      const meta = item?.metrics_meta?.[metric];
      return !meta || meta.status === 'ok';
    }

    function reportLabel(slug) {
      return reportDefinitions[slug]?.title || friendlyNames[slug] || financialReports[slug]?.title || slug;
    }

    function metricValue(slug, metric, fallbackColumns = []) {
      const doc = financialReports[slug];
      if (!doc) return auditValue(null, `Relatorio ausente: ${reportLabel(slug)}.`);
      const seriesMetric = latestSeriesMetric(doc, metric);
      if (seriesMetric) {
        const meta = seriesMetric.meta || {};
        const line = meta.line ? ` linha: ${meta.line};` : '';
        const column = meta.column ? ` coluna: ${meta.column};` : '';
        return auditValue(seriesMetric.value, `Fonte: ${reportLabel(slug)}; data: ${sourceDate(doc, seriesMetric)}; metrica: ${metric}; origem: data/series;${line}${column}`, Boolean(meta.fallback));
      }
      if (slug === 'restos-a-pagar-rap') {
        const issueText = rapMetricIssue(metric);
        return auditValue(null, issueText || `RAP indisponivel: ${metric}. Metrica exige total geral confiavel.`);
      }
      for (const column of fallbackColumns) {
        const fallback = totalValue(slug, column);
        if (isAvailable(fallback)) {
          const positional = /^Valor\s+\d+$/i.test(column);
          const note = positional ? ' Fallback posicional: coluna tecnica, auditoria limitada.' : ' Fallback: coluna/linha de total do JSON do relatorio.';
          return auditValue(fallback.value, `${fallback.source}${note}`, true);
        }
      }
      return auditValue(null, `Dado indisponivel: ${reportLabel(slug)}; metrica: ${metric}.`);
    }

    function rapMetricIssue(metric) {
      const doc = financialReports['restos-a-pagar-rap'];
      const reportMeta = doc?.metrics_meta?.[metric];
      if (reportMeta && reportMeta.status !== 'ok') return reportMeta.reason || 'Metrica de RAP insegura.';
      const series = doc?.series_data?.series || [];
      for (let index = series.length - 1; index >= 0; index -= 1) {
        const meta = series[index]?.metrics_meta?.[metric];
        if (meta && meta.status !== 'ok') return meta.reason || 'Metrica de RAP insegura na serie.';
      }
      const qualityIssues = doc?.quality?.issues || [];
      if (qualityIssues.some(issue => String(issue).startsWith('rap_metric_'))) return qualityIssues.join(', ');
      return null;
    }

    function firstValue(values) {
      const available = values.find(isAvailable);
      return available || auditValue(null, values.map(auditSource).filter(Boolean).join(' | ') || 'Nenhuma origem disponivel.');
    }

    function setText(id, value) {
      const element = byId(id);
      if (element) element.textContent = value;
    }

    function safeNumber(value) {
      return valueOf(value);
    }

    function ratio(part, total) {
      const numerator = valueOf(part);
      const denominator = valueOf(total);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
        return auditValue(null, `Percentual indisponivel. Numerador: ${auditSource(part)} Denominador: ${auditSource(total)}`);
      }
      return auditValue(Math.max(0, Math.min(1, numerator / denominator)), `Numerador: ${auditSource(part)} Denominador: ${auditSource(total)}`);
    }

    function sumAudit(label, items) {
      if (!items.every(isAvailable)) return auditValue(null, `${label}: componentes indisponiveis. ${auditSources(items)}`);
      return auditValue(items.reduce((sum, item) => sum + valueOf(item), 0), `${label}. ${auditSources(items)}`);
    }

    function subtractAudit(label, total, part) {
      if (!isAvailable(total) || !isAvailable(part)) return auditValue(null, `${label}: componentes indisponiveis. ${auditSources([total, part])}`);
      return auditValue(Math.max(0, valueOf(total) - valueOf(part)), `${label}. Total: ${auditSource(total)} Parcela: ${auditSource(part)}`);
    }

    function latestFinancialDate() {
      const dates = Object.values(financialReports).map(doc => doc?.date).filter(Boolean);
      dates.sort();
      return dates.length ? `Fechamento: ${dates[dates.length - 1]}` : 'Fechamento indisponivel';
    }

    function totalValue(slug, column) {
      const doc = financialReports[slug];
      const row = grandTotalRow(doc);
      if (!doc) return auditValue(null, `Relatorio ausente: ${reportLabel(slug)}.`);
      if (!row) return auditValue(null, `Linha de total nao encontrada: ${reportLabel(slug)}.`);
      if (column === 'last') {
        const last = lastNumericValue(row);
        return auditValue(last.value, `Fonte: ${reportLabel(slug)}; data: ${doc.date || 'indisponivel'}; linha: total; coluna: ${last.column || 'ultima numerica'}.`, true);
      }
      return auditValue(parseBrNumber(row[column]), `Fonte: ${reportLabel(slug)}; data: ${doc.date || 'indisponivel'}; linha: total; coluna: ${column}.`, /^Valor\s+\d+$/i.test(column));
    }

    function lastNumericValue(row) {
      const entries = Object.entries(row || {}).map(([column, value]) => [column, parseBrNumber(value)]).filter(([, value]) => Number.isFinite(value));
      if (!entries.length) return { value: null, column: null };
      const [column, value] = entries[entries.length - 1];
      return { value, column };
    }

    function unavailableChart(id) {
      byId(id).innerHTML = '<div class="chart-empty">indisponivel</div>';
    }

    function renderTrend(id, values) {
      if (!values.every(isAvailable)) return unavailableChart(id);
      const numbers = values.map(valueOf);
      const max = Math.max(...numbers, 1);
      const points = numbers.map((value, index) => {
        const x = 18 + index * 62;
        const y = 112 - (value / max) * 88;
        return `${x},${y}`;
      }).join(' ');
      byId(id).innerHTML = `
        <svg viewBox="0 0 170 128" width="100%" height="128" role="img" aria-label="Evolucao das despesas">
          <path d="M18 112 L80 112 L142 112" stroke="var(--line)" stroke-width="1"/>
          <polygon points="18,112 ${points} 142,112" fill="var(--chart-fill)"/>
          <polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="3"/>
          ${numbers.map((value, index) => `<circle cx="${18 + index * 62}" cy="${112 - (value / max) * 88}" r="4" fill="var(--accent-2)"/>`).join('')}
          <text x="18" y="124" font-size="8" fill="var(--muted)">Emp.</text>
          <text x="75" y="124" font-size="8" fill="var(--muted)">Liq.</text>
          <text x="138" y="124" font-size="8" fill="var(--muted)">Pago</text>
        </svg>`;
    }

    function renderDonut(id, values, colors) {
      if (!values.every(isAvailable)) return unavailableChart(id);
      const numbers = values.map(valueOf);
      const total = numbers.reduce((sum, value) => sum + value, 0);
      if (total <= 0) return unavailableChart(id);
      let offset = 25;
      const circles = numbers.map((value, index) => {
        const pct = value / total * 100;
        const circle = `<circle cx="50" cy="50" r="34" fill="none" stroke="${colors[index]}" stroke-width="18" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${offset}" pathLength="100"/>`;
        offset -= pct;
        return circle;
      }).join('');
      byId(id).innerHTML = `<svg viewBox="0 0 100 100" width="128" height="128" role="img" aria-label="Grafico de rosca">${circles}<circle cx="50" cy="50" r="21" fill="var(--card)"/></svg>`;
    }

    function renderStack(id, paid, payable) {
      if (!isAvailable(paid) || !isAvailable(payable)) return unavailableChart(id);
      const total = valueOf(paid) + valueOf(payable);
      if (total <= 0) return unavailableChart(id);
      const paidPct = valueOf(paid) / total * 100;
      const payablePct = Math.max(0, 100 - paidPct);
      byId(id).innerHTML = `
        <div class="stack-bar" role="img" aria-label="Restos a pagar pagos e a pagar">
          <div class="stack-paid" style="height:${paidPct}%"></div>
          <div class="stack-open" style="height:${payablePct}%"></div>
        </div>`;
    }

    function renderGauge(id, value) {
      if (!isAvailable(value)) return unavailableChart(id);
      const pct = Math.round(valueOf(value) * 100);
      const dash = Math.max(0, Math.min(100, pct));
      byId(id).innerHTML = `
        <svg viewBox="0 0 160 94" width="100%" height="128" role="img" aria-label="Medidor ${pct}%">
          <path d="M24 78 A56 56 0 0 1 136 78" fill="none" stroke="var(--accent-soft)" stroke-width="18" pathLength="100"/>
          <path d="M24 78 A56 56 0 0 1 136 78" fill="none" stroke="var(--accent)" stroke-width="18" pathLength="100" stroke-dasharray="${dash} ${100 - dash}"/>
          <text x="80" y="72" text-anchor="middle" font-size="20" fill="var(--text)">${pct}%</text>
        </svg>`;
    }

    function formatMoney(value) {
      const number = valueOf(value);
      if (!Number.isFinite(number)) return '-';
      return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function formatPercent(part, total) {
      const numerator = valueOf(part);
      const denominator = valueOf(total);
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return '-';
      return (numerator / denominator).toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
    }

    function auditSource(item) {
      if (!item) return 'Origem indisponivel.';
      const suffix = item.fallback ? ' (fallback)' : '';
      return `${item.source || 'Origem nao informada.'}${suffix}`;
    }

    function auditSources(items) {
      const sources = [...new Set(items.map(auditSource).filter(Boolean))];
      return sources.length ? `Origens: ${sources.join(' | ')}` : 'Origem indisponivel.';
    }

    function valueInsight(item, detail) {
      return isAvailable(item) ? `${formatMoney(item)}. ${detail} ${auditSource(item)}` : `Dado indisponivel. ${auditSource(item)}`;
    }

    function percentInsight(part, total, detail) {
      const percent = formatPercent(part, total);
      if (percent === '-') return `Percentual indisponivel porque numerador ou denominador nao esta disponivel. ${auditSources([part, total])}`;
      return `${percent} ${detail} ${auditSources([part, total])}`;
    }

    function updateDashboardInsights(values) {
      setInsight('budgetBase', 'Provisionamentos', valueInsight(values.budget, 'Orcamento provisionado acompanhado.'));
      setInsight('creditAvailable', 'Credito disponivel', valueInsight(values.credit, 'Parcela livre dentro do orcamento provisionado.'));
      setInsight('rapTotal', 'Restos a pagar', valueInsight(values.rapTotal, `Total calculado a partir de RAP pago (${formatMoney(values.rapPaid)}) e RAP a pagar (${formatMoney(values.rapPayable)}).`));
      setInsight('gruCollected', 'GRU arrecadadas', valueInsight(values.gru, 'Arrecadacao propria identificada nos dados.'));
      setInsight('committedTotal', 'Despesas empenhadas', valueInsight(values.committed, 'Valor formalmente comprometido.'));
      setInsight('liquidatedTotal', 'Despesas liquidadas', valueInsight(values.liquidated, 'Despesa com entrega reconhecida.'));
      setInsight('paidTotal', 'Despesas pagas', valueInsight(values.paid, 'Valor efetivamente pago.'));
      setInsight('trendValue', 'Evolucao da execucao', `Empenhado: ${formatMoney(values.committed)}. Liquidado: ${formatMoney(values.liquidated)}. Pago: ${formatMoney(values.paid)}. ${auditSources([values.committed, values.liquidated, values.paid])}`);
      setInsight('provisionShareValue', 'Uso do provisionado', percentInsight(values.committed, values.provisioned, 'do provisionamento ja esta empenhado.'));
      setInsight('creditShareValue', 'Credito livre no provisionado', percentInsight(values.credit, values.budget, 'do provisionado aparece como credito disponivel.'));
      setInsight('rapShareValue', 'Restos a pagar', percentInsight(values.rapPaid, values.rapTotal, 'dos restos a pagar ja foram pagos.'));
      setInsight('gruValue', 'Arrecadacao propria', valueInsight(values.gru, 'Total de GRU arrecadadas.'));
      setInsight('committedGaugeValue', '% empenhado do provisionado', percentInsight(values.committed, values.provisioned, 'do orcamento provisionado ja foi empenhado.'));
      setInsight('liquidatedGaugeValue', '% liquidado do empenhado', percentInsight(values.liquidated, values.committed, 'do empenhado ja foi liquidado.'));
      setInsight('paidGaugeValue', '% pago do liquidado', percentInsight(values.paid, values.liquidated, 'do liquidado ja foi pago.'));
    }

    function updateGraphInsights(values) {
      setElementInsight('expenseTrendChart', 'Evolucao das despesas', `Empenhado: ${formatMoney(values.committed)}. Liquidado: ${formatMoney(values.liquidated)}. Pago: ${formatMoney(values.paid)}. ${auditSources([values.committed, values.liquidated, values.paid])}`);
      setElementInsight('provisionDonut', 'Uso do provisionado', `Parte empenhada: ${formatMoney(values.committed)}. Saldo estimado a empenhar: ${formatMoney(values.provisionOpen)}. ${auditSources([values.committed, values.provisionOpen])}`);
      setElementInsight('creditDonut', 'Credito livre no provisionado', `Credito disponivel: ${formatMoney(values.credit)}. Provisionado ja utilizado ou indisponivel: ${formatMoney(values.creditUsed)}. ${auditSources([values.credit, values.creditUsed])}`);
      setElementInsight('rapStackChart', 'Restos a pagar', `Pagos: ${formatMoney(values.rapPaid)}. A pagar: ${formatMoney(values.rapPayable)}. Total acompanhado: ${formatMoney(values.rapTotal)}. ${auditSources([values.rapPaid, values.rapPayable, values.rapTotal])}`);
      setElementInsight('gruTreeChart', 'Arrecadacao propria', `${formatMoney(values.gru)} em GRU. ${auditSource(values.gru)}`);
      setElementInsight('committedGauge', 'Percentual empenhado', percentInsight(values.committed, values.provisioned, 'do provisionado ja virou empenho.'));
      setElementInsight('liquidatedGauge', 'Percentual liquidado', percentInsight(values.liquidated, values.committed, 'do empenhado ja teve entrega reconhecida.'));
      setElementInsight('paidGauge', 'Percentual pago', percentInsight(values.paid, values.liquidated, 'do liquidado ja foi efetivamente pago.'));
    }

    function seriesPoints(slug, metric) {
      const series = financialReports[slug]?.series_data?.series || [];
      return series.map(item => ({
        date: item.date || item.date_iso || '',
        dateIso: item.date_iso || item.date || '',
        value: metricIsReliable(item, metric) ? item?.metrics?.[metric] : null
      })).filter(point => Number.isFinite(point.value));
    }

    function historicalSeries(slug, entries) {
      return entries.map(entry => ({
        ...entry,
        points: seriesPoints(slug, entry.metric)
      }));
    }

    function renderExpenseHistory(id, currentValues) {
      const series = historicalSeries('despesas-empenhadas-liquidadas-e-pagas-mes-lancamento', [
        { label: 'Empenhado', metric: 'empenhado', color: 'var(--accent)', current: currentValues.committed },
        { label: 'Liquidado', metric: 'liquidado', color: 'var(--accent-2)', current: currentValues.liquidated },
        { label: 'Pago', metric: 'pago', color: 'var(--warn)', current: currentValues.paid }
      ]);
      renderHistoricalLineChart(id, series, 'Evolucao historica de empenhado, liquidado e pago');
    }

    function renderCreditHistory(id, currentValue) {
      renderHistoricalLineChart(id, historicalSeries('credito-disponivel-mes-lancamento', [
        { label: 'Credito disponivel', metric: 'credito_disponivel', color: 'var(--accent)', current: currentValue }
      ]), 'Evolucao historica do credito disponivel');
    }

    function renderRapHistory(id, currentValues) {
      if (!isAvailable(currentValues.rapPaid) || !isAvailable(currentValues.rapPayable)) {
        unavailableChart(id);
        return;
      }
      renderHistoricalLineChart(id, historicalSeries('restos-a-pagar-rap', [
        { label: 'RAP pago', metric: 'rap_pago', color: 'var(--accent)', current: currentValues.rapPaid },
        { label: 'RAP a pagar', metric: 'rap_a_pagar', color: 'var(--accent-2)', current: currentValues.rapPayable }
      ]), 'Evolucao historica de restos a pagar');
    }

    function renderGruHistory(id, legendId, currentValue) {
      renderHistoricalLineChart(id, historicalSeries('recolhimento-proprio-gru', [
        { label: 'GRU arrecadada', metric: 'gru_arrecadada', color: 'var(--accent)', current: currentValue }
      ]), 'Evolucao historica de GRU arrecadada');
      const legend = byId(legendId);
      if (legend) legend.innerHTML = '<span><i class="legend-dot" style="background:var(--accent)"></i>GRU arrecadada</span>';
    }

    function renderHistoricalLineChart(id, series, ariaLabel) {
      const validSeries = series.filter(item => item.points.length);
      const validPoints = validSeries.flatMap(item => item.points);
      const container = byId(id);
      if (!container) return;
      if (!validPoints.length) {
        container.innerHTML = '<div class="chart-empty" role="img" aria-label="Historico insuficiente">Historico insuficiente</div>';
        return;
      }
      const dates = [...new Set(validPoints.map(point => point.dateIso || point.date))].sort();
      if (dates.length < 2) {
        const values = validSeries.map(item => {
          const point = item.points[item.points.length - 1];
          return point ? `${item.label}: ${formatMoney(point.value)}` : null;
        }).filter(Boolean).join(' | ');
        container.innerHTML = `<div class="chart-empty" role="img" aria-label="Apenas um ponto historico disponivel">Valor atual: ${escapeHtml(values || '-')}<br><small>${escapeHtml(validPoints[0]?.date || 'data indisponivel')}</small></div>`;
        return;
      }
      const values = validPoints.map(point => point.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const width = 220;
      const height = 126;
      const padX = 18;
      const padY = 16;
      const xFor = date => {
        const index = Math.max(0, dates.indexOf(date));
        return dates.length === 1 ? width / 2 : padX + index * ((width - padX * 2) / (dates.length - 1));
      };
      const yFor = value => height - padY - ((value - min) / span) * (height - padY * 2);
      const lines = validSeries.map(item => {
        const points = item.points.map(point => `${xFor(point.dateIso || point.date)},${yFor(point.value)}`).join(' ');
        const circles = item.points.map(point => `<circle cx="${xFor(point.dateIso || point.date)}" cy="${yFor(point.value)}" r="2.8" fill="${item.color}"><title>${escapeHtml(item.label)} - ${escapeHtml(point.date)}: ${escapeHtml(formatMoney(point.value))}</title></circle>`).join('');
        return `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="2.5"/>${circles}`;
      }).join('');
      const firstPoint = validPoints.find(point => (point.dateIso || point.date) === dates[0]) || validPoints[0];
      const firstDate = firstPoint?.date || dates[0] || '-';
      const lastPoint = validPoints.reduce((latest, point) => (String(point.dateIso || point.date) > String(latest.dateIso || latest.date) ? point : latest), validPoints[0]);
      const legend = validSeries.map(item => {
        const last = item.points[item.points.length - 1];
        return `<span><i class="legend-dot" style="background:${item.color}"></i>${escapeHtml(item.label)}: ${escapeHtml(formatMoney(last.value))}</span>`;
      }).join('');
      container.innerHTML = `
        <div>
          <svg viewBox="0 0 ${width} ${height}" width="100%" height="128" role="img" aria-label="${escapeHtml(ariaLabel)}">
            <path d="M${padX} ${height - padY} H${width - padX}" stroke="var(--line)" stroke-width="1"/>
            <path d="M${padX} ${padY} V${height - padY}" stroke="var(--line)" stroke-width="1"/>
            ${lines}
          </svg>
          <div class="chart-legend">${legend}</div>
          <div class="history-meta">Periodo: ${escapeHtml(firstDate)} a ${escapeHtml(lastPoint.date || '-')}. ${validPoints.length} ponto(s). Ultima data: ${escapeHtml(lastPoint.date || '-')}.</div>
        </div>`;
    }

    function gruBreakdown() {
      const doc = financialReports['recolhimento-proprio-gru'];
      const totals = (doc?.row_types || []).filter(item => item.type === 'total').map(item => item.raw || {});
      const result = totals.filter(row => normalize(row['Emissão - Mês'] || row['EmissÃ£o - MÃªs'] || '').includes('total') && !normalize(row['Cód. Recolhimento GRU'] || row['CÃ³d. Recolhimento GRU'] || '').includes('total')).map(row => {
        const last = lastNumericValue(row);
        return {
          label: row['Cód. Recolhimento GRU (2)'] || row['CÃ³d. Recolhimento GRU (2)'] || row['Cód. Recolhimento GRU'] || row['CÃ³d. Recolhimento GRU'] || 'GRU',
          value: last.value
        };
      }).filter(item => Number.isFinite(item.value) && item.value > 0);
      return result.sort((a, b) => b.value - a.value);
    }

    function renderManagementAlerts(values) {
      const alerts = [
        ...statusAlerts(),
        ...qualityAlerts(),
        ...expectedMetricAlerts(values),
        ...financialAlerts(values)
      ];
      const container = byId('managementAlerts');
      if (!container) return;
      if (!alerts.length) {
        container.innerHTML = '<p class="alert-empty">Nenhum alerta gerencial identificado.</p>';
        return;
      }
      container.innerHTML = alerts.map(alertHtml).join('');
    }

    function statusAlerts() {
      return reports.flatMap(report => {
        const status = reportStatus(report);
        const periodicity = report.metadata?.periodicidade;
        if (status !== 'desatualizado' || !['diaria', 'mensal'].includes(periodicity)) return [];
        return [makeAlert({
          level: periodicity === 'diaria' ? 'critical' : 'warning',
          type: periodicity === 'diaria' ? 'Relatorio diario desatualizado' : 'Relatorio mensal desatualizado',
          report,
          message: `${friendlyTitle(report)} esta desatualizado. Data: ${report.date || 'indisponivel'}; idade: ${report.metadata?.idade_dias ?? '-'} dia(s); limite: ${reportLimit(report) ?? 'indisponivel'}.`
        })];
      });
    }

    function qualityAlerts() {
      return reports.flatMap(report => {
        const summary = qualitySummary(report);
        if (summary.ok) return [];
        return [makeAlert({
          level: 'critical',
          type: 'Problema de parsing',
          report,
          message: `${friendlyTitle(report)} possui problema de parsing: ${summary.text || 'qualidade nao aprovada'}.`
        })];
      });
    }

    function expectedMetricAlerts(values) {
      const monitored = [
        ['Provisionamentos', values.provisioned],
        ['Credito disponivel', values.credit],
        ['Despesas empenhadas', values.committed],
        ['Despesas liquidadas', values.liquidated],
        ['Despesas pagas', values.paid],
        ['RAP pago', values.rapPaid],
        ['RAP a pagar', values.rapPayable],
        ['GRU arrecadada', values.gru]
      ];
      return monitored.filter(([, item]) => !isAvailable(item)).map(([label, item]) => makeAlert({
        level: 'info',
        type: 'Metrica ou coluna esperada indisponivel',
        message: `${label}: nao foi possivel calcular a metrica com seguranca. ${auditSource(item)}`
      }));
    }

    function financialAlerts(values) {
      const alerts = [];
      if (isAvailable(values.committed) && isAvailable(values.provisioned) && valueOf(values.committed) > valueOf(values.provisioned)) {
        alerts.push(makeAlert({
          level: 'critical',
          type: 'Empenhado maior que provisionado',
          report: reportBySlug('provisionamentos') || reportBySlug('despesas-empenhadas-liquidadas-e-pagas-mes-lancamento'),
          message: `Empenhado (${formatMoney(values.committed)}) supera provisionado (${formatMoney(values.provisioned)}). ${auditSources([values.committed, values.provisioned])}`
        }));
      }
      if (isAvailable(values.paid) && isAvailable(values.liquidated) && valueOf(values.paid) > valueOf(values.liquidated)) {
        alerts.push(makeAlert({
          level: 'warning',
          type: 'Pago maior que liquidado',
          report: reportBySlug('saldos-de-empenhos-do-exercicio-conta-contabil') || reportBySlug('despesas-empenhadas-liquidadas-e-pagas-mes-lancamento'),
          message: `Pago (${formatMoney(values.paid)}) supera liquidado (${formatMoney(values.liquidated)}). ${auditSources([values.paid, values.liquidated])}`
        }));
      }
      if (isAvailable(values.rapPayable) && isAvailable(values.rapTotal) && valueOf(values.rapTotal) > 0) {
        const ratioValue = valueOf(values.rapPayable) / valueOf(values.rapTotal);
        if (ratioValue > 0.5) {
          alerts.push(makeAlert({
            level: 'warning',
            type: 'RAP a pagar elevado',
            report: reportBySlug('restos-a-pagar-rap'),
            message: `RAP a pagar representa ${ratioValue.toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })} do total acompanhado. Limite: 50%.`
          }));
        }
      }
      const rapIssue = rapMetricIssue('rap_pago') || rapMetricIssue('rap_a_pagar');
      if (rapIssue) {
        alerts.push(makeAlert({
          level: 'critical',
          type: 'RAP sem metrica confiavel',
          report: reportBySlug('restos-a-pagar-rap'),
          message: `Nao foi possivel validar os totais de Restos a Pagar. ${rapIssue}`
        }));
      }
      if (isAvailable(values.credit) && isAvailable(values.provisioned) && valueOf(values.provisioned) > 0) {
        const ratioValue = valueOf(values.credit) / valueOf(values.provisioned);
        if (ratioValue < 0.1) {
          alerts.push(makeAlert({
            level: 'warning',
            type: 'Credito disponivel baixo',
            report: reportBySlug('credito-disponivel-mes-lancamento') || reportBySlug('provisionamentos'),
            message: `Credito disponivel representa ${ratioValue.toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })} do provisionado. Limite conservador: 10%.`
          }));
        }
      }
      return alerts;
    }

    function makeAlert({ level = 'info', type, report = null, message }) {
      return { level, type, report, message };
    }

    function alertHtml(alert) {
      const report = alert.report;
      const title = report ? friendlyTitle(report) : alert.type;
      const date = report?.date ? `Data do relatorio: ${escapeHtml(report.date)}. ` : '';
      const link = report?.json_path ? `<a href="report-viewer.html?report=${encodeURIComponent(report.json_path)}">Abrir relatorio</a>` : '';
      return `<article class="alert-item alert-${escapeHtml(alert.level)}"><strong>${escapeHtml(alert.type)} - ${escapeHtml(title)}</strong><p>${date}${escapeHtml(alert.message)}</p>${link}</article>`;
    }

    function reportBySlug(slug) {
      return reports.find(report => report.slug === slug) || null;
    }

    function exportCsv() {
      const header = ['titulo', 'data', 'periodicidade', 'status', 'idade_dias', 'html_path', 'json_path'];
      const lines = [header.join(',')];
      for (const report of filteredReports()) {
        lines.push([
          report.displayTitle,
          report.date,
          report.metadata.periodicidade,
          reportStatus(report),
          report.metadata.idade_dias,
          report.html_path,
          report.json_path
        ].map(csvCell).join(','));
      }
      download('relatorios.csv', lines.join('\n'));
    }

    function csvCell(value) { return `"${String(value || '').replace(/"/g, '""')}"`; }
    function download(name, content) {
      const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    }
    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
    }

    byId('search').addEventListener('input', render);
    byId('periodicity').addEventListener('change', render);
    byId('status').addEventListener('change', render);
    byId('exportCsv').addEventListener('click', exportCsv);
    byId('themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    initTheme();
    document.querySelector('.dashboard-panel').addEventListener('mouseover', event => {
      const card = event.target.closest('[data-insight-title]');
      if (card) showInsight(card);
    });
    document.querySelector('.dashboard-panel').addEventListener('focusin', event => {
      const card = event.target.closest('[data-insight-title]');
      if (card) showInsight(card);
    });
    document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
      const nextKey = th.dataset.sort;
      sortDir = sortKey === nextKey ? -sortDir : 1;
      sortKey = nextKey;
      render();
    }));
    loadData().catch(error => { byId('rows').innerHTML = `<tr><td colspan="7">Erro ao carregar dados: ${escapeHtml(error.message)}</td></tr>`; });
