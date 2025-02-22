import os
import re
import datetime
from config import BACKUP_FOLDER, TIMEZONE, REPO_ROOT

def create_latest_summary_html():
    """Gera arquivos HTML na raiz com os últimos relatórios de cada pasta."""
    for root, dirs, files in os.walk(BACKUP_FOLDER):
        if root == BACKUP_FOLDER:
            continue

        # Filtra e ordena arquivos HTML
        html_files = sorted(
            [f for f in files if f.endswith('.html')],
            key=lambda f: os.path.getmtime(os.path.join(root, f)),
            reverse=True
        )
        
        if not html_files:
            continue

        # Processa o arquivo mais recente
        latest_file = html_files[0]
        latest_path = os.path.join(root, latest_file)
        normalized_title = os.path.basename(root)
        output_path = os.path.join(REPO_ROOT, f"{normalized_title}.html")

        # Extrai conteúdo e datas
        with open(latest_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Determina a data do relatório
        file_date = datetime.datetime.fromtimestamp(
            os.path.getmtime(latest_path),
            TIMEZONE
        )
        
        # Adiciona footer
        footer = f"""
        <div style="margin-top: 40px; color: #8b949e; border-top: 1px solid #30363d; padding-top: 20px;">
            <p>Relatório gerado em: {file_date.strftime('%d/%m/%Y')}</p>
            <p>Última atualização: {datetime.datetime.now(TIMEZONE).strftime('%d/%m/%Y %H:%M:%S')}</p>
        </div>
        """
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content + footer)

def get_report_metadata(file_path):
    """Extrai metadados dos arquivos HTML"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            # Extrai o título do relatorio
            title_match = re.search(r'<td colspan=1 style=\'font-family:tahoma;font-size:18.0pt\'>(.*?)</td>', content)
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

    # Coleta relatórios da raiz (últimas atualizações)
    for file in os.listdir(REPO_ROOT):
        if file.endswith('.html') and file != 'index.html':
            file_path = os.path.join(REPO_ROOT, file)
            metadata = get_report_metadata(file_path)
            reports.append({
                **metadata,
                'path': file,
                'category': 'Últimas Atualizações'
            })

    # Coleta relatórios de backup (histórico completo)
    for root, dirs, files in os.walk(BACKUP_FOLDER):
        for file in files:
            if file.endswith('.html'):
                file_path = os.path.join(root, file)
                metadata = get_report_metadata(file_path)
                backup_reports.append({
                    **metadata,
                    'path': os.path.relpath(file_path, REPO_ROOT),
                    'category': metadata['title']  # Categoria é o título do relatório
                })

    # Ordenação dos relatórios
    # Últimas atualizações: ordena por título (ordem alfabética)
    reports.sort(key=lambda x: x['title'], reverse=False)

    # Histórico completo: ordena por título e data (da mais recente para a mais antiga)
    backup_reports.sort(key=lambda x: (x['title'], x['date']), reverse=True)

    # Geração do HTML
    html_content = f"""
    <html>
    <head>
        <title>CEOF - Relatórios Gerenciais</title>
        <style>
            body {{
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                margin: 20px;
                background-color: #0d1117;
                color: #c9d1d9;
                line-height: 1.6;
            }}
            h1 {{
                color: #f0f6fc;
                text-align: center;
                font-size: 2.2em;
                margin-bottom: 30px;
            }}
            .folder {{
                margin-top: 20px;
                background-color: #161b22;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                border-left: 5px solid #6e7681;
            }}
            .folder h2 {{
                color: #adbac7;
                font-size: 1.6em;
                margin-bottom: 15px;
            }}
            .links {{
                margin-left: 20px;
            }}
            a {{
                text-decoration: none;
                color: #58a6ff;
                font-size: 1em;
                display: block;
                margin-bottom: 10px;
            }}
            a:hover {{
                text-decoration: underline;
                color: #1f6feb;
                padding-left: 5px;
                transition: all 0.3s ease-in-out;
            }}
            .footer {{
                margin-top: 40px;
                text-align: center;
                color: #8b949e;
            }}
            #searchBox {{
                padding: 12px;
                width: 85%;
                max-width: 600px;
                border-radius: 8px;
                border: 1px solid #484f58;
                background-color: #0d1117;
                color: #c9d1d9;
                box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.7);
                outline: none;
                transition: all 0.3s ease-in-out;
            }}
            #searchBox::placeholder {{
                color: #6e7681;
            }}
            #searchBox:focus {{
                border-color: #58a6ff;
                box-shadow: 0 0 8px rgba(85, 145, 255, 0.6);
            }}
            @media (max-width: 600px) {{
                body {{ font-size: 14px; }}
                h1 {{ font-size: 1.8em; }}
                .folder h2 {{ font-size: 1.4em; }}
                a {{ font-size: 1.1em; }}
                #searchBox {{ width: 90%; }}
            }}
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
                <option value="">Todos os Relatórios</option>
                {''.join(f'<option value="{r["title"]}">{r["title"]}</option>' 
                        for r in reports)}
            </select>
        </div>

        <!-- Seção de últimos relatórios -->
        <div class="folder">
            <h2>Últimas Atualizações</h2>
            <div class="links" id="latestReports">
                {"".join([
                    f'''<div class="report-card" data-date="{r['date']}" data-category="{r['title']}">
                            <a href="{r['path']}">{r['title']}</a>
                            <div class="report-meta">
                                {r['date']} | Última Atualização
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
                    f'''<div class="report-card" data-date="{r['date']}" data-category="{r['title']}">
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