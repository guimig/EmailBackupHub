import os
import base64
import datetime
import json
from email.message import EmailMessage
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

# Configuração
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']
EMAIL_SENDER = "serpro.gov.br"  # Domínio do remetente
BACKUP_FOLDER = "emails"

# Autenticação
def authenticate():
    token = os.getenv("GMAIL_TOKEN")
    if not token:
        raise ValueError("O token GMAIL_TOKEN não foi encontrado nas variáveis de ambiente.")
    
    try:
        creds_info = json.loads(token)  # Use json.loads em vez de eval
        creds = Credentials.from_authorized_user_info(creds_info, SCOPES)
        return build('gmail', 'v1', credentials=creds)
    except json.JSONDecodeError as e:
        raise ValueError("O token GMAIL_TOKEN não está formatado corretamente como JSON.") from e

# Processar e-mails
def process_emails(service):
    results = service.users().messages().list(userId='me', q=f"from:{EMAIL_SENDER}").execute()
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
    update_index(index_file, body, date, subject_folder)

    # Adicionar TAG e arquivar o e-mail
    service.users().messages().modify(
        userId='me',
        id=message['id'],
        body={'addLabelIds': [], 'removeLabelIds': ['INBOX']}
    ).execute()

# Extrair corpo do e-mail
def get_email_body(message):
    try:
        parts = message['payload']['parts']
        body_data = ""
        for part in parts:
            if part['mimeType'] == 'text/html':
                data = part['body']['data']
                body_data = base64.urlsafe_b64decode(data).decode("utf-8")
                break
        return body_data if body_data else "Corpo do e-mail não disponível."
    except KeyError:
        return "Corpo do e-mail não disponível."

# Atualizar index.html
def update_index(index_file, body, date, folder):
    links = [f for f in os.listdir(folder) if f.endswith(".html") and f != "index.html"]
    links_list = "".join(f'<li><a href="{link}">{link}</a></li>' for link in sorted(links, reverse=True))

    html_content = f"""
    <html>
    <head><title>Última Atualização</title></head>
    <body>
        <h1>Última atualização: {date}</h1>
        {body}
        <h2>Backups disponíveis:</h2>
        <ul>{links_list}</ul>
    </body>
    </html>
    """
    with open(index_file, "w", encoding="utf-8") as file:
        file.write(html_content)

# Principal
if __name__ == '__main__':
    try:
        service = authenticate()
        process_emails(service)
    except Exception as e:
        print(f"Erro: {e}")
