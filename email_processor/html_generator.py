import os
import re
import logging
from datetime import datetime
from bs4 import BeautifulSoup
from email_processor.config import Config

# Configuração do logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

class HtmlGenerator:
    HTML_TEMPLATE = """
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CEOF - Relatórios</title>
        <style>
            body {
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                margin: 20px;
                background-color: #0d1117;
                color: #c9d1d9;
                line-height: 1.6;
            }
            h1 {
                color: #f0f6fc;
                text-align: center;
                font-size: 2.2em;
                margin-bottom: 30px;
            }
            .folder {
                margin-top: 20px;
                background-color: #161b22;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
                border-left: 5px solid #6e7681;
            }
            .folder h2 {
                color: #adbac7;
                font-size: 1.6em;
                margin-bottom: 15px;
            }
            .links {
                margin-left: 20px;
            }
            a {
                text-decoration: none;
                color: #58a6ff;
                font-size: 1em;
                display: block;
                margin-bottom: 10px;
            }
            a:hover {
                text-decoration: underline;
                color: #1f6feb;
                padding-left: 5px;
                transition: all 0.3s ease-in-out;
            }
            .footer {
                margin-top: 40px;
                text-align: center;
                color: #8b949e;
            }
            #searchBox {
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
            }
            #searchBox::placeholder {
                color: #6e7681;
            }
            #searchBox:focus {
                border-color: #58a6ff;
                box-shadow: 0 0 8px rgba(85, 145, 255, 0.6);
            }
            @media (max-width: 600px) {
                body {
                    font-size: 14px;
                }
                h1 {
                    font-size: 1.8em;
                }
                .folder h2 {
                    font-size: 1.4em;
                }
                a {
                    font-size: 1.1em;
                }
                #searchBox {
                    width: 90%;
                }
            }
        </style>
    </head>
    <body>
        <h1>CEOF</h1>
        <h2 style="text-align: center;">Lista de Relatórios Gerados pelo Tesouro Gerencial (.html)</h2>
        <div style="text-align: center; margin-bottom: 20px;">
            <input type="text" id="searchBox" placeholder="Pesquise por arquivos..." class="dark-theme">
        </div>
        {content}
        <div class="footer">
            <p>Repositório de Arquivos - Coordenação de Execução Orçamentária e Financeira.</p>
        </div>
        <script>
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

    def __init__(self):
        self.backup_folder = Config.BACKUP_FOLDER

    def generate_index(self):
        root_links, backup_links = self._collect_links()
        html_content = self._build_html_content(root_links, backup_links)
        self._write_index_file(html_content)

    def generate_summary(self):
        for root, dirs, files in os.walk(self.backup_folder):
            if root == self.backup_folder:
                continue

            files = [f for f in files if f.endswith('.html')]
            files.sort(key=lambda f: os.path.getmtime(os.path.join(root, f)), reverse=True)

            if files:
                self._create_summary_file(root, files[0])

    def _clean_html(self, content):
        """
        Limpa o conteúdo HTML usando BeautifulSoup.
        """
        soup = BeautifulSoup(content, 'html.parser')
        return soup.prettify()

    def _create_summary_file(self, root, latest_file):
        try:
            logging.info(f"Processando arquivo: {latest_file}")
            latest_file_path = os.path.join(root, latest_file)
            normalized_title = os.path.basename(root)
            output_path = os.path.join(os.getcwd(), f"{normalized_title}.html")

            # Lê o conteúdo do arquivo HTML
            with open(latest_file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # Limpa o conteúdo HTML usando BeautifulSoup
            soup = BeautifulSoup(content, 'html.parser')
            cleaned_content = soup.prettify()

            # Extrai a data do nome do arquivo
            match = re.search(r'(\d{2})-(\d{2})-(\d{4})\.html', latest_file)
            if match:
                day, month, year = map(int, match.groups())
                last_report_date = datetime(year, month, day, tzinfo=Config.TIMEZONE)
            else:
                last_report_date = datetime.fromtimestamp(os.path.getmtime(latest_file_path), Config.TIMEZONE)

            # Adiciona a data e hora da última atualização no final do HTML
            now = datetime.now(Config.TIMEZONE)
            update_text = f"<p>Última atualização: {now.strftime('%d/%m/%Y %H:%M:%S')}</p>"
            report_date_text = f"<p>Data do relatório: {last_report_date.strftime('%d/%m/%Y')}</p>"

            # Escreve o conteúdo atualizado no arquivo de saída
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(cleaned_content + report_date_text + update_text)
        except UnicodeDecodeError as e:
            logging.error(f"Erro de decodificação no arquivo {latest_file}: {e}")
        except Exception as e:
            logging.error(f"Erro ao processar o arquivo {latest_file}: {e}")

    def _collect_links(self):
        root_links = []
        backup_links = {}

        for root, dirs, files in os.walk(os.getcwd()):
            for file in files:
                if file.endswith('.html') and file != 'index.html':
                    relative_path = os.path.relpath(os.path.join(root, file), os.getcwd())
                    link = f"<a href='{relative_path.replace(os.sep, '/')}'>{file}</a><br>"
                    
                    if root == os.getcwd():
                        root_links.append((relative_path, link))
                    else:
                        subfolder = os.path.relpath(root, os.getcwd())
                        backup_links.setdefault(subfolder, []).append((relative_path, link))

        return root_links, backup_links

    def _build_html_content(self, root_links, backup_links):
        content = []
        content.append('<div class="folder"><h2>Últimas Atualizações</h2><div class="links">')
        for path, link in sorted(root_links, key=lambda x: x[0].lower(), reverse=True):
            content.append(link)
        content.append('</div></div>')

        for subfolder, links in backup_links.items():
            content.append(f'<div class="folder"><h2>{subfolder}</h2><div class="links">')
            for path, link in sorted(links, key=lambda x: x[0].lower(), reverse=True):
                content.append(link)
            content.append('</div></div>')

        return self.HTML_TEMPLATE.format(content='\n'.join(content))

    def _write_index_file(self, html_content):
        with open(os.path.join(os.getcwd(), 'index.html'), 'w', encoding='utf-8') as f:
            f.write(html_content)