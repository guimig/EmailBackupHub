let indexData = null;
    let searchData = null;
    let reports = [];
    let financialReports = {};
    let gruActiveView = 'codes';
    let reportDefinitions = {};
    let sortKey = 'title';
    let sortDir = 1;
    const Catalog = typeof window !== 'undefined' ? window.EmailBackupHubCatalog : null;
    let catalogState = { version: 1, seen: [], unread: [], favorites: [] };
    let catalogPersistence = false;
    let catalogWarning = '';
    let catalogMissing = [];
    let searchIndexState = 'idle';
    let searchIndexPromise = null;
    // Cache only the current GRU document for accurate emission-month reconciliation.
    // Historical extraction snapshots are never treated as transaction movements.
    let gruDetailState = { key: '', status: 'idle', document: null, error: '' };

    const byId = id => document.getElementById(id);

    const THEME_KEY = 'dap-dashboard-theme';

    function applyTheme(theme) {
      const nextTheme = theme === 'dark' ? 'dark' : 'light';
      document.documentElement.dataset.theme = nextTheme;
      try { localStorage.setItem(THEME_KEY, nextTheme); } catch {}
      const button = byId('themeToggle');
      if (button) button.textContent = nextTheme === 'dark' ? 'Tema claro' : 'Tema escuro';
      // O grafico precisa refletir o novo tema, mas nao deve redesenhar em filtros do catalogo.
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
      const [indexResponse, definitions] = await Promise.all([
        fetch('data/index.json'),
        EmailBackupHub.loadReportDefinitions()
      ]);
      if (!indexResponse.ok) throw new Error(`Índice de relatórios indisponível (HTTP ${indexResponse.status}).`);
      indexData = await indexResponse.json();
      reportDefinitions = definitions;
      reports = (indexData.reports || []).map(report => ({ ...report, displayTitle: friendlyTitle(report), searchText: '' }));
      initializeCatalog();
      populateFilters();
      renderReportCatalog();
      // Os indicadores nao bloqueiam a listagem e nao sao recalculados durante a pesquisa.
      loadFinancialReports().then(renderFinancialSummary).catch(error => {
        const notice = byId('financePanelDate');
        if (notice) notice.textContent = 'Indicadores indisponíveis';
        console.error('Falha no carregamento financeiro:', error);
      });
    }

    function ensureSearchIndex() {
      if (searchIndexState !== 'idle') return searchIndexPromise;
      searchIndexState = 'loading';
      searchIndexPromise = fetch('data/search-index.json')
        .then(response => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then(data => {
          searchData = data;
          const textBySlug = Object.fromEntries((searchData.documents || []).map(item => [item.slug, item.text || '']));
          reports.forEach(report => { report.searchText = textBySlug[report.slug] || ''; });
          searchIndexState = 'ready';
          renderReportCatalog();
        })
        .catch(error => {
          searchIndexState = 'error';
          console.warn('Índice de busca textual indisponível; pesquisa por metadados preservada.', error);
          renderReportCatalog();
        });
      return searchIndexPromise;
    }

    function handleSearchInput() {
      if (byId('search').value.trim() && searchIndexState === 'idle') ensureSearchIndex();
      renderReportCatalog();
    }

    function browserCatalogStorage() {
      try { return localStorage; } catch { return null; }
    }

    function initializeCatalog() {
      if (!Catalog) return;
      const result = Catalog.read(browserCatalogStorage(), reports.map(report => report.slug));
      catalogState = result.state;
      catalogPersistence = result.available;
      catalogWarning = result.message;
      catalogMissing = result.missing || [];
      renderCatalogNotice();
    }

    function renderCatalogNotice() {
      const panel = byId('catalogNotice');
      if (!panel) return;
      const count = catalogState.unread.length;
      const parts = [];
      if (count) parts.push(count + (count === 1
        ? ' novo relatório identificado neste navegador desde o último acesso.'
        : ' novos relatórios identificados neste navegador desde o último acesso.'));
      if (catalogMissing.length) {
        parts.push(catalogMissing.length + ' relatório(s) anteriormente conhecidos não constam no índice atual. A exclusão na origem não é presumida; confira a publicação dos dados.');
      }
      if (catalogWarning) parts.push(catalogWarning);
      panel.hidden = parts.length === 0;
      byId('catalogNoticeText').textContent = parts.join(' ');
      byId('catalogMarkSeen').hidden = count === 0;
    }

    function toggleCatalogFavorite(slug) {
      if (!Catalog || !reports.some(report => report.slug === slug)) return;
      catalogState = Catalog.toggleFavorite(catalogState, slug);
      if (catalogPersistence && !Catalog.persist(browserCatalogStorage(), catalogState)) {
        catalogPersistence = false;
        catalogWarning = 'Favoritos disponíveis apenas durante esta visita.';
      }
      renderCatalogNotice();
      renderReportCatalog();
    }

    function acknowledgeCatalogReports() {
      if (!Catalog) return;
      catalogState = Catalog.acknowledge(catalogState);
      if (catalogPersistence && !Catalog.persist(browserCatalogStorage(), catalogState)) {
        catalogPersistence = false;
        catalogWarning = 'A marcação foi aplicada apenas nesta visita.';
      }
      byId('catalogScope').value = 'all';
      renderCatalogNotice();
      renderReportCatalog();
    }

    function populateFilters() {
      const values = [...new Set(reports.map(report => report.metadata.periodicidade).filter(Boolean))].sort();
      byId('periodicity').insertAdjacentHTML('beforeend', values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join(''));
    }

    function filteredReports() {
      const term = normalize(byId('search').value);
      const periodicity = byId('periodicity').value;
      const status = byId('status').value;
      const scope = byId('catalogScope')?.value || 'all';
      const scoped = Catalog ? Catalog.filterByScope(reports, scope, catalogState) : reports;
      return scoped.filter(report => {
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
      const definition = EmailBackupHub.reportDefinition(reportDefinitions, report.slug);
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
      // O resumo e opcional, com versao e horario consistentes com o indice.
      // Checkouts antigos continuam consumindo os JSONs completos sem modificacoes.
      try {
        const summaryResponse = await fetch('data/dashboard-summary.json');
        if (summaryResponse.ok) {
          const summary = await summaryResponse.json();
          const entries = summary?.reports;
          if (summary?.generated_at === indexData?.generated_at
            && summary?.summary_version === '1'
            && entries && targets.every(report => entries[report.slug]?.slug === report.slug)) {
            financialReports = Object.fromEntries(targets.map(report => [report.slug, entries[report.slug]]));
            return;
          }
        }
      } catch (error) {
        console.warn('Resumo compacto indisponivel; usando relatorios completos.', error);
      }
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

    function renderReportCatalog() {
      const rows = filteredReports();
      byId('totalReports').textContent = reports.length;
      byId('updatedReports').textContent = reports.filter(report => reportStatus(report) === 'atualizado').length;
      byId('staleReports').textContent = reports.filter(report => reportStatus(report) === 'desatualizado').length;
      byId('qualityIssues').textContent = reports.filter(report => !qualitySummary(report).ok).length;
      const searching = Boolean(byId('search').value.trim());
      const searchNotice = searching && searchIndexState === 'loading'
        ? '<tr><td colspan="7">Carregando busca no conteúdo dos relatórios...</td></tr>'
        : searching && searchIndexState === 'error'
          ? '<tr><td colspan="7">Pesquisa por conteúdo indisponível; exibindo resultados por título e metadados.</td></tr>'
          : '';
      const emptyNotice = !rows.length && !searchNotice
        ? '<tr><td colspan="7">Nenhum relatório corresponde aos filtros escolhidos.</td></tr>' : '';
      byId('rows').innerHTML = searchNotice + emptyNotice + rows.map(report => {
        const favorite = catalogState.favorites.includes(report.slug);
        const unread = catalogState.unread.includes(report.slug);
        const validFavorite = Catalog && Catalog.validSlug(report.slug);
        const star = validFavorite
          ? `<button type="button" class="catalog-favorite" data-favorite-report="${escapeHtml(report.slug)}"
              aria-pressed="${favorite}" title="${favorite ? 'Retirar dos favoritos' : 'Adicionar aos favoritos'}"
              aria-label="${favorite ? 'Retirar dos favoritos:' : 'Adicionar aos favoritos:'} ${escapeHtml(report.displayTitle)}">${favorite ? '★' : '☆'}</button>`
          : '';
        const newLabel = unread ? '<span class="catalog-new">Novo neste catálogo</span>' : '';
        const htmlPath = safeCatalogLink(report.html_path);
        const jsonPath = safeCatalogLink(report.json_path);
        const seriesPath = safeCatalogLink(report.series_path);
        return `
        <tr>
          <td><div class="catalog-row-title">${star}<span>
            <a href="report-viewer.html?report=${encodeURIComponent(jsonPath)}">${escapeHtml(report.displayTitle)}</a>${newLabel}
          </span></div></td>
          <td>${escapeHtml(report.date)}</td>
          <td><span class="tag">${escapeHtml(report.metadata?.periodicidade)}</span></td>
          <td class="${reportStatus(report) === 'atualizado' ? 'ok' : 'bad'}">${escapeHtml(reportStatus(report))}</td>
          <td>${escapeHtml(report.metadata?.idade_dias)} dias${reportLimit(report) != null ? ` / limite ${escapeHtml(reportLimit(report))}` : ''}</td>
          <td>${qualityBadges(report)}</td>
          <td><a href="${escapeHtml(htmlPath)}">HTML</a> | <a href="${escapeHtml(jsonPath)}">JSON</a> | <a href="${escapeHtml(seriesPath)}">Série</a></td>
        </tr>`;
      }).join('');
    }

    function safeCatalogLink(input) {
      const path = String(input || '').trim();
      if (!path || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(path)
        || /(?:^|\/)\.\.(?:\/|$)/.test(path) || /[\\<>"'\r\n]/.test(path)) return '#';
      return path;
    }

    function renderFinancialSummary() {
      const committed = firstValue([
        metricValue('despesas-empenhadas-liquidadas-e-pagas-mes-lancamento', 'empenhado', ['Valor 7']),
        metricValue('saldos-de-empenhos-do-exercicio-conta-contabil', 'empenhado', ['Empenhado'])
      ]);
      const liquidated = firstValue([
        metricValue('despesas-empenhadas-liquidadas-e-pagas-mes-lancamento', 'liquidado', ['Valor 8']),
        sumAudit('Despesas liquidadas', [
          metricValue('saldos-de-empenhos-do-exercicio-conta-contabil', 'pago', ['Valor 10']),
          metricValue('saldos-de-empenhos-do-exercicio-conta-contabil', 'liquidado_a_pagar', ['Valor 9'])
        ])
      ]);
      const paid = firstValue([
        metricValue('saldos-de-empenhos-do-exercicio-conta-contabil', 'pago', ['Valor 10']),
        metricValue('despesas-empenhadas-liquidadas-e-pagas-mes-lancamento', 'pago', ['Valor 9'])
      ]);
      // Rates are only derived from one audited extraction of the expenditure report.
      // Independent KPIs above may use other explicitly identified fallback sources.
      const stagesDoc = financialReports['despesas-empenhadas-liquidadas-e-pagas-mes-lancamento'];
      const stageKeys = ['empenhado', 'liquidado', 'pago'];
      const stageAudited = Boolean(stagesDoc && stagesDoc.quality?.ok !== false
        && stageKeys.every(key => Number.isFinite(stagesDoc.metrics?.[key])
          && stagesDoc.metrics_meta?.[key]?.status === 'ok'
          && !stagesDoc.metrics_meta?.[key]?.fallback));
      const provisionGaugeModel = window.EmailBackupHubFinancialCharts?.buildCommitmentProvisionRatio(
        financialReports['provisionamentos'], stagesDoc
      ) || { ok: false, reason: 'Comparação indisponível.' };
      const stageModel = window.EmailBackupHubFinancialCharts?.buildExpenseStages(
        stageAudited ? {
          committed: stagesDoc.metrics.empenhado,
          liquidated: stagesDoc.metrics.liquidado,
          paid: stagesDoc.metrics.pago
        } : null,
        { audited: stageAudited, quality: stagesDoc?.quality?.ok !== false, date: stagesDoc?.date_iso }
      ) || { ok: false, reason: 'Modelo de execução indisponível.' };
      const rapPaid = metricValue('restos-a-pagar-rap', 'rap_pago', ['Valor 11']);
      const rapPayable = metricValue('restos-a-pagar-rap', 'rap_a_pagar', ['Valor 12']);
      const gru = metricValue('recolhimento-proprio-gru', 'gru_arrecadada', ['last']);
      const provisioned = metricValue('provisionamentos', 'provisionado', ['last']);
      const credit = metricValue('credito-disponivel-mes-lancamento', 'credito_disponivel', ['last']);
      const rapTotal = sumAudit('Restos a pagar total', [rapPaid, rapPayable]);
      const budget = provisioned;
      // Do not compute stage ratios from different reports, filters or periods.
      const paidRatio = auditValue(stageModel.ok ? stageModel.rates.paidOfLiquidated : null, stageModel.reason);
      const rapPaidRatio = ratio(rapPaid, rapTotal);
      const provisionOpen = subtractAudit('Saldo estimado a empenhar', provisioned, committed);

      setText('budgetBase', formatMoney(budget));
      setText('creditAvailable', formatMoney(credit));
      setText('rapTotal', formatMoney(rapTotal));
      setText('gruCollected', formatMoney(gru));
      setText('financePanelDate', latestFinancialDate());
      const rapCompositionValid = isAvailable(rapPaid) && isAvailable(rapPayable)
        && valueOf(rapPaid) >= 0 && valueOf(rapPayable) >= 0 && valueOf(rapTotal) > 0;
      setText('rapShareValue', rapCompositionValid ? formatPercent(rapPaid, rapTotal) : '-');
      setText('rapShareMeaning', rapCompositionValid
        ? 'do total de RAP acompanhado já foi pago'
        : 'percentual indisponível: total nulo, negativo ou não auditável');
      setText('gruValue', formatMoney(gru));
      setText('committedGaugeValue', stageModel.ok
        ? formatPercent(stageModel.liquidated, stageModel.committed) : '-');
      setText('liquidatedGaugeValue', stageModel.ok
        ? formatPercent(stageModel.paid, stageModel.liquidated) : '-');
      setText('paidGaugeValue', stageModel.ok
        ? formatPercent(stageModel.paid, stageModel.committed) : '-');
      setText('openGaugeValue', stageModel.ok && stageModel.liquidated > 0
        ? formatPercent(stageModel.unpaidLiquidated, stageModel.liquidated) : '-');
      setText('provisionGaugeValue', provisionGaugeModel.ok
        ? (provisionGaugeModel.value * 100).toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + '%' : '-');
      byId('provisionGaugeValue').title = provisionGaugeModel.reason;
      byId('provisionGauge').title = provisionGaugeModel.reason;

      renderStageInterpretation(stageModel);
      renderExpenseComparison('expenseTrendChart', { committed, liquidated, paid }, stageModel);
      renderCreditComparison('creditDonut', { credit, provisioned });
      renderRapHistory('rapStackChart', { rapPaid, rapPayable });
      renderGruMonthlyView('gruTreeChart', 'gruLegend', gru);
      renderHalfGauge('committedGauge', stageModel.ok ? stageModel.rates.liquidatedOfCommitted : null);
      renderHalfGauge('liquidatedGauge', stageModel.ok ? stageModel.rates.paidOfLiquidated : null);
      renderHalfGauge('paidGauge', stageModel.ok ? stageModel.rates.paidOfCommitted : null);
      renderHalfGauge('openGauge', stageModel.ok && stageModel.liquidated > 0
        ? stageModel.unpaidLiquidated / stageModel.liquidated : null);
      renderHalfGauge('provisionGauge', provisionGaugeModel.ok ? provisionGaugeModel.value : null);
      for (const tile of document.querySelectorAll('.stage-gauge-card')) {
        tile.setAttribute('role', 'button');
        tile.setAttribute('tabindex', '0');
        tile.setAttribute('aria-pressed', 'false');
        const label = tile.querySelector('.stage-gauge-title')?.textContent || 'Indicador';
        const value = tile.querySelector('.stage-gauge-value')?.textContent || '-';
        tile.setAttribute('title', label + ': ' + value);
      }
      updateDashboardInsights({ budget, credit, rapTotal, rapPaid, rapPayable, gru, committed, liquidated, paid, provisioned, provisionOpen, rapPaidRatio, stageModel });
      updateGraphInsights({ budget, credit, rapTotal, rapPaid, rapPayable, gru, committed, liquidated, paid, provisioned, provisionOpen, stageModel });
      renderManagementAlerts({ budget, credit, rapTotal, rapPaid, rapPayable, gru, committed, liquidated, paid, provisioned });
    }

    function renderStageInterpretation(model) {
      const banner = byId('stagesInterpretation');
      if (!banner) return;
      if (!model?.ok) {
        banner.textContent = 'Comparação entre etapas indisponível: '
          + (model?.reason || 'dados não auditáveis na mesma posição.');
        banner.dataset.state = 'unavailable';
        return;
      }
      banner.textContent = 'Posição auditada de '
        + (model.date ? model.date.split('-').reverse().join('/') : 'data não informada') + '.';

      banner.dataset.state = 'available';
    }

    function setInsight(anchorId, title, text) {
      const card = byId(anchorId)?.closest('.kpi-card, .chart-card');
      if (!card) return;
      card.tabIndex = 0;
      card.dataset.insightTitle = title;
      card.dataset.insightText = text;
      card.title = text;
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
      const firstColumn = doc?.columns?.[0];
      const grand = totals.filter(total => ['total', 'total geral'].includes(normalize(total.label || '')) || ['total', 'total geral'].includes(normalize(total.raw?.[firstColumn] || '')));
      if (grand.length) return grand[grand.length - 1].raw || grand[grand.length - 1].values || null;
      const typedTotals = (doc?.row_types || []).filter(item => item.type === 'total' && ['total', 'total geral'].includes(normalize(item.raw?.[firstColumn] || ''))).map(item => item.raw || item);
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
        if (item?.date_iso !== doc?.date_iso || item?.hash_conteudo !== doc?.metadata?.hash_conteudo) continue;
        const value = item?.metrics?.[metric];
        if (Number.isFinite(value) && metricIsReliable(item, metric, doc?.slug)) return { value, date: item.date || item.date_iso, meta: item?.metrics_meta?.[metric] };
      }
      return null;
    }

    function metricIsReliable(item, metric, slug = '') {
      if (item?.metrics_quality && item.metrics_quality.ok === false) return false;
      const meta = item?.metrics_meta?.[metric];
      if (slug === 'restos-a-pagar-rap') {
        return Boolean(meta && meta.status === 'ok' && (meta.source || meta.method));
      }
      return !meta || meta.status === 'ok';
    }

    function reportLabel(slug) {
      return EmailBackupHub.reportDefinition(reportDefinitions, slug).title || friendlyNames[slug] || financialReports[slug]?.title || slug;
    }

    function metricValue(slug, metric, fallbackColumns = []) {
      const doc = financialReports[slug];
      if (!doc) return auditValue(null, `Relatorio ausente: ${reportLabel(slug)}.`);
      const reportMetric = metricFromReport(doc, slug, metric);
      if (isAvailable(reportMetric)) return reportMetric;
      if (doc?.metrics_meta?.[metric]?.status && doc.metrics_meta[metric].status !== 'ok') return reportMetric;
      const seriesMetric = latestSeriesMetric(doc, metric);
      if (seriesMetric) {
        const meta = seriesMetric.meta || {};
        const line = meta.line ? ` linha: ${meta.line};` : '';
        const column = meta.column ? ` coluna: ${meta.column};` : '';
        return auditValue(seriesMetric.value, `Fonte: ${reportLabel(slug)}; data: ${sourceDate(doc, seriesMetric)}; metrica: ${metric}; origem: data/series;${line}${column}`, Boolean(meta.fallback));
      }
      if (slug === 'restos-a-pagar-rap') {
        const reportMetric = metricFromReport(doc, slug, metric);
        if (isAvailable(reportMetric)) return reportMetric;
        const issueText = rapMetricIssue(metric);
        return auditValue(null, issueText || `RAP indisponivel: ${metric}. Metrica exige origem auditavel no JSON.`);
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
      if (doc?.metrics && metric in doc.metrics && !reportMeta) return 'Metrica de RAP sem origem auditavel no JSON do relatorio.';
      const series = doc?.series_data?.series || [];
      for (let index = series.length - 1; index >= 0; index -= 1) {
        const meta = series[index]?.metrics_meta?.[metric];
        if (meta && meta.status !== 'ok') return meta.reason || 'Metrica de RAP insegura na serie.';
        if (series[index]?.metrics && metric in series[index].metrics && !meta) return 'Metrica de RAP sem origem auditavel na serie.';
      }
      const qualityIssues = doc?.quality?.issues || [];
      if (qualityIssues.some(issue => String(issue).startsWith('rap_metric_'))) return qualityIssues.join(', ');
      return null;
    }

    function metricFromReport(doc, slug, metric) {
      const value = doc?.metrics?.[metric];
      const meta = doc?.metrics_meta?.[metric] || {};
      if (slug === 'restos-a-pagar-rap' && !(meta.status === 'ok' && (meta.source || meta.method))) {
        return auditValue(null, meta.reason || `Metrica RAP sem origem auditavel: ${metric}.`);
      }
      if (!Number.isFinite(value) || (meta.status && meta.status !== 'ok')) {
        return auditValue(null, meta.reason || `Metrica indisponivel no JSON do relatorio: ${metric}.`);
      }
      const line = meta.line ? ` linha: ${meta.line};` : '';
      const column = meta.column ? ` coluna: ${meta.column};` : '';
      return auditValue(value, `Fonte: ${reportLabel(slug)}; data: ${doc.date || 'indisponivel'}; metrica: ${metric}; origem: data/reports;${line}${column}`, Boolean(meta.fallback));
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
      const latest = Object.values(financialReports)
        .map(doc => doc?.date_iso)
        .filter(value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
        .sort()
        .at(-1);
      return latest
        ? `Último relatório: ${latest.slice(8, 10)}/${latest.slice(5, 7)}/${latest.slice(0, 4)}`
        : 'Data indisponível';
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

    function renderHalfGauge(id, value) {
      const element = byId(id);
      if (!element) return;
      // The stage model rejects invalid or incomparable metrics upstream.
      // Do not display a capped 100% arc for an impossible percentage.
      if (!Number.isFinite(value) || value < 0) {
        element.innerHTML = '<span class="stage-gauge-unavailable" role="status">Sem base</span>';
        element.setAttribute('aria-label', 'Percentual indisponível');
        return;
      }
      const percent = (value * 100).toLocaleString('pt-BR', {
        minimumFractionDigits: 1, maximumFractionDigits: 1
      }) + '%';
      const fraction = (Math.min(value, 1) * 100).toFixed(3);
      // SVG paths share the same geometry and never require a chart dependency.
      element.innerHTML =
        '<svg viewBox="0 0 144 84" role="img" aria-label="' + percent + '" focusable="false">'
        + '<path class="stage-gauge-track" d="M 13 73 A 59 59 0 0 1 131 73" pathLength="100"></path>'
        + '<path class="stage-gauge-progress" d="M 13 73 A 59 59 0 0 1 131 73" pathLength="100"'
        + ' stroke-dasharray="' + fraction + ' 100"></path></svg>';
      element.removeAttribute('aria-label');
    }

    function renderGauge(id, value) {
      if (!isAvailable(value)) return unavailableChart(id);
      const percentage = valueOf(value) * 100;
      if (!Number.isFinite(percentage)) return unavailableChart(id);
      const fill = Math.max(0, Math.min(100, percentage));
      const label = percentage.toLocaleString('pt-BR', {
        minimumFractionDigits: 1, maximumFractionDigits: 1
      });
      // The exact percentage is already shown above; avoid a second, rounded label.
      byId(id).innerHTML =
        '<div class="ratio-meter" role="img" aria-label="Proporção: ' + label + '%">' +
        '<span class="ratio-meter-fill" style="width:' + fill.toFixed(1) + '%"></span>' +
        '</div>';
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
      setInsight('creditAvailable', 'Credito disponivel', valueInsight(values.credit, 'Saldo disponível conforme relatório de crédito; não é movimento do mês.'));
      setInsight('rapTotal', 'Restos a pagar', valueInsight(values.rapTotal, `Total calculado a partir de RAP pago (${formatMoney(values.rapPaid)}) e RAP a pagar (${formatMoney(values.rapPayable)}).`));
      setInsight('gruCollected', 'GRU arrecadadas', valueInsight(values.gru, 'Arrecadacao propria identificada nos dados.'));
      setInsight('creditDonut', 'Credito disponivel e provisionamentos', `Saldos independentes apresentados para comparação, sem considerar que um seja parte ou complemento contábil do outro. Crédito disponível: ${formatMoney(values.credit)}. Provisionado: ${formatMoney(values.budget)}. ${auditSources([values.credit, values.budget])}`);
      setInsight('rapShareValue', 'Proporção de RAP pagos', percentInsight(values.rapPaid, values.rapTotal, 'de RAP pago + RAP a pagar corresponde ao valor pago, sem usar o total originalmente inscrito.'));
      setInsight('gruValue', 'Arrecadacao propria', valueInsight(values.gru, 'Total de GRU arrecadadas.'));
      const st = values.stageModel;
      const stageDetail = st?.ok
        ? 'Mesma posição auditada. Diferenças não implicam atraso.'
        : 'Comparação indisponível: ' + (st?.reason || 'origens divergentes.');
      setInsight('committedGaugeValue', 'Liquidado / empenhado', st?.ok
        ? formatPercent(st.liquidated, st.committed) + '. ' + stageDetail : stageDetail);
      setInsight('liquidatedGaugeValue', 'Pago / liquidado', st?.ok
        ? formatPercent(st.paid, st.liquidated) + '. ' + stageDetail : stageDetail);
      setInsight('paidGaugeValue', 'Pago / empenhado', st?.ok
        ? formatPercent(st.paid, st.committed) + '. ' + stageDetail : stageDetail);
      setInsight('openGaugeValue', 'Liquidado ainda não pago', st?.ok && st.liquidated > 0
        ? formatPercent(st.unpaidLiquidated, st.liquidated) + '. ' + stageDetail : stageDetail);
    }

    function updateGraphInsights(values) {
      setElementInsight('expenseTrendChart', 'Execução da despesa na última extração', `Comparação entre indicadores atuais, não evolução por lançamento. Empenhado: ${formatMoney(values.committed)}. Liquidado: ${formatMoney(values.liquidated)}. Pago: ${formatMoney(values.paid)}. ${auditSources([values.committed, values.liquidated, values.paid])}`);
      setElementInsight('creditDonut', 'Crédito disponível e provisionado', `Comparação de dois saldos auditados, sem subtração ou hipótese de composição. Crédito disponível: ${formatMoney(values.credit)}. Provisionado: ${formatMoney(values.budget)}. ${auditSources([values.credit, values.budget])}`);
      setElementInsight('rapStackChart', 'Composição de Restos a Pagar', `RAP pagos: ${formatMoney(values.rapPaid)}. RAP a pagar: ${formatMoney(values.rapPayable)}. Base do percentual: a soma dessas duas parcelas, ${formatMoney(values.rapTotal)}. Não é o total originalmente inscrito. ${auditSources([values.rapPaid, values.rapPayable, values.rapTotal])}`);
      setElementInsight('gruTreeChart', 'GRU por mês de emissão', `O total de ${formatMoney(values.gru)} é auditado. As barras mensais são recompostas pelos documentos e só aparecem se sua soma reconciliar; o mês da emissão não é necessariamente a data da arrecadação efetiva. ${auditSource(values.gru)}`);
      const stage = values.stageModel;
      const stageNote = stage?.ok ? 'Percentual da posição auditada em ' + stage.date
        : 'Etapas indisponíveis para comparação: ' + (stage?.reason || 'falta de base comum.');
      setElementInsight('committedGauge', 'Liquidado / empenhado', stage?.ok
        ? formatPercent(stage.liquidated, stage.committed) + '. ' + stageNote : stageNote);
      setElementInsight('liquidatedGauge', 'Pago / liquidado', stage?.ok
        ? formatPercent(stage.paid, stage.liquidated) + '. ' + stageNote : stageNote);
      setElementInsight('paidGauge', 'Pago / empenhado', stage?.ok
        ? formatPercent(stage.paid, stage.committed) + '. ' + stageNote : stageNote);
      setElementInsight('openGauge', 'Liquidado ainda não pago',
        stage?.ok && stage.liquidated > 0
          ? formatPercent(stage.unpaidLiquidated, stage.liquidated) + '. ' + stageNote
          : stageNote);
    }


    function chartSourceUrl(slug) {
      const path = reports.find(report => report.slug === slug)?.json_path;
      return path ? 'report-viewer.html?report=' + encodeURIComponent(path) : '';
    }

    function renderExpenseComparison(id, currentValues, stageModel) {
      const renderer = window.EmailBackupHubFinancialCharts;
      if (!renderer?.renderComparison) return unavailableChart(id);
      if (!stageModel?.ok) {
        byId(id).innerHTML = '<p class="chart-empty" role="status">Comparação entre etapas indisponível: '
          + escapeHtml(stageModel?.reason || 'não há três valores auditáveis na mesma posição.')
          + '. Consulte os valores individuais e os relatórios de origem.</p>';
        return;
      }
      const date = financialReports['despesas-empenhadas-liquidadas-e-pagas-mes-lancamento']?.date || 'não informada';
      renderer.renderComparison(byId(id), [
        { label: 'Empenhado', value: stageModel.committed },
        { label: 'Liquidado', value: stageModel.liquidated },
        { label: 'Pago', value: stageModel.paid }
      ], {
        note: 'Posição consultada em ' + date
          + '. Valores acumulados/auditados na extração, não lançamentos por data.',
        url: chartSourceUrl('despesas-empenhadas-liquidadas-e-pagas-mes-lancamento')
      });
    }

    function renderCreditComparison(id, currentValues) {
      const renderer = window.EmailBackupHubFinancialCharts;
      if (!renderer?.renderIndependentBalances) return unavailableChart(id);
      const creditDate = financialReports['credito-disponivel-mes-lancamento']?.date;
      const provisionDate = financialReports['provisionamentos']?.date;
      renderer.renderIndependentBalances(byId(id), [
        { label: 'Crédito disponível', value: valueOf(currentValues.credit), date: creditDate },
        { label: 'Provisionamentos', value: valueOf(currentValues.provisioned), date: provisionDate }
      ], {
        note: 'Crédito disponível e provisionamentos são saldos de relatórios independentes. Não são fatias de um mesmo total nem se deve calcular um percentual entre eles sem validar escopo e filtros.',
        links: [
          { label: 'Consultar crédito disponível', url: chartSourceUrl('credito-disponivel-mes-lancamento') },
          { label: 'Consultar provisionamentos', url: chartSourceUrl('provisionamentos') }
        ]
      });
    }

    function setGruView(view) {
      if (view !== 'codes' && view !== 'months') return;
      gruActiveView = view;
      const codes = byId('gruCodesChart');
      const months = byId('gruTreeChart');
      if (!codes || !months) return;
      codes.hidden = view !== 'codes';
      months.hidden = view !== 'months';
      for (const button of document.querySelectorAll('[data-gru-view]')) {
        const selected = button.dataset.gruView === view;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
      }
      setText('gruSelectionDetail', view === 'codes'
        ? 'Selecione uma área colorida para consultar código, valor e participação.'
        : 'Selecione uma coluna para consultar o mês e o valor líquido.');
    }

    function renderGruMonthlyView(id, legendId, currentValue) {
      const renderer = window.EmailBackupHubFinancialCharts;
      if (!renderer?.renderGruMonthly || !renderer?.renderGruCodes) return unavailableChart(id);
      const container = byId(id);
      const codesContainer = byId('gruCodesChart');
      const slug = 'recolhimento-proprio-gru';
      const report = reports.find(item => item.slug === slug);
      const compact = financialReports[slug];
      const legend = byId(legendId);
      if (legend) legend.textContent = 'GRU com vistas por código e por mês de emissão, ambas reconciliadas.';
      const showError = reason => {
        renderer.renderGruMonthly(container, { ok: false, reason });
        renderer.renderGruCodes(codesContainer, { ok: false, reason });
      };
      if (!isAvailable(currentValue) || !report?.json_path) {
        showError('Total auditado ou relatório detalhado indisponível.');
        return;
      }
      const key = String(indexData?.generated_at || '') + '|' + report.json_path;
      if (gruDetailState.key !== key) {
        gruDetailState = { key, status: 'loading', document: null, error: '' };
        fetch(report.json_path)
          .then(response => {
            if (!response.ok) throw new Error('Falha HTTP ' + response.status);
            return response.json();
          })
          .then(document => {
            if (gruDetailState.key !== key) return;
            gruDetailState = { key, status: 'ready', document, error: '' };
            renderGruMonthlyView(id, legendId, currentValue);
          })
          .catch(error => {
            if (gruDetailState.key !== key) return;
            gruDetailState = { key, status: 'error', document: null, error: String(error.message || error) };
            renderGruMonthlyView(id, legendId, currentValue);
          });
      }
      if (gruDetailState.status === 'loading') {
        container.innerHTML = '<p class="chart-empty" role="status">Conferindo valores mensais…</p>';
        codesContainer.innerHTML = '<p class="chart-empty" role="status">Carregando códigos de recolhimento…</p>';
        return;
      }
      if (gruDetailState.status === 'error') {
        showError('Não foi possível carregar os registros: ' + gruDetailState.error);
        return;
      }
      const doc = gruDetailState.document;
      const expectedHash = compact?.metadata?.hash_conteudo;
      if (expectedHash && doc?.metadata?.hash_conteudo !== expectedHash) {
        showError('O detalhamento não corresponde à mesma versão do resumo auditado.');
        return;
      }
      const total = valueOf(currentValue);
      const monthly = renderer.buildGruMonthly(doc, total);
      const codes = renderer.buildGruByCode(doc, total);
      renderer.renderGruMonthly(container, monthly);
      renderer.renderGruCodes(codesContainer, codes);
      const source = chartSourceUrl(slug);
      const link = byId('gruReportLink');
      if (link) {
        link.innerHTML = source
          ? '<a class="financial-chart-link" href="' + escapeHtml(source) + '">Consultar relatório de origem</a>'
          : '';
      }
      setGruView(gruActiveView);
    }

    function renderRapHistory(id, currentValues) {
      if (!isAvailable(currentValues.rapPaid) || !isAvailable(currentValues.rapPayable)) {
        unavailableChart(id);
        return;
      }
      renderRapBars(id, currentValues.rapPaid, currentValues.rapPayable);
    }

    function renderRapBars(id, paid, payable) {
      if (!isAvailable(paid) || !isAvailable(payable)) return unavailableChart(id);
      const paidValue = valueOf(paid);
      const payableValue = valueOf(payable);
      const total = paidValue + payableValue;
      if (!Number.isFinite(total) || paidValue < 0 || payableValue < 0) {
        byId(id).innerHTML = '<p class="chart-empty" role="status">Não é possível representar a composição: verifique os valores auditados de RAP pagos e a pagar.</p>';
        return;
      }
      if (total === 0) {
        byId(id).innerHTML = '<p class="chart-empty" role="status">RAP pagos e a pagar são ambos R$ 0,00. Não há total positivo para calcular uma proporção.</p>';
        return;
      }
      const paidPercent = paidValue / total * 100;
      const payablePercent = payableValue / total * 100;
      const percentLabel = value => (value / total).toLocaleString('pt-BR', {
        style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1
      });
      const formatValue = value => escapeHtml(formatMoney(value));
      const url = chartSourceUrl('restos-a-pagar-rap');
      const detailsLink = url
        ? '<a class="rap-composition-link" href="' + escapeHtml(url) + '">Consultar relatório de Restos a Pagar</a>'
        : '';
      byId(id).innerHTML =
        '<div class="rap-composition" role="group" aria-label="Composição de RAP pagos e a pagar, relativa ao total acompanhado">' +
          '<div class="rap-composition-track" role="img" aria-label="RAP pago: ' + escapeHtml(percentLabel(paidValue)) +
              '; RAP a pagar: ' + escapeHtml(percentLabel(payableValue)) + '">' +
            '<span class="rap-composition-fill paid" style="width:' + paidPercent.toFixed(3) + '%"></span>' +
            '<span class="rap-composition-fill open" style="width:' + payablePercent.toFixed(3) + '%"></span>' +
          '</div>' +
          '<dl class="rap-composition-details">' +
            '<div class="rap-composition-item" role="button" tabindex="0" aria-pressed="false" title="Detalhar RAP pagos">' +
              '<dt><i class="legend-dot legend-accent" aria-hidden="true"></i>RAP pagos</dt>' +
              '<dd><strong>' + formatValue(paidValue) + '</strong><span>' + escapeHtml(percentLabel(paidValue)) + '</span></dd>' +
            '</div>' +
            '<div class="rap-composition-item" role="button" tabindex="0" aria-pressed="false" title="Detalhar RAP a pagar">' +
              '<dt><i class="legend-dot legend-accent-2" aria-hidden="true"></i>RAP a pagar</dt>' +
              '<dd><strong>' + formatValue(payableValue) + '</strong><span>' + escapeHtml(percentLabel(payableValue)) + '</span></dd>' +
            '</div>' +
          '</dl>' +
          '<div class="rap-composition-total">Total acompanhado (base dos percentuais): <strong>' + formatValue(total) + '</strong></div>' +
          detailsLink +
        '</div>';
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
      setText('managementAlertCount', alerts.length === 1 ? '1 aviso' : String(alerts.length) + ' avisos');
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
      const rapIssue = (!isAvailable(values.rapPaid) || !isAvailable(values.rapPayable)) ? (rapMetricIssue('rap_pago') || rapMetricIssue('rap_a_pagar')) : null;
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

    function csvCell(value) {
      const text = String(value ?? '');
      const numeric = /^[+-]?(?:\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)$/.test(text.trim());
      const safeText = !numeric && (/^[\t\r\n]/.test(text) || /^\s*[=+@-]/.test(text)) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    }
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
      return String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
    }

    function selectFinancialGraphic(target) {
      const card = target.closest('.chart-card');
      if (!card) return;
      const selector = '.financial-bar-row[role="button"], .financial-independent-item[role="button"], '
        + '.rap-composition-item[role="button"], .stage-gauge-card[role="button"]';
      const selectable = target.closest(selector);
      if (!selectable || !card.contains(selectable)) return;
      const detailId = card.classList.contains('chart-card--expense') ? 'expenseChartDetail'
        : card.classList.contains('chart-card--rap') ? 'rapChartDetail'
        : card.classList.contains('chart-card--credit') ? 'creditChartDetail'
        : card.classList.contains('chart-card--stages') ? 'stagesChartDetail' : '';
      const detail = byId(detailId);
      if (!detail) return;
      for (const node of card.querySelectorAll(selector)) {
        node.setAttribute('aria-pressed', String(node === selectable));
      }
      const label = selectable.querySelector('.financial-bar-label, dt, .stage-gauge-title');
      const value = selectable.querySelector('.financial-bar-value, dd, .stage-gauge-value');
      const caption = selectable.querySelector('.stage-gauge-caption');
      detail.textContent = [label?.textContent, value?.textContent, caption?.textContent]
        .filter(Boolean).map(part => part.trim()).join(' — ');
      detail.hidden = false;
    }

    byId('search').addEventListener('input', handleSearchInput);
    byId('periodicity').addEventListener('change', renderReportCatalog);
    byId('catalogScope').addEventListener('change', renderReportCatalog);
    byId('catalogMarkSeen').addEventListener('click', acknowledgeCatalogReports);
    byId('rows').addEventListener('click', event => {
      const button = event.target.closest('[data-favorite-report]');
      if (button) toggleCatalogFavorite(button.dataset.favoriteReport);
    });
    byId('status').addEventListener('change', renderReportCatalog);
    byId('exportCsv').addEventListener('click', exportCsv);
    byId('themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    initTheme();
    document.querySelector('.gru-view-switch').addEventListener('click', event => {
      const button = event.target.closest('[data-gru-view]');
      if (button) setGruView(button.dataset.gruView);
    });
    document.querySelector('.chart-card--gru').addEventListener('click', event => {
      const selected = event.target.closest('[data-gru-code], [data-gru-month]');
      if (!selected) return;
      const group = selected.closest('.gru-view-panel');
      for (const node of group.querySelectorAll('[aria-pressed]')) {
        node.setAttribute('aria-pressed', String(node === selected));
      }
      if (selected.dataset.gruCode) {
        setText('gruSelectionDetail', selected.dataset.gruCode + ' · '
          + selected.dataset.gruDescription + ' — ' + selected.dataset.gruValue
          + ' · ' + String(selected.dataset.gruShare).replace('.', ',')
          + '% dos valores positivos por código · ' + selected.dataset.gruRecords + ' registro(s).');
      } else {
        setText('gruSelectionDetail', selected.dataset.gruMonth + ' — '
          + selected.dataset.gruValue + ' · ' + selected.dataset.gruRecords + ' registro(s).');
      }
    });
    document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
      const nextKey = th.dataset.sort;
      sortDir = sortKey === nextKey ? -sortDir : 1;
      sortKey = nextKey;
      renderReportCatalog();
    }));
    byId('dashboardCharts').addEventListener('click', event => {
      selectFinancialGraphic(event.target);
    });
    byId('dashboardCharts').addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const clickable = event.target.closest('.financial-bar-row[role="button"], '
        + '.financial-independent-item[role="button"], .rap-composition-item[role="button"], '
        + '.stage-gauge-card[role="button"]');
      if (!clickable) return;
      event.preventDefault();
      selectFinancialGraphic(clickable);
    });

    loadData().catch(error => { byId('rows').innerHTML = `<tr><td colspan="7">Erro ao carregar dados: ${escapeHtml(error.message)}</td></tr>`; });
