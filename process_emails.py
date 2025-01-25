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

# Função para gerenciar backups (últimos 5 dias, 5 semanas, 12 meses)
def manage_backups(subject_folder, subject, date):
    backup_files = []  # Lista para armazenar os arquivos a serem mantidos

    # Gerar a lista de backup com base no e-mail atual
    # O formato do nome do arquivo será o título normalizado e a data de envio
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
        gitkeep_path = os.path.join(subject_folder, '.gitkeep')
        if not os.path.exists(gitkeep_path):  # Verifique se o arquivo .gitkeep já existe
            with open(gitkeep_path, 'w') as keep_file:
                keep_file.write('')
    except Exception as e:
        print(f"Erro ao criar pasta {subject_folder}: {e}")

    # Criar arquivo index.html com o nome do e-mail (antigo index)
    index_file = os.path.join(subject_folder, f"{normalized_title}.html")
    with open(index_file, "w", encoding="utf-8") as file:
        # Incluindo o CSS no cabeçalho do arquivo HTML
        file.write(f"""
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; }}
                h1 {{ color: #333; }}
                a {{ color: #0066cc; text-decoration: none; }}
                a:hover {{ text-decoration: underline; }}
                .email-content {{ margin: 20px; }}
            </style>
        </head>
        <body>
            <h1>Backup de E-mail: {subject}</h1>
            <div class="email-content">{body}</div>
        </body>
        </html>
        """)

    # Chama a função de backup
    backup_files = manage_backups(subject_folder, subject, date)
    return backup_files

# Atualizar o arquivo index.html
def update_root_index(links):
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write('<html><head><title>E-mails Processados</title></head><body>')
        f.write('<h1>E-mails Processados</h1>')
        for link in links:
            # Modificar a maneira de acessar o link
            f.write(f'<a href="{link[0]}">{link[0]}</a><br>')  # link[0] para acessar a string do link
        f.write('</body></html>')

# Realizar commit no repositório Git
def commit_changes():
    repo = check_git_repo()
    repo.git.add(A=True)  # Adiciona todos os arquivos modificados
    repo.index.commit(f"Backup de e-mails processados em {datetime.datetime.now(TIMEZONE)}")

# Função principal
def main():
    service = authenticate()
    process_emails(service)

if __name__ == '__main__':
    main()
