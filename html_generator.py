import os
import re
import datetime
from config import BACKUP_FOLDER, TIMEZONE

def create_latest_summary_html():
    for root, dirs, files in os.walk(BACKUP_FOLDER):
        if root == BACKUP_FOLDER:
            continue

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

        match = re.search(r'(\d{2})-(\d{2})-(\d{4})\.html', latest_file)
        last_report_date = (
            datetime.datetime(*map(int, match.groups()), tzinfo=TIMEZONE)
            if match else
            datetime.datetime.fromtimestamp(os.path.getmtime(latest_path), TIMEZONE)
        )

        footer = f"""
        <p>Relatório gerado em: {last_report_date.strftime('%d/%m/%Y')}</p>
        <p>Última atualização: {datetime.datetime.now(TIMEZONE).strftime('%d/%m/%Y %H:%M:%S')}</p>
        """
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content + footer)

# Função para atualizar o arquivo index.html
def update_root_index():
    # Caminho do repositório onde os arquivos .html estão armazenados
    repo_root = os.getcwd()  # Usando o diretório atual (root do repositório)
    
    # Listas para armazenar os links dos arquivos .html encontrados
    root_links = []
    backup_links = {}

    # Percorrer todas as subpastas e arquivos no repositório
    for root, dirs, files in os.walk(repo_root):
        for file in files:
            if file.endswith('.html') and file != 'index.html':  # Verifica se o arquivo é .html
                # Gerar o caminho relativo do arquivo
                relative_path = os.path.relpath(os.path.join(root, file), repo_root)
                file_name = os.path.basename(file)  # Nome do arquivo

                # Criar o link com nome amigável
                link = f"<a href='{relative_path.replace(os.sep, '/')}' title='{relative_path}'>{file_name}</a><br>"

                # Verificar se o arquivo está na raiz ou em subpastas
                if root == repo_root:
                    root_links.append((relative_path, link))  # Adiciona para ordenação
                else:
                    # Organiza arquivos de backup por subpastas
                    subfolder = os.path.relpath(root, repo_root)
                    if subfolder not in backup_links:
                        backup_links[subfolder] = []
                    backup_links[subfolder].append((relative_path, link))  # Adiciona para ordenação

    # Ordenar os links por endereço do arquivo (relative_path)
    root_links.sort(key=lambda x: x[0].lower(), reverse=True)  # Ordena os links da raiz (de forma case-insensitive)
    for subfolder in backup_links:
        backup_links[subfolder].sort(key=lambda x: x[0].lower(), reverse=True)  # Ordena os links dos backups

    # Caminho para o arquivo index.html
    index_path = os.path.join(repo_root, "index.html")
    
    # Conteúdo HTML com estrutura e CSS
    html_content = """
        <html>
        <head>
            <title>CEOF</title>
            <style>
                body {
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    margin: 20px;
                    background-color: #0d1117;  /* Fundo escuro */
                    color: #c9d1d9;  /* Texto claro */
                    line-height: 1.6;
                }

                h1 {
                    color: #f0f6fc;  /* Branco quebrado */
                    text-align: center;
                    font-size: 2.2em;  /* Aumentado para destaque */
                    margin-bottom: 30px;  /* Mais espaçamento */
                }

                .folder {
                    margin-top: 20px;
                    background-color: #161b22;  /* Fundo levemente mais claro */
                    padding: 20px;  /* Aumentado o padding */
                    border-radius: 8px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);  /* Sombra mais suave */
                    border-left: 5px solid #6e7681;  /* Cinza neutro para destaque */
                }

                .folder h2 {
                    color: #adbac7;  /* Cinza claro */
                    font-size: 1.6em;  /* Aumentado para mais destaque */
                    margin-bottom: 15px;
                }

                .links {
                    margin-left: 20px;
                }

                a {
                    text-decoration: none;
                    color: #58a6ff;  /* Azul suave */
                    font-size: 1em;  /* Tamanho de fonte um pouco maior */
                    display: block;  /* Para aumentar o espaço entre os links */
                    margin-bottom: 10px;  /* Adiciona espaçamento entre os links */
                }

                a:hover {
                    text-decoration: underline;
                    color: #1f6feb;  /* Azul mais vibrante ao passar o mouse */
                    padding-left: 5px;  /* Adiciona um pequeno efeito de deslocamento */
                    transition: all 0.3s ease-in-out;  /* Suaviza a transição */
                }

                .footer {
                    margin-top: 40px;
                    text-align: center;
                    color: #8b949e;  /* Cinza claro para rodapé */
                }

                #searchBox {
                    padding: 12px;
                    width: 85%;  /* Ajustado para aproveitar mais o espaço */
                    max-width: 600px;
                    border-radius: 8px;  /* Borda mais arredondada */
                    border: 1px solid #484f58;  /* Cinza escuro */
                    background-color: #0d1117;  /* Fundo escuro */
                    color: #c9d1d9;  /* Texto claro */
                    box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.7);  /* Efeito interno mais forte */
                    outline: none;
                    transition: all 0.3s ease-in-out;  /* Transição mais suave */
                }

                #searchBox {
                    padding: 12px;
                    width: 85%;  /* Ajuste a largura conforme necessário */
                    max-width: 600px;
                    border-radius: 8px;
                    border: 1px solid #484f58;  /* Cinza escuro */
                    background-color: #0d1117;  /* Fundo escuro */
                    color: #c9d1d9;  /* Texto claro */
                    box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.7);  /* Efeito interno mais forte */
                    outline: none;
                    transition: all 0.3s ease-in-out;
                }

                #searchBox::placeholder {
                    color: #6e7681;  /* Cinza claro para o placeholder */
                }

                #searchBox:focus {
                    border-color: #58a6ff;  /* Azul ao focar */
                    box-shadow: 0 0 8px rgba(85, 145, 255, 0.6);  /* Brilho azul suave */
                }


                @media (max-width: 600px) {
                    body {
                        font-size: 14px;  /* Ajusta o tamanho da fonte para telas menores */
                    }
                    h1 {
                        font-size: 1.8em;  /* Reduz o título para dispositivos pequenos */
                    }
                    .folder h2 {
                        font-size: 1.4em;  /* Ajusta o tamanho do título da pasta */
                    }
                    a {
                        font-size: 1.1em;  /* Ajusta o tamanho dos links */
                    }
                    #searchBox {
                        width: 90%;  /* Ajusta a largura do campo de busca */
                    }
                }
            </style>
        </head>
        <body>
            <h1>CEOF</h1>
            <h2 style="text-align: center;">Lista de Relatórios Gerados pelo Tesouro Gerencial (.html)</h2>

                <!-- Barra de pesquisa -->
                <div style="text-align: center; margin-bottom: 20px;">
                    <input type="text" 
                        id="searchBox" 
                        placeholder="Pesquise por arquivos..." 
                        class="dark-theme">
                </div>

                <div class="folder">
                    <h2>Arquivos da Raiz - Últimas atualizações</h2>
                    <div class="links" id="rootLinks">
    """
    
    # Adicionar links da raiz
    for relative_path, link in root_links:
        html_content += f"{link}\n"
    
    # Adicionar arquivos de backup organizados por subpastas
    for subfolder, links in backup_links.items():
        html_content += f"""
        <div class="folder">
            <h2>Arquivos de Backup - {subfolder}</h2>
            <div class="links" id="folder_{subfolder}">
        """
        for relative_path, link in links:
            html_content += f"{link}\n"
        html_content += "</div></div>\n"

    # Finalizar a estrutura HTML
    html_content += """
        </div>
        <div class="footer">
            <p>Repositório de Arquivos - Coordenação de Execução Orçamentária e Financeira.</p>
        </div>
        <script>
            // Função de pesquisa
            document.getElementById('searchBox').addEventListener('input', function() {
                var searchValue = this.value.toLowerCase();
                var links = document.querySelectorAll('a');
                links.forEach(function(link) {
                    if (link.textContent.toLowerCase().includes(searchValue)) {
                        link.style.display = 'block';
                    } else {
                        link.style.display = 'none';
                    }
                });
            });
        </script>
    </body>
    </html>
    """
    
    # Escrever o conteúdo no arquivo index.html
    with open(index_path, "w") as index_file:
        index_file.write(html_content)

    print(f"Arquivo index.html atualizado com {len(root_links)} links da raiz e {sum(len(links) for links in backup_links.values())} links de backup.")
