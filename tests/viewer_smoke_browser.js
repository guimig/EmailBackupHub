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

    $('expandTable').click();
    qa.expandedMode = document.body.classList.contains('table-expanded')
      && $('readerWorkspace').getBoundingClientRect().width >= window.innerWidth - 30;
    $('expandTable').click();
    $('tableWrap').blur();
    $('expandTable').blur();
    $('themeToggle').click();
    qa.lightTheme = document.documentElement.dataset.theme === 'light' &&
      getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)';

    qa.toolbarShort = $('readerWorkspace').querySelector('.toolbar').getBoundingClientRect().height < 115;
    qa.noRepeatedLongControls = $('table').querySelectorAll('[data-filter-column]').length === dataHeaders.length
      && $('table').querySelectorAll('thead select').length === 0;
    document.documentElement.dataset.viewerQa = encodeURIComponent(JSON.stringify(qa));
  }
  setTimeout(check, 100);
}());
