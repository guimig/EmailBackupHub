import os
import re
import datetime
from config import BACKUP_FOLDER, TIMEZONE, REPO_ROOT

def create_latest_summary_html():
    """Gera arquivos HTML na raiz com os últimos relatórios de cada pasta."""
    for root, dirs, files in os.walk(BACKUP_FOLDER):
        if root == BACKUP_FOLDER:
            continue

        # Lista para armazenar arquivos com suas datas parseadas
        html_files = []
        for f in files:
            if not f.endswith('.html'):
                continue
            
            # Extrai data do nome do arquivo
            date_match = re.search(r'(\d{2}-\d{2}-\d{4})', f)
            if date_match:
                file_date_str = date_match.group(1)
                file_date = datetime.datetime.strptime(file_date_str, "%d-%m-%Y")
            else:
                # Fallback para data de modificação
                file_path = os.path.join(root, f)
                mtime = os.path.getmtime(file_path)
                file_date = datetime.datetime.fromtimestamp(mtime)
            
            html_files.append((f, file_date))
        
        if not html_files:
            continue
        
        # Ordena pelos mais recentes primeiro (baseado na data extraída)
        html_files_sorted = sorted(html_files, key=lambda x: x[1], reverse=True)
        latest_file, latest_date = html_files_sorted[0]
        latest_path = os.path.join(root, latest_file)
        normalized_title = os.path.basename(root)

        output_path = os.path.join(REPO_ROOT, f"{normalized_title}.html")

        with open(latest_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        footer = f"""
        <div style="margin-top: 40px; color: #8b949e; border-top: 1px solid #30363d; padding-top: 20px;">
            <p>Relatório gerado em: {latest_date.strftime('%d/%m/%Y')}</p>
            <p>Última busca por novos relatórios: {datetime.datetime.now(TIMEZONE).strftime('%d/%m/%Y %H:%M:%S')}</p>
        </div>
        """
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content + footer)

def get_report_metadata(file_path):
    """Extrai metadados dos arquivos HTML"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
            # Extrai o título do relatório
            title_match = re.search(r'<td colspan=1 style=\'font-family:tahoma;font-size:18.0pt\'>(.*?)</td>', content)
            title = title_match.group(1) if title_match else os.path.splitext(os.path.basename(file_path))[0]
            
            # Extrai a data GERADA do conteúdo do relatório (prioritário)
            date_match = re.search(r'Relatório gerado em: (\d{2}/\d{2}/\d{4})', content)
            if date_match:
                date_str = date_match.group(1)
                date = datetime.datetime.strptime(date_str, "%d/%m/%Y")
            else:
                # Fallback 1: Data do nome do arquivo
                filename = os.path.basename(file_path)
                filename_date_match = re.search(r'(\d{2}-\d{2}-\d{4})', filename)
                if filename_date_match:
                    date_str = filename_date_match.group(1)
                    date = datetime.datetime.strptime(date_str, "%d-%m-%Y")
                else:
                    # Fallback 2: Data de modificação do arquivo
                    date = datetime.datetime.fromtimestamp(os.path.getmtime(file_path), TIMEZONE).replace(tzinfo=None)
            
        return {
            'title': title,
            'date': date.strftime("%d/%m/%Y"),  # Formato padrão BR
            'date_obj': date,
            'filename': os.path.basename(file_path)
        }
        
    except Exception as e:
        print(f"Erro ao ler metadados: {e}")
        return {
            'title': os.path.splitext(os.path.basename(file_path))[0],
            'date': datetime.datetime.now().strftime("%d/%m/%Y"),
            'date_obj': datetime.datetime.now().replace(tzinfo=None),
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

    # Coleta histórico completo
    for root, dirs, files in os.walk(BACKUP_FOLDER):
        for file in files:
            if file.endswith('.html'):
                file_path = os.path.join(root, file)
                metadata = get_report_metadata(file_path)
                
                backup_reports.append({
                    **metadata,
                    'path': os.path.relpath(file_path, REPO_ROOT),
                    'category': metadata['title']
                })

    # Ordenação
    reports.sort(key=lambda x: (x['title'], x['date_obj']), reverse=False)
    backup_reports.sort(key=lambda x: (x['title'], x['date_obj']), reverse=True)

    # Agrupamento
    grouped_latest = {}
    for report in reports:
        key = report['title']
        grouped_latest.setdefault(key, []).append(report)

    grouped_backup = {}
    for report in backup_reports:
        key = report['title']
        grouped_backup.setdefault(key, []).append(report)

    html_content = f"""
    <html>
    <head>
        <title>DAP - Relatórios Gerenciais</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
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
            .main-title {{
                text-align: center;
                font-size: 2.5rem;
                color: #f0f6fc;
                margin-bottom: 30px;
                position: relative;
                width: 95%; /* Ocupa toda a largura */
                padding: 0 20px;
            }}
            .title-text {{
                position: relative;
                z-index: 2;
            }}
            .title-highlight {{
                position: absolute;
                bottom: -2px; /* Ajuste para posicionar a barra abaixo do texto */
                left: 50%; /* Centraliza horizontalmente */
                transform: translateX(-50%); /* Ajuste fino para centralização */
                width: 60%; /* Largura da barra */
                height: 8px; /* Altura da barra */
                background: linear-gradient(90deg, #58a6ff, #1959bd);
                border-radius: 5px;
                z-index: 1;
                opacity: 0.7; /* Mais visível */
                transition: all 0.3s ease;
            }}
            .main-title:hover .title-highlight {{
                height: 12px; /* Aumenta a altura no hover */
                opacity: 1; /* Torna totalmente visível */
                width: 62%; /* Expande a largura no hover */
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
                background: #161b22;
                border-top: 1px solid #30363d;
                padding: 2rem 1rem;
                margin-top: 4rem;
            }}
            .footer-content {{
                max-width: 1200px;
                margin: 0 auto;
                display: flex;
                flex-wrap: wrap;
                gap: 2rem;
                justify-content: space-between;
                align-items: center;
            }}
            .footer-logo {{
                height: 50px;
                margin-right: 1.5rem;
            }}
            .institutional-info {{
                display: flex;
                align-items: center;
            }}
            .institutional-title {{
                color: #c9d1d9;
                margin: 0 0 0.5rem 0;
                font-size: 1.2rem;
            }}
            .campus-info {{
                color: #8b949e;
                margin: 0;
                line-height: 1.6;
            }}
            .developer-info {{
                text-align: right;
            }}
            .developed-by {{
                color: #8b949e;
                margin: 0 0 1rem 0;
            }}
            .developer-name {{
                color: #58a6ff;
                transition: color 0.3s ease;
            }}
            .developer-name:hover {{
                color: #1f6feb;
                text-decoration: underline;
            }}
            .social-links {{
                display: flex;
                gap: 1rem;
                justify-content: flex-end;
            }}
            .social-icon {{
                color: #8b949e;
                font-size: 1.2rem;
                transition: color 0.3s ease;
            }}
            .social-icon:hover {{
                color: #58a6ff;
            }}
            @media (max-width: 768px) {{
                .footer-content {{
                    flex-direction: column;
                    text-align: center;
                }}
                
                .developer-info {{
                    text-align: center;
                }}
                
                .social-links {{
                    justify-content: center;
                }}
                
                .institutional-info {{
                    flex-direction: column;
                    text-align: center;
                }}
                
                .footer-logo {{
                    margin: 0 0 1rem 0;
                }}
            }}
            .search-filters {{
                display: flex;
                justify-content: center;
                gap: 10px;
                flex-wrap: wrap;
                max-width: 1200px;
                margin: 15px auto;
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
            /* Novos estilos para mobile */
            @media (max-width: 768px) {{
                .search-filters {{
                    flex-direction: column;
                    align-items: center;
                }}
                
                .filter-input, .sort-select {{
                    width: 100%;
                    margin: 5px 0;
                }}
                
                .report-card {{
                    padding: 12px;
                    margin: 8px 0;
                }}
                
                .pagination button {{
                    padding: 10px 15px;
                    margin: 3px;
                }}
                
                .folder {{
                    padding: 15px;
                }}
                
                h1 {{
                    font-size: 1.8rem;
                    margin-bottom: 20px;
                }}
                .main-title {{
                    font-size: 2rem;
                }}

                .title-highlight {{
                    width: 90%; /* Ajuste para telas menores */
                }}
            }}
            /* Novos estilos para ordenação */
            .sort-controls {{
                margin: 15px 0;
                display: flex;
                gap: 10px;
                align-items: center;
            }}
            .sort-select {{
                background: #0d1117;
                border: 1px solid #30363d;
                color: #c9d1d9;
                padding: 8px;
                border-radius: 6px;
                cursor: pointer;
            }}
            .mobile-optimized {{
                display: none;
            }}
            @media (max-width: 768px) {{
                .desktop-only {{
                    display: none;
                }}
                .mobile-optimized {{
                    display: block;
                }}
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
                display: flex;
                justify-content: center;
                gap: 10px;
                flex-wrap: wrap;
                max-width: 1200px;
                margin: 15px auto;
                align-items: center;
            }}
            .filter-input {{
                background: #0d1117;
                border: 1px solid #30363d;
                color: #c9d1d9;
                padding: 10px;
                border-radius: 6px;
                outline: none;
                transition: all 0.3s ease;
                width: 100%;
                max-width: 300px;
            }}
            .filter-input:focus {{
                border-color: #58a6ff;
                box-shadow: 0 0 8px rgba(88, 166, 255, 0.6);
            }}
            .clear-filters-button {{
                background: #58a6ff;
                border: none;
                color: #0d1117;
                padding: 8px 16px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 0.75em;
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                gap: 8px;
            }}
            .clear-filters-button:hover {{
                background: #4378b5;
            }}
            .clear-filters-button i {{
                font-size: 16px;
            }}
            .expand-button {{
                border: none;
                padding: 8px 16px;
                font-size: 0.75em;
                background: #58a6ff;
                color: #0d1117;
                border-radius: 6px;
                transition: all 0.3s;
            }}
            .expand-button:hover {{
                background: #4378b5;
            }}
            .pagination {{
            display: flex;
            justify-content: center;
            align-items: center; /* Centraliza verticalmente */
            margin-top: 20px;
            gap: 10px; /* Espaçamento entre os elementos */
            }}
            .pagination button {{
                background: #161b22;
                border: 1px solid #30363d;
                color: #c9d1d9;
                padding: 8px 12px;
                cursor: pointer;
                border-radius: 6px;
                transition: background 0.3s ease;
            }}
            .pagination button:hover {{
                background: #58a6ff;
                color: #0d1117;
            }}
            #pageInfo {{
                color: #8b949e;
                font-size: 0.9rem;
                margin: 0 10px; /* Espaçamento entre o texto e os botões */
            }}
        </style>
    </head>
    <body>
        <div style="text-align: center;">
            <h1 class="main-title">
                <span class="title-text">DAP - Relatórios Gerenciais</span>
                <span class="title-highlight"></span>
            </h1>
        </div>
        
        <!-- Barra de pesquisa otimizada para mobile -->
        <div class="search-filters">
            <input type="text" 
                   id="searchInput" 
                   placeholder="🔍 Pesquisar por nome...          "
                   class="filter-input"
                   aria-label="Campo de pesquisa">

            <div class="mobile-optimized">
                <select class="filter-input" id="mobileSort">
                    <option value="">Ordenar por...</option>
                    <option value="title">Nome (A-Z)</option>
                    <option value="-title">Nome (Z-A)</option>
                    <option value="-date">Data (recentes)</option>
                    <option value="date">Data (antigos)</option>
                </select>
            </div>

            <input type="date" 
                   id="dateFilter" 
                   class="filter-input desktop-only"
                   aria-label="Filtrar por data">

            <select id="categoryFilter" class="filter-input desktop-only">
                <option value="">Todos Relatórios</option>
                {''.join(f'<option value="{title}">{title}</option>' 
                        for title in sorted(grouped_latest.keys()))}
            </select>

            <button id="clearFiltersButton" class="clear-filters-button">
                <i class="fas fa-times"></i> Limpar
            </button>
        </div>

<!-- Seção de últimos relatórios -->
        <div class="folder">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2>Últimas Atualizações</h2>
                <select class="sort-select desktop-only" id="sortLatest">
                    <option value="title">Ordenar por A-Z</option>
                    <option value="-date">Ordenar por Data</option>
                </select>
            </div>
            <div class="links" id="latestReports">
                {"".join([
                    f'''<div class="report-card" data-date="{r['date']}" data-category="{r['title']}">
                            <a href="{r['path']}">{r['title']}</a>
                            <div class="report-meta">
                                Data do relatório: {r['date']}
                            </div>
                        </div>''' 
                    for title in sorted(grouped_latest.keys())
                    for r in grouped_latest[title]
                ])}
            </div>
            <div id="noResultsLatest" style="display: none; color: #8b949e; margin-top: 20px;">
                Nenhum resultado encontrado com os parâmetros fornecidos.
            </div>
        </div>

        <!-- Seção de histórico -->
        <div class="folder">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2>Histórico Completo</h2>
                <div>
                    <select class="sort-select desktop-only" id="sortHistory">
                        <option value="-date">Ordenar por Data</option>
                        <option value="title">Ordenar por A-Z</option>
                    </select>
                    <button id="toggleHistory" class="expand-button">▼ Histórico</button>
                </div>
            </div>
            <div class="links" id="allReports" style="display: none;">
                {"".join([
                    f'''<div class="report-card" data-date="{r['date']}" data-category="{r['title']}">
                            <a href="{r['path']}">{r['title']}</a>
                            <div class="report-meta">
                                Data do relatório: {r['date']}
                            </div>
                        </div>''' 
                    for title in sorted(grouped_backup.keys())
                    for r in grouped_backup[title]
                ])}
            </div>
            <div id="noResultsAll" style="display: none; color: #8b949e; margin-top: 20px;">
                Nenhum resultado encontrado com os parâmetros fornecidos.
            </div>
            <div class="pagination" id="paginationControls" style="display: none;">
                <button id="prevPage">Anterior</button>
                <span id="pageInfo"></span>
                <button id="nextPage">Próxima</button>
            </div>
        </div>

        <div class="footer">
            <div class="footer-content">
                <div class="institutional-info">
                    <img src="caminho/para/logo-ifc.png" alt="" class="footer-logo">
                    <div class="text-block">
                        <h3 class="institutional-title">Repositório de Arquivos</h3>
                        <p class="campus-info">
                            <i class="fas fa-university"></i>
                            Direção de Administração e Planejamento (DAP)<br>
                            Essa <b>não</b> é uma página oficial do IFC - Campus Araquari
                        </p>
                    </div>
                </div>
                
                <div class="developer-info">
                    <p class="developed-by">
                        <i class="fas fa-code"></i>
                        Desenvolvido e mantido por 
                        <span class="developer-name">Guilherme M.</span>
                    </p>
                    <div class="social-links">
                        <a href="https://github.com/guimig/EmailBackupHub" class="social-icon"><i class="fab fa-github"></i></a>
                        <a href="#" class="social-icon"><i class="fas fa-envelope"></i></a>
                    </div>
                </div>
            </div>
        </div>

        <script>
            function applyFilters() {{
                const searchTerm = document.getElementById('searchInput').value.toLowerCase();
                const filterDate = document.getElementById('dateFilter').value;
                const filterCategory = document.getElementById('categoryFilter').value;
                
                const cardsLatest = document.querySelectorAll('#latestReports .report-card');
                const cardsAll = document.querySelectorAll('#allReports .report-card');
                const noResultsLatest = document.getElementById('noResultsLatest');
                const noResultsAll = document.getElementById('noResultsAll');

                let hasResultsLatest = false;
                let hasResultsAll = false;

                // Filtra os últimos relatórios
                cardsLatest.forEach(card => {{
                    const matchesText = card.textContent.toLowerCase().includes(searchTerm);
                    const matchesDate = !filterDate || card.dataset.date.includes(filterDate.split('-').reverse().join('/'));
                    const matchesCategory = !filterCategory || card.dataset.category === filterCategory;
                    
                    if (matchesText && matchesDate && matchesCategory) {{
                        card.style.display = 'block';
                        hasResultsLatest = true;
                    }} else {{
                        card.style.display = 'none';
                    }}
                }});

                // Filtra o histórico completo
                cardsAll.forEach(card => {{
                    const matchesText = card.textContent.toLowerCase().includes(searchTerm);
                    const matchesDate = !filterDate || card.dataset.date.includes(filterDate.split('-').reverse().join('/'));
                    const matchesCategory = !filterCategory || card.dataset.category === filterCategory;
                    
                    if (matchesText && matchesDate && matchesCategory) {{
                        card.style.display = 'block';
                        hasResultsAll = true;
                    }} else {{
                        card.style.display = 'none';
                    }}
                }});

                // Exibe ou oculta a mensagem de "Nenhum resultado"
                noResultsLatest.style.display = hasResultsLatest ? 'none' : 'block';
                noResultsAll.style.display = hasResultsAll ? 'none' : 'block';
            }}

            function clearFilters() {{
                // Limpa todos os filtros
                document.getElementById('searchInput').value = '';
                document.getElementById('dateFilter').value = '';
                document.getElementById('categoryFilter').value = '';
                
                // Reaplica os filtros (para exibir todos os resultados)
                applyFilters();
            }}

            // Controle do histórico
            let historyVisible = false;
            const toggleHistory = () => {{
                const historySection = document.getElementById('allReports');
                const paginationControls = document.getElementById('paginationControls');
                const toggleButton = document.getElementById('toggleHistory');
                
                historyVisible = !historyVisible;
                historySection.style.display = historyVisible ? 'block' : 'none';
                paginationControls.style.display = historyVisible ? 'flex' : 'none';
                toggleButton.textContent = historyVisible ? '▲ Ocultar Histórico' : '▼ Exibir Histórico';
                if(historyVisible) showPage(1);
            }}

            // Paginação
            let currentPage = 1;
            let itemsPerPage = 10;

            const showPage = (page) => {{
                const cards = Array.from(document.querySelectorAll('#allReports .report-card'));
                const totalPages = Math.ceil(cards.length / itemsPerPage);
                
                cards.forEach((card, index) => {{
                    card.style.display = (index >= (page - 1) * itemsPerPage && index < page * itemsPerPage) 
                        ? 'block' 
                        : 'none';
                }});

                document.getElementById('pageInfo').textContent = `Página ${{page}} de ${{totalPages}}`;
                document.getElementById('prevPage').disabled = page === 1;
                document.getElementById('nextPage').disabled = page === totalPages;
            }}

            // Event Listeners
            document.getElementById('toggleHistory').addEventListener('click', toggleHistory);
            document.getElementById('prevPage').addEventListener('click', () => {{
                if(currentPage > 1) showPage(--currentPage);
            }});
            document.getElementById('nextPage').addEventListener('click', () => {{
                const totalPages = Math.ceil(document.querySelectorAll('#allReports .report-card').length / itemsPerPage);
                if(currentPage < totalPages) showPage(++currentPage);
            }});

            // Atualiza filtros em tempo real
            document.getElementById('searchInput').addEventListener('input', applyFilters);
            document.getElementById('dateFilter').addEventListener('change', applyFilters);
            document.getElementById('categoryFilter').addEventListener('change', applyFilters);
            
            // Adiciona o evento de limpar filtros
            document.getElementById('clearFiltersButton').addEventListener('click', clearFilters);

            // Novo sistema de ordenação
            const sortElements = (container, key) => {{
                const cards = Array.from(container.querySelectorAll('.report-card'));
                
                cards.sort((a, b) => {{
                const aDate = a.dataset.date.split('/').reverse().join('');
                const bDate = b.dataset.date.split('/').reverse().join('');
                
                if(key === '-date') return bDate.localeCompare(aDate);
                if(key === 'date') return aDate.localeCompare(bDate);
                
                const aTitle = a.querySelector('a').textContent.toLowerCase();
                const bTitle = b.querySelector('a').textContent.toLowerCase();
                
                return key === '-title' 
                    ? bTitle.localeCompare(aTitle) 
                    : aTitle.localeCompare(bTitle);
            }});

                cards.forEach(card => container.appendChild(card));
            }};

            // Controles de ordenação
            document.getElementById('sortLatest').addEventListener('change', (e) => {{
                sortElements(document.getElementById('latestReports'), e.target.value);
                applyFilters();
            }});

            document.getElementById('sortHistory').addEventListener('change', (e) => {{
                sortElements(document.getElementById('allReports'), e.target.value);
                currentPage = 1;
                showPage(currentPage);
            }});

            document.getElementById('mobileSort').addEventListener('change', (e) => {{
                const value = e.target.value;
                const targetSection = value.includes('date') ? 
                    document.getElementById('allReports') : 
                    document.getElementById('latestReports');
                
                sortElements(targetSection, value);
                if(targetSection === document.getElementById('allReports')) {{
                    currentPage = 1;
                    showPage(currentPage);
                }}
                applyFilters();
            }});

            // Filtro otimizado com debounce
            let searchTimeout;
            document.getElementById('searchInput').addEventListener('input', () => {{
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(applyFilters, 300);
            }});

            // Melhoria na exibição mobile
            function handleMobileLayout() {{
                const isMobile = window.innerWidth < 768;
                document.querySelectorAll('.desktop-only').forEach(el => 
                    el.style.display = isMobile ? 'none' : '');
                document.querySelectorAll('.mobile-optimized').forEach(el => 
                    el.style.display = isMobile ? 'block' : 'none');
                
                if(isMobile) {{
                    document.getElementById('allReports').style.display = 'none';
                    document.getElementById('paginationControls').style.display = 'none';
                }}
            }}

            // Atualizar layout ao redimensionar
            window.addEventListener('resize', handleMobileLayout);
            handleMobileLayout();

        </script>
    </body>
    </html>
    """

    with open(os.path.join(REPO_ROOT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html_content)

    print("Index.html atualizado com sucesso!")