import os
import pickle
import base64
import datetime
import re
from googleapiclient.discovery import build
from google.auth.credentials import Credentials
from googleapiclient.errors import HttpError
import pytz

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
        token_pickle = base64.b64decode(token_base64)
        creds = pickle.loads(token_pickle)
        if not creds or not creds.valid:
            raise ValueError("Credenciais inválidas ou expiradas.")
        return build('gmail', 'v1', credentials=creds)
    except Exception as e:
        raise ValueError(f"Erro ao processar o GMAIL_TOKEN: {e}")

# Normalizar título do e-mail
def normalize_title(title):
    title = title.lower()
    title = re.sub(r'[^\w\s-]', '', title)  # Remove caracteres especiais
    title = re.sub(r'\s+', '-', title)  # Substitui espaços por hífens
    return title

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

        update_root_index(all_links)
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
    os.makedirs(subject_folder, exist_ok=True)

    # Criar arquivo index.html com o nome do e-mail (antigo index)
    index_file = os.path.join(subject_folder, f"{normalized_title}.html")
    with open(index_file, "w", encoding="utf-8") as file:
        file.write(body)

    # Criar arquivo de backup com a data
    backup_file = os.path.join(subject_folder, f"{datetime.date.today()}.html")
    with open(backup_file, "w", encoding="utf-8") as file:
        file.write(body)

    # Retornar link para o arquivo criado
    link = f"./{BACKUP_FOLDER}/{normalized_title}/{normalized_title}.html"

    # Marcar e-mail como lido
    label_obj = {'addLabelIds': [], 'removeLabelIds': ['UNREAD']}
    try:
        service.users().messages().modify(userId='me', id=message['id'], body=label_obj).execute()
        print(f"E-mail com assunto '{subject}' processado e marcado como lido.")
    except HttpError as error:
        print(f"Erro ao marcar e-mail como lido: {error}")

    return f"<li><a href='{link}'>{subject} - {date}</a></li>"

# Extrair corpo do e-mail
def get_email_body(message):
    try:
        if 'body' in message['payload']:
            body = message['payload']['body'].get('data')
            if body:
                decoded_data = base64.urlsafe_b64decode(body).decode("utf-8")
                return decoded_data

        for part in message['payload'].get('parts', []):
            if part['mimeType'] == 'text/html':
                body = part['body'].get('data')
                if body:
                    decoded_data = base64.urlsafe_b64decode(body).decode("utf-8")
                    return decoded_data
        return "Corpo do e-mail não disponível."
    except Exception as e:
        print(f"Erro ao extrair o corpo do e-mail: {e}")
        return "Corpo do e-mail não disponível."

# Atualizar index.html na raiz
def update_root_index(links):
    index_file = os.path.join(BACKUP_FOLDER, "index.html")
    html_content = f"""
    <html>
    <head><title>Index de E-mails</title></head>
    <body>
        <h1>Index de E-mails</h1>
        <ul>
            {''.join(links)}
        </ul>
    </body>
    </html>
    """
    try:
        with open(index_file, "w", encoding="utf-8") as file:
            file.write(html_content)
        print(f"Arquivo index.html criado na raiz.")
    except Exception as e:
        print(f"Erro ao criar o index.html na raiz: {e}")

# Principal
if __name__ == '__main__':
    try:
        service = authenticate()
        process_emails(service)
    except Exception as e:
        print(f"Erro: {e}")
