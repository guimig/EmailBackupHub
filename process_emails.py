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
#from googleapiclient.errors import HttpError
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
        update_root_index(all_links)
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
def update_root_index(all_links):
    index_path = os.path.join("index.html")
    with open(index_path, "w") as index_file:
        index_file.write("<html><body><h1>E-mails Processados</h1><ul>\n")
        for link in all_links:
            index_file.write(f'<li><a href="{link}">{link}</a></li>\n')
        index_file.write("</ul></body></html>\n")

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
    except Exception as e:
        print(f"Erro ao executar o script: {e}")
