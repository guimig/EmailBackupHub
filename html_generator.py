import os
import re
import datetime
from config import BACKUP_FOLDER, TIMEZONE

def create_latest_summary_html():
    for root, dirs, files in os.walk(BACKUP_FOLDER):
        if root == BACKUP_FOLDER:
            continue

        # Filtra apenas arquivos HTML e ordena por data de modificação
        html_files = sorted(
            (f for f in files if f.endswith('.html')),
            key=lambda f: os.path.getmtime(os.path.join(root, f)),
            reverse=True
        )
        if not html_files:
            continue

        latest_file = html_files[0]
        latest_path = os.path.join(root, latest_file)
        normalized_title = os.path.basename(root)
        output_path = os.path.join(os.getcwd(), f"{normalized_title}.html")

        with open(latest_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Extrai a data do nome do arquivo
        match = re.search(r'(\d{2})-(\d{2})-(\d{4})\.html', latest_file)
        if match:
            day, month, year = match.groups()
            try:
                # Valida a data antes de criar o objeto datetime
                last_report_date = datetime.datetime(
                    year=int(year),
                    month=int(month),
                    day=int(day),
                    tzinfo=TIMEZONE
                )
            except ValueError:
                # Se a data for inválida, usa a data de modificação do arquivo
                last_report_date = datetime.datetime.fromtimestamp(
                    os.path.getmtime(latest_path),
                    TIMEZONE
                )
        else:
            # Se não encontrar a data no nome do arquivo, usa a data de modificação
            last_report_date = datetime.datetime.fromtimestamp(
                os.path.getmtime(latest_path),
                TIMEZONE
            )

        # Adiciona o rodapé com a data do relatório e a última atualização
        footer = f"""
        <p>Relatório gerado em: {last_report_date.strftime('%d/%m/%Y')}</p>
        <p>Última atualização: {datetime.datetime.now(TIMEZONE).strftime('%d/%m/%Y %H:%M:%S')}</p>
        """
        
        # Escreve o conteúdo atualizado no arquivo de saída
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content + footer)

        print(f"Resumo atualizado criado: {output_path}")

def get_report_metadata(file_path):
    """Extrai metadados dos arquivos HTML"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            # Extrai o título do <h1>
            title_match = re.search(r'<h1>(.*?)</h1>', content)
            title = title_match.group(1) if title_match else os.path.splitext(os.path.basename(file_path))[0]
            
        # Extrai data do nome do arquivo
        filename = os.path.basename(file_path)
        date_match = re.search(r'(\d{4}-\d{2}-\d{2})', filename)
        if date_match:
            date = datetime.datetime.strptime(date_match.group(1), "%Y-%m-%d").strftime("%d/%m/%Y")
        else:
            date = datetime.datetime.fromtimestamp(os.path.getmtime(file_path), TIMEZONE).strftime("%d/%m/%Y")
            
        return {
            'title': title,
            'date': date,
            'filename': filename
        }
    except Exception as e:
        print(f"Erro ao ler metadados: {e}")
        return {
            'title': os.path.splitext(os.path.basename(file_path))[0],
            'date': datetime.datetime.now(TIMEZONE).strftime("%d/%m/%Y"),
            'filename': os.path.basename(file_path)
        }

def update_root_index():
    reports = []
    backup_reports = []

    # Coleta relatórios da raiz
    for file in os.listdir(REPO_ROOT):
        if file.endswith('.html') and file != 'index.html':
            file_path = os.path.join(REPO_ROOT, file)
            metadata = get_report_metadata(file_path)
            reports.append({
                **metadata,
                'path': file,
                'category': 'Últimas Atualizações'
            })

    # Coleta relatórios de backup
    for root, dirs, files in os.walk(BACKUP_FOLDER):
        for file in files:
            if file.endswith('.html'):
                file_path = os.path.join(root, file)
                metadata = get_report_metadata(file_path)
                category = os.path.basename(root) if root != BACKUP_FOLDER else "Geral"
                backup_reports.append({
                    **metadata,
                    'path': os.path.relpath(file_path, REPO_ROOT),
                    'category': category
                })

    # Geração do HTML
    html_content = f"""
    <html>
    <head>
        <title>CEOF - Relatórios Avançados</title>
        <!-- Mantido o CSS dark original -->
        <style>
            body {{
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                margin: 20px;
                background-color: #0d1117;
                color: #c9d1d9;
                line-height: 1.6;
            }}
            /* ... (mantido igual ao CSS anterior) ... */
            .report-card {{
                background-color: #161b22;
                padding: 15px;
                margin: 10px 0;
                border-radius: 6px;
                border-left: 3px solid #58a6ff;
            }}
            .report-meta {{
                color: #8b949e;
                font-size: 0.9em;
                margin-top: 5px;
            }}
            .search-filters {{
                margin: 15px 0;
                display: flex;
                gap: 10px;
            }}
            .filter-input {{
                background: #0d1117;
                border: 1px solid #30363d;
                color: #c9d1d9;
                padding: 8px;
                border-radius: 6px;
            }}
        </style>
    </head>
    <body>
        <h1>CEOF - Relatórios Gerenciais</h1>
        
        <!-- Barra de pesquisa avançada -->
        <div class="search-filters">
            <input type="text" 
                   id="searchInput" 
                   placeholder="Pesquisar por nome..." 
                   class="filter-input"
                   style="flex-grow: 1">
            
            <input type="date" 
                   id="dateFilter" 
                   class="filter-input"
                   placeholder="Filtrar por data">
            
            <select id="categoryFilter" class="filter-input">
                <option value="">Todas Categorias</option>
                <option value="Últimas Atualizações">Últimas Atualizações</option>
                {''.join(f'<option value="{category}">{category}</option>' 
                        for category in sorted(set(r['category'] for r in backup_reports)))}
            </select>
        </div>

        <!-- Seção de últimos relatórios -->
        <div class="folder">
            <h2>Últimas Atualizações</h2>
            <div class="links" id="latestReports">
                {"".join([
                    f'''<div class="report-card" data-date="{r['date']}" data-category="{r['category']}">
                            <a href="{r['path']}">{r['title']}</a>
                            <div class="report-meta">
                                {r['date']} | {r['category']}
                            </div>
                        </div>''' 
                    for r in reports
                ])}
            </div>
        </div>

        <!-- Seção de histórico -->
        <div class="folder">
            <h2>Histórico Completo</h2>
            <div class="links" id="allReports">
                {"".join([
                    f'''<div class="report-card" data-date="{r['date']}" data-category="{r['category']}">
                            <a href="{r['path']}">{r['title']}</a>
                            <div class="report-meta">
                                {r['date']} | {r['category']}
                            </div>
                        </div>''' 
                    for r in backup_reports
                ])}
            </div>
        </div>

        <script>
            function applyFilters() {{
                const searchTerm = document.getElementById('searchInput').value.toLowerCase();
                const filterDate = document.getElementById('dateFilter').value;
                const filterCategory = document.getElementById('categoryFilter').value;
                
                const cards = document.querySelectorAll('.report-card');
                
                cards.forEach(card => {{
                    const matchesText = card.textContent.toLowerCase().includes(searchTerm);
                    const matchesDate = !filterDate || card.dataset.date.includes(filterDate.split('-').reverse().join('/'));
                    const matchesCategory = !filterCategory || card.dataset.category === filterCategory;
                    
                    card.style.display = (matchesText && matchesDate && matchesCategory) ? 'block' : 'none';
                }});
            }}
            
            // Atualiza filtros em tempo real
            document.getElementById('searchInput').addEventListener('input', applyFilters);
            document.getElementById('dateFilter').addEventListener('change', applyFilters);
            document.getElementById('categoryFilter').addEventListener('change', applyFilters);
        </script>
    </body>
    </html>
    """

    with open(os.path.join(REPO_ROOT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html_content)

    print("Index.html atualizado com funcionalidades avançadas!")

