import os
import re
import datetime
from config import BACKUP_FOLDER, TIMEZONE, REPO_ROOT

def update_root_index():
    # Coletar todos os relatórios
    reports = []
    for root, dirs, files in os.walk(BACKUP_FOLDER):
        for file in files:
            if file.endswith('.html'):
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, REPO_ROOT)
                
                # Extrair metadados
                report_name = os.path.splitext(file)[0]
                category = os.path.basename(root) if root != BACKUP_FOLDER else "Geral"
                last_modified = datetime.datetime.fromtimestamp(
                    os.path.getmtime(file_path), TIMEZONE
                ).strftime('%d/%m/%Y %H:%M')
                
                reports.append({
                    'path': relative_path,
                    'name': report_name,
                    'category': category,
                    'date': last_modified
                })

    # Ordenar por data (mais recente primeiro)
    reports.sort(key=lambda x: x['date'], reverse=True)

    # Gerar HTML
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>CEOF - Central de Relatórios</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{
                font-family: Arial, sans-serif;
                margin: 20px;
                background: #f5f5f5;
            }}
            .header {{
                text-align: center;
                padding: 20px;
                background: #2c3e50;
                color: white;
                border-radius: 10px;
            }}
            .search-box {{
                margin: 20px 0;
                text-align: center;
            }}
            #searchInput {{
                width: 80%;
                max-width: 600px;
                padding: 12px;
                border: 2px solid #3498db;
                border-radius: 25px;
                font-size: 16px;
            }}
            .report-card {{
                background: white;
                border-radius: 10px;
                padding: 15px;
                margin: 10px 0;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                transition: transform 0.2s;
            }}
            .report-card:hover {{
                transform: translateY(-2px);
            }}
            .report-date {{
                color: #7f8c8d;
                font-size: 0.9em;
            }}
            .report-category {{
                color: #e74c3c;
                font-weight: bold;
            }}
            @media (max-width: 768px) {{
                #searchInput {{ width: 95%; }}
            }}
        </style>
    </head>
    <body>
        <div class="header">
            <h1>CEOF - Central de Relatórios</h1>
            <p>Última atualização: {datetime.datetime.now(TIMEZONE).strftime('%d/%m/%Y %H:%M')}</p>
        </div>
        
        <div class="search-box">
            <input type="text" 
                   id="searchInput" 
                   placeholder="Pesquisar relatórios por nome, categoria ou data..."
                   oninput="filterReports()">
        </div>

        <div id="reportsContainer">
    """

    # Adicionar cards de relatório
    for report in reports:
        html_content += f"""
            <div class="report-card">
                <div class="report-category">{report['category']}</div>
                <h2><a href="{report['path']}">{report['name']}</a></h2>
                <div class="report-date">Atualizado em: {report['date']}</div>
            </div>
        """

    # Finalizar HTML
    html_content += """
        </div>

        <script>
            function filterReports() {{
                const searchTerm = document.getElementById('searchInput').value.toLowerCase();
                const cards = document.querySelectorAll('.report-card');
                
                cards.forEach(card => {{
                    const text = card.textContent.toLowerCase();
                    card.style.display = text.includes(searchTerm) ? 'block' : 'none';
                }});
            }}
        </script>
    </body>
    </html>
    """

    # Escrever no arquivo
    with open(os.path.join(REPO_ROOT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html_content)

    print("Index.html atualizado com sucesso!")