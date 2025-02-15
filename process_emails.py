import os
import base64
import datetime
import re
import git
import pytz
import smtplib
import email
from email import policy
from email.header import decode_header
from email.utils import parsedate_to_datetime

# Configuração
EMAIL_SENDER = "serpro.gov.br"  # Domínio do remetente
BACKUP_FOLDER = "emails"
TIMEZONE = pytz.timezone("America/Sao_Paulo")  # Fuso horário de São Paulo

# Configurações SMTP
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_ADDRESS = os.getenv('GMAIL_EMAIL')
EMAIL_PASSWORD = os.getenv('GMAIL_PASSWORD')

# Função para conectar ao servidor SMTP
def connect_smtp():
    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        return server
    except Exception as e:
        print(f"Erro ao conectar ao servidor SMTP: {e}")
        return None

# Função para buscar e-mails não lidos
def fetch_unread_emails():
    try:
        server = connect_smtp()
        if not server:
            return []

        # Seleciona a caixa de entrada
        server.select('inbox')

        # Busca e-mails não lidos do remetente específico
        status, messages = server.search(None, f'(UNSEEN FROM "{EMAIL_SENDER}")')
        if status != 'OK':
            print("Erro ao buscar e-mails.")
            return []

        email_ids = messages[0].split()
        emails = []
        for email_id in email_ids:
            status, msg_data = server.fetch(email_id, '(RFC822)')
            if status == 'OK':
                emails.append(msg_data[0][1])
        return emails
    except Exception as e:
        print(f"Erro ao buscar e-mails: {e}")
        return []

# Função para processar e-mails
def process_emails():
    emails = fetch_unread_emails()
    print(f"Número de e-mails encontrados: {len(emails)}")

    all_links = []

    for msg_data in emails:
        msg = email.message_from_bytes(msg_data, policy=policy.default)
        link = process_message(msg)
        if link:
            all_links.append(link)

    # Atualiza o index.html com todos os links
    update_root_index()
    commit_changes()  # Realiza o commit dos arquivos gerados no repositório

# Função para processar mensagem individual
def process_message(msg):
    subject = msg['subject']
    date_str = msg['date']
    date = parsedate_to_datetime(date_str) if date_str else datetime.datetime.now(TIMEZONE)
    body = get_email_body(msg)
    normalized_title = normalize_title(subject)

    # Criar pasta para o título do e-mail
    subject_folder = os.path.join(BACKUP_FOLDER, normalized_title)
    print(f"Criando a pasta: {subject_folder}")

    try:
        os.makedirs(subject_folder, exist_ok=True)
        print(f"Pasta criada: {subject_folder}")

        # Forçar o Git a rastrear a pasta, criando um arquivo .gitkeep
        gitkeep_path = os.path.join(subject_folder, ".gitkeep")
        with open(gitkeep_path, 'w') as f:
            pass  # Arquivo vazio para forçar o Git a rastrear a pasta

        # Armazenar e-mails na pasta com base nas condições
        file_name = f"{normalized_title}_{date.strftime('%d-%m-%Y')}.html"
        file_path = os.path.join(subject_folder, file_name)
        with open(file_path, "w") as f:
            f.write(body)

        return file_path  # Retorna o caminho do arquivo
    except Exception as e:
        print(f"Erro ao processar a mensagem: {e}")
        return None

# Função para extrair o corpo do e-mail
def get_email_body(msg):
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type == 'text/plain' or content_type == 'text/html':
                return part.get_payload(decode=True).decode('utf-8')
    else:
        return msg.get_payload(decode=True).decode('utf-8')

# Função para normalizar o título do e-mail
def normalize_title(title):
    title = title.lower()
    title = re.sub(r'[^\w\s-]', '', title)  # Remove caracteres especiais
    title = re.sub(r'\s+', '-', title)  # Substitui espaços consecutivos por um único hífen
    title = re.sub(r'-+', '-', title)  # Substitui múltiplos hífens por um único hífen
    title = title.replace('à', 'a')  # Substitui caracteres como 'à' por 'a'
    title = title.replace('á', 'a')  # Substitui caracteres como 'á' por 'a'
    title = title.replace('ã', 'a')  # Substitui caracteres como 'ã' por 'a'
    title = title.replace('é', 'e')  # Substitui caracteres como 'é' por 'e'
    title = title.replace('è', 'e')  # Substitui caracteres como 'è' por 'e'
    title = title.replace('ê', 'e')  # Substitui caracteres como 'ê' por 'e'
    title = title.replace('í', 'i')  # Substitui caracteres como 'í' por 'i'
    title = title.replace('ó', 'o')  # Substitui caracteres como 'ó' por 'o'
    title = title.replace('ô', 'o')  # Substitui caracteres como 'ô' por 'o'
    title = title.replace('õ', 'o')  # Substitui caracteres como 'õ' por 'o'
    title = title.replace('ú', 'u')  # Substitui caracteres como 'ú' por 'u'
    title = title.replace('ü', 'u')  # Substitui caracteres como 'ü' por 'u'
    return title

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

# Função para verificar ou inicializar o repositório Git
def check_git_repo():
    try:
        # Verifica se o repositório já existe no diretório
        repo = git.Repo(search_parent_directories=True)
        if repo.bare:
            print("Repositório Git não encontrado. Inicializando o repositório.")
            repo = git.Repo.init(".")  # Inicializa o repositório
        return repo
    except git.exc.InvalidGitRepositoryError:
        print("Repositório Git não encontrado. Inicializando o repositório.")
        return git.Repo.init(".")  # Inicializa o repositório se não for encontrado

# Função para realizar o commit
def commit_changes():
    repo = check_git_repo()
    
    # Configuração do usuário do Git, caso ainda não esteja configurado
    with repo.config_writer() as git_config:
        git_config.set_value("user", "name", "github-actions[bot]")
        git_config.set_value("user", "email", "github-actions[bot]@users.noreply.github.com")

    # Adiciona todos os arquivos alterados
    repo.git.add(A=True)  # Adiciona todos os arquivos alterados
    try:
        # Commit de alterações
        repo.git.commit(m="Atualizando e-mails processados.")  # Commit de alterações
    except git.exc.GitCommandError:
        print("Nenhuma alteração para commitar.")
    # Push para o repositório remoto
    repo.git.push()

# Execução principal
if __name__ == '__main__':
    try:
        process_emails()
        # Chamando a função após o processamento dos e-mails
        create_latest_summary_html()
        update_root_index()
    except Exception as e:
        print(f"Erro ao executar o script: {e}")