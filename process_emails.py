import os
import pickle
import base64
import datetime
import re
import git
import json
import pytz
#from googleapiclient.discovery import build
#from google.auth.credentials import Credentials
from googleapiclient.errors import HttpError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email import policy

# Configuração
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']
EMAIL_SENDER = "serpro.gov.br"  # Domínio do remetente
BACKUP_FOLDER = "emails"
TIMEZONE = pytz.timezone("America/Sao_Paulo")  # Fuso horário de São Paulo

# Autenticação
def authenticate():
    """
    Autentica na API do Gmail e renova o token automaticamente se necessário.
    """
    # Carrega segredos do GitHub Actions (em Base64)
    token_base64 = os.getenv('GMAIL_TOKEN')
    credentials_json_base64 = os.getenv('GMAIL_CREDENTIALS_JSON')

    if not token_base64 or not credentials_json_base64:
        raise ValueError("As credenciais GMAIL_TOKEN e GMAIL_CREDENTIALS_JSON não foram encontradas no ambiente.")

    # Decodifica o token e o credentials.json
    token_data = base64.b64decode(token_base64).decode('utf-8')
    credentials_data = base64.b64decode(credentials_json_base64).decode('utf-8')

    # Carrega as credenciais do token.json
    creds = None
    try:
        creds = Credentials.from_authorized_user_info(json.loads(token_data), SCOPES)
    except Exception as e:
        print(f"Erro ao carregar o token: {e}")

    # Renova o token se necessário
    if creds and creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            print("Token renovado com sucesso.")
        except Exception as e:
            raise ValueError(f"Erro ao renovar token: {e}")

    # Caso não seja possível usar o token.json, usa credentials.json para obter novo token
    if not creds or not creds.valid:
        try:
            creds = Credentials.from_authorized_user_info(json.loads(credentials_data), SCOPES)
            print("Credenciais válidas geradas a partir de credentials.json.")
        except Exception as e:
            raise ValueError(f"Erro ao processar credentials.json: {e}")

    # Retorna o serviço Gmail API autenticado
    if creds and creds.valid:
        return build('gmail', 'v1', credentials=creds)
    else:
        raise ValueError("Não foi possível autenticar. Verifique suas credenciais.")
    
    # Se o token estiver expirado ou inválido, tente renovar usando o JSON de credenciais
    if credentials_json_base64:
        try:
            # Decode e carregar credenciais JSON
            credentials_json = base64.b64decode(credentials_json_base64).decode('utf-8')
            from google.oauth2.service_account import Credentials as ServiceAccountCredentials
            
            # Cria credenciais de conta de serviço e escopo necessário
            creds = ServiceAccountCredentials.from_service_account_info(
                json.loads(credentials_json),
                scopes=SCOPES
            )
            print("Token renovado com sucesso usando GMAIL_CREDENTIALS_JSON.")
            return build('gmail', 'v1', credentials=creds)
        except Exception as e:
            raise ValueError(f"Erro ao processar o GMAIL_CREDENTIALS_JSON: {e}")
    
    raise ValueError("Não foi possível autenticar. Verifique suas credenciais.")


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

# Normalizar título do e-mail
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

# Função para extrair o corpo do e-mail
def get_email_body(message):
    if 'parts' in message['payload']:
        for part in message['payload']['parts']:
            if part['mimeType'] == 'text/plain':
                data = part['body']['data']
                byte_data = base64.urlsafe_b64decode(data.encode('ASCII'))
                return byte_data.decode('utf-8')
            elif part['mimeType'] == 'text/html':
                data = part['body']['data']
                byte_data = base64.urlsafe_b64decode(data.encode('ASCII'))
                return byte_data.decode('utf-8')
    elif 'body' in message['payload'] and 'data' in message['payload']['body']:
        data = message['payload']['body']['data']
        byte_data = base64.urlsafe_b64decode(data.encode('ASCII'))
        return byte_data.decode('utf-8')
    return ""

# Função para gerenciar backups (últimos 5 dias, 5 semanas, 12 meses)
def manage_backups(subject_folder, subject, date):
    backup_files = []  # Lista para armazenar os arquivos a serem mantidos

    # Gerar a lista de backup com base no e-mail atual
    file_name = f"{subject}_{date.strftime('%Y-%m-%d')}.html"
    backup_files.append(file_name)

    # Lógica para manter e-mails diários, semanais e mensais
    today = datetime.datetime.now(TIMEZONE)
    day_diff = (today - date).days
    
    # Backup diário: manter o e-mail mais recente dos últimos 5 dias
    if day_diff <= 5:
        # Mantenha apenas o último e-mail de cada dia
        pass

    # Backup semanal: manter o último e-mail da semana (últimos 5 semanas)
    week_diff = (today - date).days // 7
    if week_diff <= 5:
        pass  # Aqui você pode filtrar os e-mails para cada semana, por exemplo

    # Backup mensal: manter o último e-mail do mês (últimos 12 meses)
    month_diff = (today.year - date.year) * 12 + today.month - date.month
    if month_diff <= 12:
        pass  # Aqui você pode filtrar os e-mails para cada mês, por exemplo

    # Excluir backups antigos
    # Exclua arquivos antigos ou aqueles que não atendem aos critérios
    return backup_files

# Processar e-mails
def process_emails(service):
    try:
        results = service.users().messages().list(userId='me', q=f"is:unread from:{EMAIL_SENDER}").execute()
        messages = results.get('messages', [])
        print(f"Número de e-mails encontrados: {len(messages)}")

        all_links = []

        for msg in messages:
            message = service.users().messages().get(userId='me', id=msg['id']).execute()
            link = process_message(service, message)
            if link:
                all_links.append(link)

            # Marcar como lido e retirar da caixa de entrada
            service.users().messages().modify(
                userId='me', id=msg['id'],
                body={'removeLabelIds': ['INBOX'], 'addLabelIds': ['UNREAD']}
            ).execute()

        # Atualiza o index.html com todos os links
        update_root_index()
        commit_changes()  # Realiza o commit dos arquivos gerados no repositório
    except HttpError as error:
        print(f"Erro ao processar e-mails: {error}")

# Processar mensagem individual
def process_message(service, message):
    headers = message['payload']['headers']
    subject = next((h['value'] for h in headers if h['name'] == 'Subject'), "Sem Título")
    date_str = next((h['value'] for h in headers if h['name'] == 'Date'), None)
    date = datetime.datetime.strptime(date_str, '%a, %d %b %Y %H:%M:%S %z') if date_str else datetime.datetime.now(TIMEZONE)
    body = get_email_body(message)
    normalized_title = normalize_title(subject)

    # Criar pasta para o título do e-mail
    subject_folder = os.path.join(BACKUP_FOLDER, normalized_title)
    print(f"Criando a pasta: {subject_folder}")  # Log para verificar o caminho

    # Tentar criar a pasta e verificar se foi criada com sucesso
    try:
        os.makedirs(subject_folder, exist_ok=True)
        print(f"Pasta criada: {subject_folder}")

        # Forçar o Git a rastrear a pasta, criando um arquivo .gitkeep
        gitkeep_path = os.path.join(subject_folder, ".gitkeep")
        with open(gitkeep_path, 'w') as f:
            pass  # Arquivo vazio para forçar o Git a rastrear a pasta

        # Armazenar e-mails na pasta com base nas condições
        file_name = f"{normalized_title}_{date.strftime('%Y-%m-%d')}.html"
        file_path = os.path.join(subject_folder, file_name)
        with open(file_path, "w") as f:
            f.write(body)

        return file_path  # Retorna o caminho do arquivo
    except Exception as e:
        print(f"Erro ao processar a mensagem: {e}")
        return None

# Atualizar o arquivo index.html
# def update_root_index(all_links):
#    index_path = os.path.join("index.html")
#    with open(index_path, "w") as index_file:
#        index_file.write("<html><body><h1>E-mails Processados</h1><ul>\n")
#        for link in all_links:
#            index_file.write(f'<li><a href="{link}">{link}</a></li>\n')
#        index_file.write("</ul></body></html>\n")

# Atualizar o arquivo index.html
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
                
                # Verificar se o arquivo está na raiz ou em subpastas
                if root == repo_root:
                    link = f"<a href='{relative_path}'>{relative_path}</a><br>"
                    root_links.append(link)
                else:
                    # Organiza arquivos de backup por subpastas
                    subfolder = os.path.relpath(root, repo_root)
                    if subfolder not in backup_links:
                        backup_links[subfolder] = []
                    link = f"<a href='{relative_path}'>{relative_path}</a><br>"
                    backup_links[subfolder].append(link)

    # Caminho para o arquivo index.html
    index_path = os.path.join(repo_root, "index.html")
    
    # Conteúdo HTML com estrutura e CSS
    html_content = """
        <html>
        <head>
            <title>Lista de Arquivos HTML</title>
            <style>
                body {
                    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                    margin: 20px;
                    background-color: #0d1117;  /* Fundo escuro típico */
                    color: #c9d1d9;  /* Texto claro */
                    line-height: 1.6;
                }
                h1 {
                    color: #58a6ff;  /* Azul claro */
                    text-align: center;
                    font-size: 2em;
                    margin-bottom: 20px;
                }
                .folder {
                    margin-top: 20px;
                    background-color: #161b22;  /* Fundo levemente mais claro */
                    padding: 15px;
                    border-radius: 8px;
                    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
                    border-left: 5px solid #58a6ff;  /* Azul destacado */
                }
                .folder h2 {
                    color: #79c0ff;  /* Azul mais suave */
                    font-size: 1.5em;
                    margin-bottom: 10px;
                }
                .links {
                    margin-left: 20px;
                }
                a {
                    text-decoration: none;
                    color: #79c0ff;  /* Azul mais suave */
                    font-size: 1.1em;
                }
                a:hover {
                    text-decoration: underline;
                    color: #58a6ff;  /* Azul destacado ao passar o mouse */
                }
                .footer {
                    margin-top: 30px;
                    text-align: center;
                    color: #8b949e;  /* Texto do rodapé em cinza claro */
                }
                /* Estilo para tornar a página responsiva */
                @media (max-width: 600px) {
                    body {
                        font-size: 14px;
                    }
                    .folder h2 {
                        font-size: 1.3em;
                    }
                    a {
                        font-size: 1em;
                    }
                #searchBox:focus {
                    border-color: #58a6ff;  /* Azul claro ao focar */
                    box-shadow: 0 0 5px #58a6ff;  /* Brilho ao focar */
                }
            </style>
        </head>
        <body>
            <h1>Lista de Arquivos HTML</h1>
            <!-- Barra de pesquisa -->
            <div style="text-align: center; margin-bottom: 20px;">
                <input type="text" 
                    id="searchBox" 
                    placeholder="Pesquise por arquivos..." 
                    style="padding: 10px; 
                            width: 80%; 
                            max-width: 500px; 
                            border-radius: 5px; 
                            border: 1px solid #30363d;  /* Borda em tom escuro */
                            background-color: #161b22;  /* Fundo escuro */
                            color: #c9d1d9;  /* Texto claro */
                            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5);  /* Efeito interno */
                            outline: none; 
                            transition: border-color 0.2s ease-in-out;">
            </div>
            <div class="folder">
                <h2>Arquivos da Raiz - Últimas atualizações</h2>
                <div class="links" id="rootLinks">
    """
    
    # Adicionar links da raiz
    for link in root_links:
        html_content += f"{link}\n"
    
    # Adicionar arquivos de backup organizados por subpastas
    for subfolder, links in backup_links.items():
        html_content += f"""
        <div class="folder">
            <h2>Arquivos de Backup - {subfolder}</h2>
            <div class="links" id="folder_{subfolder}">
        """
        for link in links:
            html_content += f"{link}\n"
        html_content += "</div></div>\n"

    # Finalizar a estrutura HTML
    html_content += """
        </div>
        <div class="footer">
            <p>Repositório de Arquivos - CEOF.</p>
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

def create_latest_summary_html():
    """
    Cria um arquivo .html no diretório inicial para o último arquivo mais atualizado
    de cada subpasta em /emails. Inclui no final a data e horário da última atualização.
    """
    for root, dirs, files in os.walk(BACKUP_FOLDER):
        # Ignora a pasta raiz e processa apenas subpastas
        if root == BACKUP_FOLDER:
            continue

        # Ordena os arquivos por data de modificação, do mais recente ao mais antigo
        files = [f for f in files if f.endswith('.html')]
        files.sort(key=lambda f: os.path.getmtime(os.path.join(root, f)), reverse=True)

        if not files:
            continue

        # Seleciona o arquivo mais recente
        latest_file = files[0]
        latest_file_path = os.path.join(root, latest_file)

        # Extrai o título normalizado da subpasta
        normalized_title = os.path.basename(root)

        # Cria o arquivo HTML no diretório inicial
        output_file = f"{normalized_title}.html"
        output_path = os.path.join(os.getcwd(), output_file)

        # Lê o conteúdo do arquivo mais recente
        with open(latest_file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Adiciona a data e hora da última atualização no final do HTML
        now = datetime.datetime.now(TIMEZONE)
        update_text = f"<p>Última atualização em: {now.strftime('%d/%m/%Y %H:%M:%S')}</p>"

        # Escreve o conteúdo atualizado no arquivo de saída
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content)
            f.write(update_text)

        print(f"Resumo atualizado criado: {output_path}")

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
        service = authenticate()
        process_emails(service)
        # Chamando a função após o processamento dos e-mails
        create_latest_summary_html()
    except Exception as e:
        print(f"Erro ao executar o script: {e}")
