'use strict';
(function () {
  let attempts = 0;
  function verify() {
    try {
      const el = id => document.getElementById(id);
      const expense = el('expenseTrendChart');
      const gru = el('gruCodesChart');
      const nd = el('ndCommitmentsChart');
      if (!expense?.querySelector('.financial-comparison') ||
          !gru?.querySelector('.gru-treemap') ||
          !nd?.querySelector('.nd-treemap')) {
        if (attempts++ < 70) return setTimeout(verify, 100);
        document.documentElement.dataset.dashboardQa = encodeURIComponent(JSON.stringify({
          loaded: false, expense: expense?.textContent.slice(0, 80),
          gru: gru?.textContent.slice(0, 80), nd: nd?.textContent.slice(0, 80)
        }));
        return;
      }

      const qa = {};
      const chartGrid = el('dashboardCharts');
      const cards = [...chartGrid.querySelectorAll(':scope > .chart-card')];
      const card = name => chartGrid.querySelector('.chart-card--' + name);
      const visible = () => cards.filter(node => !node.hidden).map(node =>
        [...node.classList].find(name => name.startsWith('chart-card--')).replace('chart-card--', ''));
      const rect = node => node.getBoundingClientRect();
      const style = node => getComputedStyle(node);
      const click = name => el('dashboardTab' + name).click();
      const fit = () => {
        const helper = window.EmailBackupHubFinancialCharts?.fitTreemapLabels;
        helper?.(gru); helper?.(nd);
      };
      const labelsFit = container => [...container.querySelectorAll('.gru-treemap-tile')].every(tile => {
        const visibleLabels = [...tile.querySelectorAll('.gru-tile-code, .gru-tile-name, .gru-tile-amount')]
          .filter(node => !node.hidden && style(node).display !== 'none');
        const css = style(tile);
        const innerW = tile.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
        const innerH = tile.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
        return visibleLabels.every(node => node.scrollWidth <= innerW + 3)
          && visibleLabels.reduce((sum, node) => sum + node.scrollHeight, 0)
            + Math.max(0, visibleLabels.length - 1) * (parseFloat(css.rowGap) || 0) <= innerH + 3
          && !!tile.getAttribute('aria-label')
          && !!tile.getAttribute('title');
      });

      qa.loaded = el('totalReports').textContent === '7';
      qa.auditedKpis = /100\.000/.test(el('budgetBase').textContent)
        && /40\.000/.test(el('creditAvailable').textContent)
        && /2\.000/.test(el('rapTotal').textContent)
        && /2\.500/.test(el('gruCollected').textContent);
      qa.kpisArePrimaryLinks = [
        ['budgetCardLink','provisionamentos'],
        ['creditCardLink','credito-disponivel-mes-lancamento'],
        ['rapCardLink','restos-a-pagar-rap'],
        ['gruCardLink','recolhimento-proprio-gru']
      ].every(([id,slug]) => !!el(id)?.href && el(id).href.includes(slug)
        && !!el(id).getAttribute('aria-label') && !!el(id).getAttribute('title'));
      qa.rapKpiShowsPayableNotPaidTotal = /2\.000/.test(el('rapTotal').textContent)
        && el('rapCardLink').textContent.includes('Restos a pagar a pagar')
        && !/12\.000/.test(el('rapTotal').textContent);
      qa.fiveDistinctCharts = cards.length === 5 &&
        ['expense','rap','stages','nd','gru'].every(name => !!card(name));
      qa.threeAccessibleTabs = [...document.querySelectorAll('[data-dashboard-view]')].length === 3
        && el('dashboardViewTabs').getAttribute('role') === 'tablist'
        && chartGrid.getAttribute('role') === 'tabpanel'
        && [...document.querySelectorAll('[data-dashboard-view]')].every(tab =>
          tab.getAttribute('role') === 'tab' && !!tab.getAttribute('aria-controls'));
      qa.defaultOverviewOnly = visible().join(',') === 'expense,rap'
        && el('dashboardTabOverview').getAttribute('aria-selected') === 'true';
      qa.overviewWithoutBlankGridTracks = rect(card('expense')).width > 100
        && rect(card('rap')).width > 100
        && (window.innerWidth <= 760
          ? rect(card('rap')).top >= rect(card('expense')).bottom - 5
          : Math.abs(rect(card('rap')).top - rect(card('expense')).top) < 5);
      qa.expenseShowsStages = expense.querySelectorAll('.financial-bar-row').length === 3
        && expense.textContent.includes('50.000')
        && expense.textContent.includes('30.000')
        && expense.textContent.includes('20.000');
      qa.rapPercentAndValues = el('rapShareValue').textContent.includes('83,3')
        && el('rapStackChart').textContent.includes('10.000')
        && el('rapStackChart').textContent.includes('2.000');
      qa.topReportLinks = [
        ['budgetReportLink','provisionamentos'],
        ['creditReportLink','credito-disponivel-mes-lancamento'],
        ['rapReportLink','restos-a-pagar-rap'],
        ['gruReportKpiLink','recolhimento-proprio-gru']
      ].every(([id,slug]) => !!el(id)?.href && el(id).href.includes(slug));
      qa.helpStaysAvailable = cards.every(node =>
        node.querySelectorAll(':scope > .chart-card-head .chart-help summary').length === 1);
      qa.managementCollapsed = !el('managementAlertsPanel').open;
      qa.noGlossaryOrDuplicateBalances = !document.querySelector('.glossary-panel,.chart-card--credit');

      click('Execution'); fit();
      qa.executionOnly = visible().join(',') === 'stages,nd'
        && el('dashboardTabExecution').getAttribute('aria-selected') === 'true'
        && chartGrid.getAttribute('aria-labelledby') === 'dashboardTabExecution';
      const gauges = card('stages').querySelectorAll('.stage-gauge-card');
      qa.fourCorrectGauges = gauges.length === 4
        && el('provisionGaugeValue').textContent.includes('50,0')
        && el('committedGaugeValue').textContent.includes('60,0')
        && el('liquidatedGaugeValue').textContent.includes('66,7')
        && el('openGaugeValue').textContent.includes('33,3');
      gauges[0].click();
      qa.stageNominalOnClick = !el('stageGaugeDetail').hidden
        && el('stageGaugeDetail').textContent.includes('R$ 50.000,00 de R$ 100.000,00')
        && gauges[0].getAttribute('aria-pressed') === 'true'
        && gauges[0].getAttribute('aria-controls') === 'stageGaugeDetail';
      gauges[1].click();
      qa.stageDetailSwitchesWithSelection = el('stageGaugeDetail').textContent.includes('R$ 30.000,00 de R$ 50.000,00')
        && gauges[1].getAttribute('aria-pressed') === 'true'
        && gauges[0].getAttribute('aria-pressed') === 'false';
      qa.ndButtonsMatchGru = el('ndViewGeneralButton').classList.contains('gru-view-button')
        && el('ndViewDetailedButton').classList.contains('gru-view-button');
      qa.ndStageBalancesReconciled = nd.querySelectorAll('.nd-treemap-tile').length === 3
        && el('ndChartTotal').textContent.includes('2.700,50')
        && el('ndChartTotal').textContent.includes('4 NEs')
        && JSON.parse(new URL(el('ndReportLink').href).searchParams.get('vgs')).length === 3;
      qa.ndLabelsComplete = labelsFit(nd);
      qa.ndFullWidth = Math.abs(rect(card('nd')).width - rect(chartGrid).width) < 6
        && (window.innerWidth <= 760
          ? rect(card('nd')).top >= rect(card('stages')).bottom - 6
          : rect(card('nd')).top >= rect(card('stages')).bottom - 6);
      qa.generalModeHasGroups = el('ndViewGeneralButton').getAttribute('aria-pressed') === 'true'
        && nd.querySelectorAll('.nd-treemap-tile').length === 3;
      const generalTile = [...nd.querySelectorAll('.nd-treemap-tile')]
        .find(node => node.dataset.ndDescription === 'AUXILIO FINANCEIRO A ESTUDANTES');
      generalTile.click();
      qa.ndGeneralDrillsDown = el('ndViewDetailedButton').getAttribute('aria-pressed') === 'true'
        && !el('ndBackButton').hidden
        && nd.querySelectorAll('.nd-treemap-tile').length === 2
        && el('ndChartTotal').textContent.includes('2.700,50');
      const detailTile = nd.querySelector('.nd-treemap-tile');
      detailTile.click();
      qa.ndDetailShowsSelectedValue = detailTile.getAttribute('aria-pressed') === 'true'
        && !el('ndChartDetail').hidden
        && el('ndChartDetail').textContent.includes('registro(s)');
      el('ndBackButton').click();
      qa.ndBackRestoresOverview = el('ndViewGeneralButton').getAttribute('aria-pressed') === 'true'
        && el('ndBackButton').hidden && nd.querySelectorAll('.nd-treemap-tile').length === 3;
      el('ndViewDetailedButton').click();
      qa.ndDetailedAllCodes = nd.querySelectorAll('.nd-treemap-tile').length === 4
        && el('ndViewDetailedButton').getAttribute('aria-pressed') === 'true'
        && el('ndChartTotal').textContent.includes('2.700,50');
      fit();
      qa.ndLabelsCompleteAfterDrill = labelsFit(nd);
      el('dashboardTabExecution').dispatchEvent(new KeyboardEvent('keydown', {
        bubbles:true, key:'ArrowRight'
      }));
      qa.keyboardSwitchesTabs = el('dashboardTabRevenue').getAttribute('aria-selected') === 'true';

      fit();
      qa.revenueOnly = visible().join(',') === 'gru';
      qa.gruCompositionLoaded = gru.querySelectorAll('.gru-treemap-tile').length === 3
        && gru.textContent.includes('SERVICOS EDUCACIONAIS');
      qa.gruLabelsComplete = labelsFit(gru);
      const code = gru.querySelector('[data-gru-code]');
      code.click();
      qa.gruClickShowsUsefulDetail = code.getAttribute('aria-pressed') === 'true'
        && !el('gruSelectionDetail').hidden
        && el('gruSelectionDetail').textContent.includes(code.dataset.gruCode);
      el('gruViewMonthsButton').click();
      qa.gruMonthlyAlternative = el('gruTreeChart').querySelectorAll('.gru-month-button').length === 11
        && !el('gruTreeChart').hidden && gru.hidden;
      qa.gruMonthScaleInReais = el('gruTreeChart').querySelectorAll('.gru-month-axis-tick').length === 5
        && el('gruTreeChart').querySelector('.gru-month-axis').textContent.includes('R')
        && el('gruTreeChart').querySelector('.gru-month-positive') !== null
        && el('gruTreeChart').querySelector('.gru-month-negative') !== null;
      el('gruViewCodesButton').click();
      qa.gruBackToCodeView = !gru.hidden && el('gruTreeChart').hidden;

      click('Overview');
      qa.switchRestoresOverview = visible().join(',') === 'expense,rap';
      qa.noHorizontalOverflow = document.documentElement.scrollWidth <= window.innerWidth + 4;
      qa.kpisAlwaysVisible = rect(el('budgetBase')).width > 0
        && rect(el('gruCollected')).width > 0;
      qa.dashboardCardPaddingConsistent = cards.every(node =>
        Math.abs(parseFloat(style(node).paddingLeft)
          - parseFloat(style(cards[0]).paddingLeft)) < .5);
      qa.chartLinksUseSameWording = [...document.querySelectorAll(
        '.dashboard-charts--overview .financial-chart-link, .dashboard-charts--overview .rap-composition-link'
      )].every(link => link.textContent.trim() === 'Ver relatório ↗');
      qa.catalogStillUsable = document.querySelectorAll('#rows [data-favorite-report]').length === 7
        && !!el('search') && !!el('catalogScope') && !!el('exportCsv');

      document.documentElement.dataset.dashboardQa = encodeURIComponent(JSON.stringify(qa));
    } catch (error) {
      document.documentElement.dataset.dashboardQa = encodeURIComponent(JSON.stringify({
        browserScriptError: String(error),
        stack: String(error?.stack || '').slice(0, 1200)
      }));
    }
  }
  setTimeout(verify, 200);
}());
