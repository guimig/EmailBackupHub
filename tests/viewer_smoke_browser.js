/* Loaded only by the isolated browser smoke test (never in production HTML). */
(function () {
  'use strict';
  let attempts = 0;

  function check() {
    const rows = document.querySelectorAll('#table tbody tr');
    if (!rows.length || !document.querySelector('#table col[data-column-index]')) {
      if (attempts++ < 40) return setTimeout(check, 100);
      document.documentElement.dataset.viewerQa = encodeURIComponent(JSON.stringify({ loaded: false }));
      return;
    }

    const $ = id => document.getElementById(id);
    const allHeaders = [...document.querySelectorAll('#table thead th')];
    const dataHeaders = allHeaders.slice(1);
    const dataColumns = $('table').querySelectorAll('col[data-column-index]');
    const originalWidth = Number(dataColumns[0].style.width.replace('px', ''));
    const qa = {
      loaded: $('title').textContent.toLocaleLowerCase('pt-BR').includes('crédito disponível'),
      defaultDataOnly: rows.length === 12 && !$('showTotals').checked,
      progressiveDisclosure: !$('advancedTools').open && !$('sourceDetails').open,
      noSortSelectInHeader: $('table').querySelectorAll('thead select').length === 0,
      responsiveHeaderHeights: dataHeaders.every(th => th.getBoundingClientRect().height < 120),
      readableColumns: dataHeaders.every(th => th.getBoundingClientRect().width >= 148),
      automaticSelection: dataHeaders.length >= 6 && dataHeaders.length < 11,
      internalHorizontalScroll: $('tableWrap').scrollWidth > $('tableWrap').clientWidth,
      fullWidthMain: $('readerWorkspace').getBoundingClientRect().width >= Math.min(window.innerWidth - 30, 900),
      bodyWithoutHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 4
    };

    $('openFilterPanel').click();
    qa.filterAccessible = !$('filterEditor').hidden && $('filterColumnPicker').options.length === 11;
    $('closeFilterEditor').click();
    $('toggleColumns').click();
    qa.columnManagerAccessible = !$('columnPanel').hidden &&
      $('columnVisibilityOptions').querySelectorAll('input').length === 11;
    $('closeColumnPanel').click();

    const head = $('table').querySelector('[data-sort-heading]');
    head.click();
    qa.sortByClick = $('table').querySelector('th[aria-sort="ascending"]') !== null;
    $('table').querySelector('[data-sort-heading]').click();
    qa.sortDescending = $('table').querySelector('th[aria-sort="descending"]') !== null;
    $('table').querySelector('[data-sort-heading]').click();

    $('columnWidthRange').value = '350';
    $('columnWidthRange').dispatchEvent(new Event('input', { bubbles: true }));
    const resized = $('table').querySelector('col[data-column-index]');
    qa.columnWidthSlider = Number(resized.style.width.replace('px', '')) > originalWidth + 50;
    $('resetWidths').click();

    const opener = $('table').querySelector('[data-open-row]');
    opener.click();
    qa.detailShowsAllColumns = $('rowDialog').open && $('rowDetails').querySelectorAll('dt').length === 11;
    $('closeRowDialog').click();
    $('table').querySelector('tbody tr[data-row-index] td:not(.row-open-cell)').click();
    qa.clickRowOpensDetails = $('rowDialog').open;
    $('closeRowDialog').click();

    $('reportChart').open = true;
    $('reportChart').dispatchEvent(new Event('toggle'));
    qa.chartOptionalAndAvailable = $('reportChart').open &&
      $('chartMeasure').options.length > 0 && $('reportChartVisual').querySelectorAll('[data-record-index]').length === 12;
    const chartFirst = $('reportChartVisual').querySelector('[data-record-index]');
    if (chartFirst) chartFirst.click();
    qa.chartOpensOriginalRecord = $('rowDialog').open && $('rowDetails').querySelectorAll('dt').length === 11;
    if ($('rowDialog').open) $('closeRowDialog').click();
    qa.chartHasNoAutomaticTotal = $('reportChartVisual').querySelectorAll('[data-record-index]').length === 12;
    qa.chartSuggestionAvailable = $('chartSuggestedTitle').textContent.includes('Sugestão:') &&
      $('chartSuggestedReason').textContent.includes('sem somas automáticas');
    qa.suggestionVisibleWhenCollapsed = $('chartPreview').textContent.includes('Maiores valores por registro');
    $('chartMode').value = 'count';
    $('chartMode').dispatchEvent(new Event('change', { bubbles:true }));
    $('chartDimension').value = 'Grupo Despesa';
    $('chartDimension').dispatchEvent(new Event('change', { bubbles:true }));
    $('chartType').value = 'pie';
    $('chartType').dispatchEvent(new Event('change', { bubbles:true }));
    qa.pieShowsDistribution = $('reportChartVisual').querySelectorAll('.smart-chart-slice').length === 2;
    $('reportChartVisual').querySelector('.smart-chart-slice').click();
    qa.pieFiltersRealTable = $('pageInfo').textContent.includes(' de 8 registros') ||
      $('pageInfo').textContent.includes(' de 4 registros');
    $('clearFilters').click();
    qa.clearRestoresFullSet = $('pageInfo').textContent.includes(' de 12 registros');
    $('chartMode').value = 'sum';
    $('chartMode').dispatchEvent(new Event('change', { bubbles:true }));
    $('chartType').value = 'bar';
    $('chartType').dispatchEvent(new Event('change', { bubbles:true }));
    qa.sumRequiresInterpretation = $('chartSummary').textContent.includes('Soma configurada pelo usuário');
    $('chartType').value = 'line';
    $('chartType').dispatchEvent(new Event('change', { bubbles:true }));
    qa.lineBlocksNonTemporal = $('chartSummary').textContent.includes('Linha exige uma coluna');
    $('chartUseSuggestion').click();
    qa.recommendationRestoresSafeDefault = $('chartMode').value === 'records' &&
      $('chartType').value === 'bar' &&
      $('reportChartVisual').querySelectorAll('[data-record-index]').length === 12;
    $('reportChart').open = false;

    $('expandTable').click();
    qa.expandedMode = document.body.classList.contains('table-expanded')
      && $('readerWorkspace').getBoundingClientRect().width >= window.innerWidth - 30;
    $('expandTable').click();
    $('tableWrap').blur();
    $('expandTable').blur();
    $('themeToggle').click();
    qa.lightTheme = document.documentElement.dataset.theme === 'light' &&
      getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)';

    qa.savedViewsInitiallyClosed = !$('savedViews').open;
    $('savedViews').open = true;
    $('savedViewName').value = 'Consulta de teste';
    $('saveView').click();
    qa.savedViewStored = $('savedViewSelect').options.length === 2 &&
      $('savedViewStatus').textContent.includes('salva');
    $('globalSearch').value = 'inexistente-para-teste';
    $('globalSearch').dispatchEvent(new Event('input', { bubbles: true }));
    $('savedViewSelect').value = 'Consulta de teste';
    $('savedViewSelect').dispatchEvent(new Event('change', { bubbles: true }));
    $('loadView').click();
    qa.savedViewRestored = $('globalSearch').value === '' &&
      $('savedViewStatus').textContent.includes('aplicada');
    const previousConfirm = window.confirm;
    window.confirm = () => true;
    $('deleteView').click();
    window.confirm = previousConfirm;
    qa.savedViewDeleted = $('savedViewSelect').options.length === 1 &&
      $('savedViewStatus').textContent.includes('excluída');
    $('savedViews').open = false;

    qa.pageSizeOffersAllChoices = ['25','50','100','250','500','1000','all'].every(value =>
      [...$('pageSize').options].some(option => option.value === value));
    $('pageSize').value = 'all';
    $('pageSize').dispatchEvent(new Event('change', { bubbles: true }));
    qa.allRowsVisible = $('table').querySelectorAll('tbody tr[data-row-index]').length === 12 &&
      $('pageInfo').textContent.includes('todas as 12 linhas filtradas');
    qa.allRowsHasSinglePage = $('pageNumber').textContent === 'Página 1 de 1' &&
      $('previousPage').disabled && $('nextPage').disabled;
    qa.allRowsLinkShareable = new URLSearchParams(location.search).get('ps') === 'all';
    $('pageSize').value = '100';
    $('pageSize').dispatchEvent(new Event('change', { bubbles: true }));
    qa.largerPageRestored = $('pageSize').value === '100' &&
      new URLSearchParams(location.search).get('ps') === '100';
    $('pageSize').value = '50';
    $('pageSize').dispatchEvent(new Event('change', { bubbles: true }));
    qa.toolbarShort = $('readerWorkspace').querySelector('.toolbar').getBoundingClientRect().height < 115;
    qa.noRepeatedLongControls = $('table').querySelectorAll('[data-filter-column]').length === dataHeaders.length
      && $('table').querySelectorAll('thead select').length === 0;
    document.documentElement.dataset.viewerQa = encodeURIComponent(JSON.stringify(qa));
  }
  setTimeout(check, 100);
}());
