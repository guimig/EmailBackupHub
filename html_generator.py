import datetime
import html
import os
import re
import unicodedata
from config import BACKUP_FOLDER, TIMEZONE, REPO_ROOT
from report_definitions import report_title

EXCLUDED_ROOT_HTML = {"index.html", "dashboard.html", "report-viewer.html", "relatorios.html"}


def normalize_slug(text):
    text = unicodedata.normalize("NFD", text or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"\s+", "-", text).strip("-")
    text = re.sub(r"-+", "-", text)
    return text or "sem-titulo"


def report_slug(file_path):
    parent = os.path.basename(os.path.dirname(file_path))
    if parent and parent != os.path.basename(REPO_ROOT):
        return normalize_slug(parent)
    return normalize_slug(os.path.splitext(os.path.basename(file_path))[0])


def friendly_title(file_path, title):
    return report_title(report_slug(file_path), title) or title


def parse_report_date(file_path, content=None):
    content = content or ""
    date_match = re.search(r"Relatório gerado em: (\d{2}/\d{2}/\d{4})", content)
    if date_match:
        return datetime.datetime.strptime(date_match.group(1), "%d/%m/%Y")
    filename_date_match = re.search(r"(\d{2}-\d{2}-\d{4})", os.path.basename(file_path))
    if filename_date_match:
        return datetime.datetime.strptime(filename_date_match.group(1), "%d-%m-%Y")
    return datetime.datetime.fromtimestamp(os.path.getmtime(file_path), TIMEZONE).replace(tzinfo=None)


def create_latest_summary_html():
    """Gera arquivos HTML na raiz com os últimos relatórios de cada pasta."""
    for root, dirs, files in os.walk(BACKUP_FOLDER):
        if root == BACKUP_FOLDER:
            continue

        html_files = []
        for file_name in files:
            if file_name.endswith(".html"):
                file_path = os.path.join(root, file_name)
                html_files.append((file_name, parse_report_date(file_path)))

        if not html_files:
            continue

        latest_file, latest_date = sorted(html_files, key=lambda item: item[1], reverse=True)[0]
        latest_path = os.path.join(root, latest_file)
        output_path = os.path.join(REPO_ROOT, f"{os.path.basename(root)}.html")

        with open(latest_path, "r", encoding="utf-8") as source:
            content = source.read()

        footer = f"""
        <div style="margin-top: 40px; color: #8b949e; border-top: 1px solid #30363d; padding-top: 20px;">
            <p>Relatório gerado em: {latest_date.strftime('%d/%m/%Y')}</p>
            <p>Última busca por novos relatórios: {datetime.datetime.now(TIMEZONE).strftime('%d/%m/%Y %H:%M:%S')}</p>
        </div>
        """

        with open(output_path, "w", encoding="utf-8") as output:
            output.write(content + footer)


def get_report_metadata(file_path):
    """Extrai metadados dos arquivos HTML."""
    try:
        with open(file_path, "r", encoding="utf-8") as source:
            content = source.read()
        title_match = re.search(r"<td colspan=1 style='font-family:tahoma;font-size:18.0pt'>(.*?)</td>", content)
        raw_title = title_match.group(1) if title_match else os.path.splitext(os.path.basename(file_path))[0]
        date = parse_report_date(file_path, content)
        return {
            "title": friendly_title(file_path, raw_title),
            "date": date.strftime("%d/%m/%Y"),
            "date_obj": date,
            "filename": os.path.basename(file_path),
        }
    except Exception as error:
        print(f"Erro ao ler metadados: {error}")
        date = datetime.datetime.now().replace(tzinfo=None)
        raw_title = os.path.splitext(os.path.basename(file_path))[0]
        return {"title": friendly_title(file_path, raw_title), "date": date.strftime("%d/%m/%Y"), "date_obj": date, "filename": os.path.basename(file_path)}


def report_card(report):
    return f"""
        <div class="report-card" data-date="{html.escape(report['date'])}" data-category="{html.escape(report['title'])}">
            <a href="{html.escape(report['path'])}">{html.escape(report['title'])}</a>
            <div class="report-meta">Data do relatório: {html.escape(report['date'])}</div>
        </div>
    """


def collect_reports():
    latest = []
    history = []
    for file_name in os.listdir(REPO_ROOT):
        if file_name.endswith(".html") and file_name not in EXCLUDED_ROOT_HTML:
            file_path = os.path.join(REPO_ROOT, file_name)
            latest.append({**get_report_metadata(file_path), "path": file_name})

    for root, dirs, files in os.walk(BACKUP_FOLDER):
        for file_name in files:
            if file_name.endswith(".html"):
                file_path = os.path.join(root, file_name)
                history.append({**get_report_metadata(file_path), "path": os.path.relpath(file_path, REPO_ROOT)})

    latest.sort(key=lambda item: (item["title"], item["date_obj"]))
    history.sort(key=lambda item: (item["title"], item["date_obj"]), reverse=True)
    return latest, history


def render_options(reports):
    titles = sorted({report["title"] for report in reports})
    return "".join(f'<option value="{html.escape(title)}">{html.escape(title)}</option>' for title in titles)


def update_root_index():
    latest_reports, history_reports = collect_reports()
    latest_cards = "".join(report_card(report) for report in latest_reports)
    history_cards = "".join(report_card(report) for report in history_reports)
    category_options = render_options(latest_reports)

    reports_html_content = f"""
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>DAP - Relatórios Gerenciais</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
  <style>
    body {{ font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 20px; background: #0d1117; color: #c9d1d9; line-height: 1.6; }}
    h1 {{ color: #f0f6fc; text-align: center; font-size: 2.4rem; margin: 16px 0 20px; }}
    a {{ text-decoration: none; color: #58a6ff; display: block; margin-bottom: 10px; }}
    a:hover {{ text-decoration: underline; color: #1f6feb; }}
    .main-title {{ position: relative; text-align: center; }}
    .title-text {{ position: relative; z-index: 2; }}
    .title-highlight {{ position: absolute; bottom: -2px; left: 50%; transform: translateX(-50%); width: 60%; height: 8px; background: linear-gradient(90deg, #58a6ff, #1959bd); border-radius: 5px; opacity: .75; }}
    .top-menu {{ max-width: 1100px; margin: 0 auto 26px; display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }}
    .top-menu a {{ display: inline-flex; align-items: center; gap: 8px; padding: 11px 16px; border: 1px solid #30363d; border-radius: 999px; background: linear-gradient(180deg, #161b22, #0d1117); color: #c9d1d9; box-shadow: 0 8px 20px rgba(0,0,0,.18); }}
    .top-menu a.primary {{ color: #0d1117; background: linear-gradient(90deg, #58a6ff, #7ee787); border-color: #58a6ff; font-weight: 700; }}
    .folder {{ margin-top: 20px; background: #161b22; padding: 20px; border-radius: 8px; border-left: 5px solid #6e7681; }}
    .folder h2 {{ color: #adbac7; font-size: 1.6em; margin: 0 0 15px; }}
    .links {{ margin-left: 20px; }}
    .search-filters {{ display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; max-width: 1200px; margin: 15px auto; align-items: center; }}
    .filter-input, .sort-select {{ background: #0d1117; border: 1px solid #30363d; color: #c9d1d9; padding: 10px; border-radius: 6px; outline: none; }}
    .filter-input {{ width: 100%; max-width: 300px; }}
    .clear-filters-button, .expand-button {{ background: #58a6ff; border: 0; color: #0d1117; padding: 9px 16px; border-radius: 6px; cursor: pointer; font-weight: 700; }}
    .report-card {{ background: #161b22; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 3px solid #58a6ff; }}
    .report-meta {{ color: #8b949e; font-size: .9em; margin-top: 5px; }}
    .pagination {{ display: flex; justify-content: center; align-items: center; margin-top: 20px; gap: 10px; }}
    .pagination button {{ background: #161b22; border: 1px solid #30363d; color: #c9d1d9; padding: 8px 12px; cursor: pointer; border-radius: 6px; }}
    .footer {{ background: #161b22; border-top: 1px solid #30363d; padding: 2rem 1rem; margin-top: 4rem; color: #8b949e; }}
    .footer-content {{ max-width: 1200px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 2rem; justify-content: space-between; align-items: center; }}
    .mobile-optimized {{ display: none; }}
    @media (max-width: 768px) {{ .desktop-only {{ display: none; }} .mobile-optimized {{ display: block; }} .links {{ margin-left: 0; }} .footer-content {{ text-align: center; justify-content: center; }} .title-highlight {{ width: 90%; }} }}
  </style>
</head>
<body>
  <h1 class="main-title"><span class="title-text">DAP - Relatórios Gerenciais</span><span class="title-highlight"></span></h1>
  <nav class="top-menu" aria-label="Navegação principal">
    <a class="primary" href="dashboard.html"><i class="fas fa-chart-line"></i> Dashboard dinâmico</a>
    <a href="index.html"><i class="fas fa-home"></i> Início</a>
    <a href="data/index.json"><i class="fas fa-database"></i> API JSON</a>
    <a href="https://github.com/guimig/EmailBackupHub"><i class="fab fa-github"></i> Repositório</a>
  </nav>

  <div class="search-filters">
    <input type="text" id="searchInput" placeholder="🔍 Pesquisar por nome..." class="filter-input" aria-label="Campo de pesquisa">
    <div class="mobile-optimized"><select class="filter-input" id="mobileSort"><option value="">Ordenar por...</option><option value="title">Nome (A-Z)</option><option value="-title">Nome (Z-A)</option><option value="-date">Data (recentes)</option><option value="date">Data (antigos)</option></select></div>
    <input type="date" id="dateFilter" class="filter-input desktop-only" aria-label="Filtrar por data">
    <select id="categoryFilter" class="filter-input desktop-only"><option value="">Todos Relatórios</option>{category_options}</select>
    <button id="clearFiltersButton" class="clear-filters-button"><i class="fas fa-times"></i> Limpar</button>
  </div>

  <div class="folder">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;"><h2>Últimas Atualizações</h2><select class="sort-select desktop-only" id="sortLatest"><option value="title">Ordenar por A-Z</option><option value="-date">Ordenar por Data</option></select></div>
    <div class="links" id="latestReports">{latest_cards}</div>
    <div id="noResultsLatest" style="display:none; color:#8b949e; margin-top:20px;">Nenhum resultado encontrado com os parâmetros fornecidos.</div>
  </div>

  <div class="folder">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;"><h2>Histórico Completo</h2><div><select class="sort-select desktop-only" id="sortHistory"><option value="-date">Ordenar por Data</option><option value="title">Ordenar por A-Z</option></select> <button id="toggleHistory" class="expand-button">▼ Histórico</button></div></div>
    <div class="links" id="allReports" style="display:none;">{history_cards}</div>
    <div id="noResultsAll" style="display:none; color:#8b949e; margin-top:20px;">Nenhum resultado encontrado com os parâmetros fornecidos.</div>
    <div class="pagination" id="paginationControls" style="display:none;"><button id="prevPage">Anterior</button><span id="pageInfo"></span><button id="nextPage">Próxima</button></div>
  </div>

  <div class="footer"><div class="footer-content"><div><h3>Repositório de Arquivos</h3><p><i class="fas fa-university"></i> Direção de Administração e Planejamento (DAP)<br>Essa <b>não</b> é uma página oficial do IFC - Campus Araquari</p></div><div><p><i class="fas fa-code"></i> Desenvolvido e mantido por Guilherme M.</p><a href="https://github.com/guimig/EmailBackupHub"><i class="fab fa-github"></i> GitHub</a></div></div></div>

  <script>
    const byId = id => document.getElementById(id);
    function applyFilters() {{
      const searchTerm = byId('searchInput').value.toLowerCase();
      const filterDate = byId('dateFilter') ? byId('dateFilter').value : '';
      const filterCategory = byId('categoryFilter') ? byId('categoryFilter').value : '';
      let hasLatest = false;
      let hasAll = false;
      for (const card of document.querySelectorAll('#latestReports .report-card')) {{
        const matches = card.textContent.toLowerCase().includes(searchTerm) && (!filterDate || card.dataset.date.includes(filterDate.split('-').reverse().join('/'))) && (!filterCategory || card.dataset.category === filterCategory);
        card.style.display = matches ? 'block' : 'none';
        hasLatest = hasLatest || matches;
      }}
      for (const card of document.querySelectorAll('#allReports .report-card')) {{
        const matches = card.textContent.toLowerCase().includes(searchTerm) && (!filterDate || card.dataset.date.includes(filterDate.split('-').reverse().join('/'))) && (!filterCategory || card.dataset.category === filterCategory);
        card.style.display = matches ? 'block' : 'none';
        hasAll = hasAll || matches;
      }}
      byId('noResultsLatest').style.display = hasLatest ? 'none' : 'block';
      byId('noResultsAll').style.display = hasAll ? 'none' : 'block';
    }}
    function clearFilters() {{ byId('searchInput').value = ''; byId('dateFilter').value = ''; byId('categoryFilter').value = ''; applyFilters(); }}
    let historyVisible = false;
    let currentPage = 1;
    const itemsPerPage = 10;
    function toggleHistory() {{ historyVisible = !historyVisible; byId('allReports').style.display = historyVisible ? 'block' : 'none'; byId('paginationControls').style.display = historyVisible ? 'flex' : 'none'; byId('toggleHistory').textContent = historyVisible ? '▲ Ocultar Histórico' : '▼ Exibir Histórico'; if (historyVisible) showPage(1); }}
    function showPage(page) {{ const cards = Array.from(document.querySelectorAll('#allReports .report-card')); const totalPages = Math.max(1, Math.ceil(cards.length / itemsPerPage)); currentPage = page; cards.forEach((card, index) => {{ card.style.display = index >= (page - 1) * itemsPerPage && index < page * itemsPerPage ? 'block' : 'none'; }}); byId('pageInfo').textContent = `Página ${{page}} de ${{totalPages}}`; byId('prevPage').disabled = page === 1; byId('nextPage').disabled = page === totalPages; }}
    function sortElements(container, key) {{ const cards = Array.from(container.querySelectorAll('.report-card')); cards.sort((a, b) => {{ const aDate = a.dataset.date.split('/').reverse().join(''); const bDate = b.dataset.date.split('/').reverse().join(''); if (key === '-date') return bDate.localeCompare(aDate); if (key === 'date') return aDate.localeCompare(bDate); const aTitle = a.querySelector('a').textContent.toLowerCase(); const bTitle = b.querySelector('a').textContent.toLowerCase(); return key === '-title' ? bTitle.localeCompare(aTitle) : aTitle.localeCompare(bTitle); }}); cards.forEach(card => container.appendChild(card)); }}
    byId('toggleHistory').addEventListener('click', toggleHistory);
    byId('prevPage').addEventListener('click', () => {{ if (currentPage > 1) showPage(currentPage - 1); }});
    byId('nextPage').addEventListener('click', () => {{ const totalPages = Math.ceil(document.querySelectorAll('#allReports .report-card').length / itemsPerPage); if (currentPage < totalPages) showPage(currentPage + 1); }});
    byId('searchInput').addEventListener('input', applyFilters);
    byId('dateFilter').addEventListener('change', applyFilters);
    byId('categoryFilter').addEventListener('change', applyFilters);
    byId('clearFiltersButton').addEventListener('click', clearFilters);
    byId('sortLatest').addEventListener('change', event => {{ sortElements(byId('latestReports'), event.target.value); applyFilters(); }});
    byId('sortHistory').addEventListener('change', event => {{ sortElements(byId('allReports'), event.target.value); showPage(1); }});
    byId('mobileSort').addEventListener('change', event => {{ const target = event.target.value.includes('date') ? byId('allReports') : byId('latestReports'); sortElements(target, event.target.value); if (target === byId('allReports')) showPage(1); applyFilters(); }});
  </script>
</body>
</html>
    """

    index_html_content = """
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=dashboard.html">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DAP - Dashboard</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Arial, Helvetica, sans-serif; background: #f8fbf7; color: #233128; }
    main { max-width: 680px; padding: 24px; text-align: center; }
    a { color: #2f7a3e; font-weight: 700; }
    .links { display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; margin-top: 16px; }
  </style>
</head>
<body>
  <main>
    <h1>DAP - Dashboard de Relatórios</h1>
    <p>Redirecionando para o dashboard principal.</p>
    <p class="links"><a href="dashboard.html">Abrir dashboard</a><a href="relatorios.html">Ver listagem de relatórios</a></p>
  </main>
</body>
</html>
    """

    with open(os.path.join(REPO_ROOT, "relatorios.html"), "w", encoding="utf-8") as output:
        output.write(reports_html_content)

    with open(os.path.join(REPO_ROOT, "index.html"), "w", encoding="utf-8") as output:
        output.write(index_html_content)

    print("Index.html e relatorios.html atualizados com sucesso!")
