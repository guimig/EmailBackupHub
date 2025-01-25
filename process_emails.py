import os
import pickle
import base64
import datetime
import re
import git
from googleapiclient.discovery import build
from google.auth.credentials import Credentials
from googleapiclient.errors import HttpError
import pytz
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
    token_base64 = os.getenv('GMAIL_TOKEN')
    if not token_base64:
        raise ValueError("GMAIL_TOKEN não encontrado no ambiente.")
    
    try:
        # Decode do token base64
        token_pickle = base64.b64decode(token_base64)
        creds = pickle.loads(token_pickle)
        
        # Verifique se as credenciais são válidas
        if not creds or not creds.valid:
            raise ValueError("Credenciais inválidas ou expiradas.")
        
        print(f"Credenciais validadas com sucesso.")
        return build('gmail', 'v1', credentials=creds)
    
    except Exception as e:
        raise ValueError(f"Erro ao processar o GMAIL_TOKEN: {e}")

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

        # Atualiza o index.html com todos os links
        update_root_index(all_links)
        commit_changes()  # Realiza o commit dos arquivos gerados no repositório
    except HttpError as error:
        print(f"Erro ao processar e-mails: {error}")

# Processar mensagem individual
def process_message(service, message):
    headers = message['payload']['headers']
    subject = next((h['value'] for h in headers if h['name'] == 'Subject'), "Sem Título")
    date = datetime.datetime.now(TIMEZONE).strftime("%d/%m/%Y %H:%M:%S")
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
        with open(os.path.join(subject_folder, '.gitkeep'), 'w') as keep_file:
            keep_file.write('')
    except Exception as e:
        print(f"Erro ao criar pasta {subject_folder}: {e}")

    # Criar arquivo index.html com o nome do e-mail (antigo index)
    index_file = os.path.join(subject_folder, f"{normalized_title}.html")
    with open(index_file, "w", encoding="utf-8") as file:
        file.write(body)
        file.write(f"<p>Última atualização: {datetime.datetime.now(TIMEZONE).strftime('%d/%m/%Y')}</p>")

    # Backup diário
    backup_file = os.path.join(subject_folder, f"{datetime.date.today()}.html")
    with open(backup_file, "w", encoding="utf-8") as file:
        file.write(body)
        file.write(f"<p>Última atualização: {datetime.datetime.now(TIMEZONE).strftime('%d/%m/%Y')}</p>")

    # Gerenciar backups
    manage_backups(subject_folder)

    # Retornar link para o arquivo criado
    link = f"./{BACKUP_FOLDER}/{normalized_title}/{normalized_title}.html"

    # Marcar e-mail como lido
    label_obj = {'addLabelIds': [], 'removeLabelIds': ['UNREAD']}
    try:
        service.users().messages().modify(userId='me', id=message['id'], body=label_obj).execute()
        print(f"E-mail com assunto '{subject}' processado e marcado como lido.")
    except HttpError as error:
        print(f"Erro ao marcar e-mail como lido: {error}")
    
    return link

# Atualiza o arquivo index.html na raiz
def update_root_index(links):
    index_file = "index.html"
    links_html = ""
    
    # Gerar links
    for link in links:
        links_html += f"<li><a href='{link}'>{link}</a></li>"

    # Adicionar o CSS básico
    html_content = f"""
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; padding: 20px; }}
            ul {{ list-style-type: none; padding-left: 0; }}
            li {{ margin-bottom: 10px; }}
            a {{ text-decoration: none; color: #2a9df4; }}
            a:hover {{ color: #1a7fb8; }}
        </style>
    </head>
    <body>
        <h1>Backup de E-mails</h1>
        <ul>
            {links_html}
        </ul>
    </body>
    </html>
    """
    
    # Escrever no arquivo
    with open(index_file, "w", encoding="utf-8") as file:
        file.write(html_content)

# Função para realizar o commit das mudanças no repositório Git
def commit_changes():
    repo = check_git_repo()  # Verificar ou inicializar o repositório Git
    repo.git.add(A=True)  # Adiciona todos os arquivos ao commit
    repo.index.commit("Atualização de arquivos e links")  # Realiza o commit
    origin = repo.remote(name="origin")  # Obtém o repositório remoto
    origin.push()  # Envia as mudanças para o repositório remoto

# Executar o script
if __name__ == "__main__":
    service = authenticate()
    process_emails(service)
