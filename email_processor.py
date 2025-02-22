import os
import re
import email
import datetime
from email import policy
from email.utils import parsedate_to_datetime
from config import BACKUP_FOLDER, TIMEZONE
from html_generator import update_root_index
from git_utils import commit_changes
from imap_client import fetch_unread_emails

def process_emails():
    emails = fetch_unread_emails()
    print(f"Número de e-mails encontrados: {len(emails)}")

    all_links = []
    for msg_data in emails:
        msg = email.message_from_bytes(msg_data, policy=policy.default)
        link = process_message(msg)
        if link:
            all_links.append(link)

    update_root_index()
    commit_changes()

def process_message(msg):
    subject = msg.get('subject', 'Sem Título')
    date_str = msg.get('date')
    date = parsedate_to_datetime(date_str) if date_str else datetime.datetime.now(TIMEZONE)
    body = get_email_body(msg)
    normalized_title = normalize_title(subject)

    subject_folder = os.path.join(BACKUP_FOLDER, normalized_title)
    try:
        os.makedirs(subject_folder, exist_ok=True)
        gitkeep_path = os.path.join(subject_folder, ".gitkeep")
        with open(gitkeep_path, 'w'):
            pass

        file_name = f"{normalized_title}_{date.strftime('%d-%m-%Y')}.html"
        file_path = os.path.join(subject_folder, file_name)
        with open(file_path, "w") as f:
            f.write(body)
        return file_path
    except Exception as e:
        print(f"Erro ao processar a mensagem: {e}")
        return None

def get_email_body(msg):
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type in ['text/plain', 'text/html']:
                return part.get_payload(decode=True).decode('utf-8')
    else:
        return msg.get_payload(decode=True).decode('utf-8')

def normalize_title(title):
    if not title:
        return "sem-titulo"
    
    title = title.lower()
    title = re.sub(r'[^\w\s-]', '', title)
    title = re.sub(r'\s+', '-', title).strip('-')
    title = re.sub(r'-+', '-', title)
    replacements = {'à': 'a', 'á': 'a', 'ã': 'a', 'é': 'e', 'è': 'e', 
                   'ê': 'e', 'í': 'i', 'ó': 'o', 'ô': 'o', 'õ': 'o', 'ú': 'u', 'ü': 'u'}
    for char, replacement in replacements.items():
        title = title.replace(char, replacement)
    return title