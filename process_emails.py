import os
import base64
import datetime
import pickle
from email.message import EmailMessage
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError  # CORREÇÃO AQUI
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

# Configuração
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']
EMAIL_SENDER = "serpro.gov.br"  # Domínio do remetente
BACKUP_FOLDER = "emails"

# Autenticação
def authenticate():
    # Obtendo o token do segredo armazenado no GitHub Actions
    token_base64 = os.getenv('GMAIL_TOKEN')
    if token_base64:
        with open('token.pickle', 'wb') as f:
            f.write(base64.b64decode(token_base64))
    else:
        raise ValueError("GMAIL_TOKEN não encontrado.")
    
    # Carregar o token e autenticar
    creds = None
    if os.path.exists('token.pickle'):
        with open('token.pickle', 'rb') as token:
            creds = pickle.load(token)

    # Se as credenciais não forem válidas, reautenticar
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            raise ValueError("Credenciais não válidas ou expiradas.")
    
    # Retornar o serviço Gmail autenticado
    return build('gmail', 'v1', credentials=creds)

# Processar e-mails
def process_emails(service):
    # Filtrar e-mails não lidos
    results = service.users().messages().list(userId='me', q="is:unread from:{}".format(EMAIL_SENDER)).execute()
    messages = results.get('messages', [])
    print(f"Número de e-mails encontrados: {len(messages)}")

    for msg in messages:
        message = service.users().messages().get(userId='me', id=msg['id']).execute()
        process_message(service, message)

# Processar mensagem individual
def process_message(service, message):
    headers = message['payload']['headers']
    subject = next((h['value'] for h in headers if h['name'] == 'Subject'), "Sem Título")
    date = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    body = get_email_body(message)

    # Criar subpasta para o assunto
    subject_folder = os.path.join(BACKUP_FOLDER, subject)
    os.makedirs(subject_folder, exist_ok=True)

    # Criar arquivo de backup
    backup_file = os.path.join(subject_folder, f"{datetime.date.today()}.html")
    with open(backup_file, "w", encoding="utf-8") as file:
        file.write(body)

    # Atualizar index.html da subpasta
    index_file = os.path.join(subject_folder, "index.html")
    update_index(index_file, body, date, subject_folder, BACKUP_FOLDER)

    # Atualizar index.html na raiz
    root_index_file = os.path.join(BACKUP_FOLDER, "index.html")
    update_index(root_index_file, body, date, subject_folder, BACKUP_FOLDER)

    # Marcar e-mail como lido e adicionar TAG
    label_obj = {
        'addLabelIds': ['Label_1'],  # Substitua por sua label personalizada, se necessário
        'removeLabelIds': ['INBOX']  # Remover da caixa de entrada
    }
    try:
        service.users().messages().modify(userId='me', id=message['id'], body=label_obj).execute()
        print(f"E-mail com assunto '{subject}' marcado como lido e etiquetado.")
    except HttpError as error:
        print(f"Erro ao marcar e-mail como lido: {error}")

# Extrair corpo do e-mail
def get_email_body(message):
    try:
        data = message['payload']['body']['data']
        decoded_data = base64.urlsafe_b64decode(data).decode("utf-8")
        return decoded_data
    except KeyError:
        return "Corpo do e-mail não disponível."

# Atualizar index.html
def update_index(index_file, body, date, folder, root_folder):
    # Listar os backups disponíveis dentro da subpasta
    links = [f for f in os.listdir(folder) if f.endswith(".html") and f != "index.html"]
    links_list = "".join(f'<li><a href="{folder}/{link}">{link}</a></li>' for link in links)

    # Adicionar links no index da raiz
    root_links = [f'<li><a href="{folder}/{link}">{link}</a></li>' for link in links]

    html_content = f"""
    <html>
    <head><title>Última Atualização</title></head>
    <body>
        <h1>Última atualização: {date}</h1>
        {body}
        <h2>Backups disponíveis (subpasta):</h2>
        <ul>{links_list}</ul>
        <h2>Backups disponíveis (raiz):</h2>
        <ul>{''.join(root_links)}</ul>
    </body>
    </html>
    """
    # Verifica se o arquivo da pasta raiz pode ser acessado corretamente
    try:
        with open(index_file, "w", encoding="utf-8") as file:
            file.write(html_content)
            print(f"Arquivo de index criado em: {index_file}")
    except Exception as e:
        print(f"Erro ao criar o index: {e}")
        
# Principal
if __name__ == '__main__':
    try:
        service = authenticate()
        process_emails(service)
    except Exception as e:
        print(f"Erro: {e}")
