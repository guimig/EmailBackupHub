(function () {
  async function loadReportDefinitions(path = 'data/report-definitions.json') {
    try {
      const response = await fetch(path);
      if (!response.ok) return {};
      const payload = await response.json();
      return payload.reports || {};
    } catch {
      return {};
    }
  }

  function reportDefinition(definitions, slug) {
    return (definitions || {})[slug] || {};
  }

  window.EmailBackupHub = {
    ...(window.EmailBackupHub || {}),
    loadReportDefinitions,
    reportDefinition
  };
}());
