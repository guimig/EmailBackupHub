'use strict';
(function () {
  let attempts = 0;
  function verify() {
    const el = id => document.getElementById(id);
    const chart = el('expenseTrendChart');
    const points = chart.querySelectorAll('circle.history-point');
    if (!points.length) {
      if (attempts++ < 50) return setTimeout(verify, 100);
      document.documentElement.dataset.dashboardQa = encodeURIComponent(JSON.stringify({loaded:false}));
      return;
    }
    const qa = {};
    qa.loaded = el('totalReports').textContent === '7';
    qa.auditedKpis = /50\.000/.test(el('committedTotal').textContent) &&
      /100\.000/.test(el('budgetBase').textContent);
    qa.timeSeriesAvailable = points.length === 15;
    qa.sourceLink = Boolean(chart.querySelector('a.history-source-link[href*="report-viewer.html"]'));
    qa.legendVisible = chart.querySelectorAll('.history-series-toggle').length === 3;
    qa.correctInitialRange = el('historyRange').value === '0';
    const firstSeries = chart.querySelector('.history-series-toggle');
    firstSeries.click();
    qa.toggleSeries = firstSeries.dataset.seriesLabel &&
      chart.querySelectorAll('circle.history-point').length === 10 &&
      chart.querySelector('[data-series-label="' + firstSeries.dataset.seriesLabel + '"]').getAttribute('aria-pressed') === 'false';
    el('historyRange').value = '30';
    el('historyRange').dispatchEvent(new Event('change',{bubbles:true}));
    qa.rangeUpdates = chart.querySelectorAll('circle.history-point').length === 4;
    const point = chart.querySelector('circle.history-point');
    point.dispatchEvent(new Event('focus'));
    qa.pointDetails = chart.querySelector('.history-hover').textContent.includes('R$');
    qa.temporalMetadata = chart.textContent.includes('Último ponto');
    const oldTheme = document.documentElement.dataset.theme;
    el('themeToggle').click();
    qa.themeKeepsHistory = document.documentElement.dataset.theme !== oldTheme &&
      chart.querySelectorAll('circle.history-point').length === 4;
    qa.chartHelpAccessible = getComputedStyle(document.querySelector('.chart-help')).display !== 'none';
    qa.noHorizontalPageOverflow = document.documentElement.scrollWidth <= window.innerWidth+4;
    qa.catalogTracksAllReports = document.querySelectorAll('#rows [data-favorite-report]').length === 7;
    const firstFavorite = document.querySelector('#rows [data-favorite-report]');
    if (firstFavorite) firstFavorite.click();
    qa.favoriteTogglePersists = document.querySelector('#rows [data-favorite-report]')?.getAttribute('aria-pressed') === 'true' &&
      Boolean(localStorage.getItem('emailbackuphub:catalog:v1')?.includes('favorites'));
    el('catalogScope').value = 'favorites';
    el('catalogScope').dispatchEvent(new Event('change', { bubbles: true }));
    qa.favoriteFilterWorks = document.querySelectorAll('#rows tr').length === 1;
    el('catalogScope').value = 'all';
    el('catalogScope').dispatchEvent(new Event('change', { bubbles: true }));
    qa.allReportsRestored = document.querySelectorAll('#rows [data-favorite-report]').length === 7;
    document.documentElement.dataset.dashboardQa = encodeURIComponent(JSON.stringify(qa));
  }
  setTimeout(verify, 100);
}());
