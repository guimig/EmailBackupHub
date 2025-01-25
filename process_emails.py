import os
import pickle
import base64
import datetime
from googleapiclient.discovery import build
from google.auth.credentials import Credentials
from googleapiclient.errors import HttpError

# Configuração
SCOPES = ['https://www.googleapis.com/auth/gmail.modify']
EMAIL_SENDER = "serpro.gov.br"  # Domínio do remetente
BACKUP_FOLDER = "emails"

# Autenticação
def authenticate():
    # Obtendo o token do segredo armazenado no GitHub Actions
    token_base64 = os.getenv('GMAIL_TOKEN')
    if not token_base64:
        raise ValueError("GMAIL_TOKEN não encontrado no ambiente.")

    try:
        # Decodificando o token Base64 e desserializando com pickle
        token_pickle = base64.b64decode(token_base64)
        creds = pickle.loads(token_pickle)

        # Verificando se as credenciais têm o escopo correto
        if not creds or not creds.valid:
            raise ValueError("Credenciais inválidas ou expiradas.")

        # Retornar o serviço Gmail autenticado
        return build('gmail', 'v1', credentials=creds)
    except Exception as e:
        raise ValueError(f"Erro ao processar o GMAIL_TOKEN: {e}")

# Processar e-mails
def process_emails(service):
    try:
        # Filtrar e-mails não lidos do remetente especificado
        results = service.users().messages().list(userId='me', q=f"is:unread from:{EMAIL_SENDER}").execute()
        messages = results.get('messages', [])
        print(f"Número de e-mails encontrados: {len(messages)}")

        for msg in messages:
            message = service.users().messages().get(userId='me', id=msg['id']).execute()
            process_message(service, message)
    except HttpError as error:
        print(f"Erro ao processar e-mails: {error}")

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

    # Atualizar index.html na raiz
    root_index_file = os.path.join(BACKUP_FOLDER, "index.html")
    update_index(root_index_file, body, date, subject_folder)

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

# Atualizar index.html
def update_index(index_file, body, date, folder):
    if not os.path.exists(os.path.dirname(index_file)):
        os.makedirs(os.path.dirname(index_file), exist_ok=True)

    links = [f for f in os.listdir(folder) if f.endswith(".html") and f != "index.html"]
    links_list = "".join(f'<li><a href="{folder}/{link}">{link}</a></li>' for link in links)

    html_content = f"""
    <html>
    <head><title>Última Atualização</title></head>
    <body>
        <h1>Última atualização: {date}</h1>
        <div>{body}</div>
        <h2>Backups disponíveis:</h2>
        <ul>{links_list}</ul>
    </body>
    </html>
    """
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
