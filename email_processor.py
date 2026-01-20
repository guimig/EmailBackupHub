import os
import re
import email
import datetime
import unicodedata
from email import policy
from email.utils import parsedate_to_datetime

from config import BACKUP_FOLDER, TIMEZONE
from html_generator import update_root_index
from git_utils import commit_changes
from imap_client import fetch_unread_emails


def process_emails():
    emails = fetch_unread_emails()
    print(f"Numero de e-mails encontrados: {len(emails)}")

    all_links = []
    for msg_data in emails:
        msg = email.message_from_bytes(msg_data, policy=policy.default)
        link = process_message(msg)
        if link:
            all_links.append(link)

    update_root_index()
    commit_changes()


def process_message(msg):
    subject = msg.get("subject", "Sem titulo")
    date_str = msg.get("date")
    date = parsedate_to_datetime(date_str) if date_str else datetime.datetime.now(TIMEZONE)
    body = get_email_body(msg)

    if should_skip_email(subject, body):
        print(f"Ignorando e-mail marcado como 'nao houve retorno': {subject}")
        return None

    normalized_title = normalize_title(subject)
    subject_folder = os.path.join(BACKUP_FOLDER, normalized_title)
    try:
        os.makedirs(subject_folder, exist_ok=True)
        gitkeep_path = os.path.join(subject_folder, ".gitkeep")
        with open(gitkeep_path, "w", encoding="utf-8"):
            pass

        file_name = f"{normalized_title}_{date.strftime('%d-%m-%Y')}.html"
        file_path = os.path.join(subject_folder, file_name)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(body)
        return file_path
    except Exception as e:
        print(f"Erro ao processar a mensagem: {e}")
        return None


def get_email_body(msg):
    """Retorna o corpo do e-mail como string UTF-8 ou vazio."""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type in ["text/plain", "text/html"]:
                return part.get_payload(decode=True).decode("utf-8")
        return ""
    return msg.get_payload(decode=True).decode("utf-8")


def normalize_title(title):
    if not title:
        return "sem-titulo"

    cleaned = unicodedata.normalize("NFD", title)
    cleaned = "".join(ch for ch in cleaned if not unicodedata.combining(ch))
    cleaned = cleaned.lower()
    cleaned = re.sub(r"[^\w\s-]", "", cleaned)
    cleaned = re.sub(r"\s+", "-", cleaned).strip("-")
    cleaned = re.sub(r"-+", "-", cleaned)
    return cleaned or "sem-titulo"


def should_skip_email(subject, body):
    """Bloqueia importacao de e-mails com 'nao houve retorno' no assunto ou corpo."""
    block_phrases = ["nao houve retorno", "não houve retorno"]

    def normalize_text(text):
        if not text:
            return ""
        text = unicodedata.normalize("NFD", text)
        text = "".join(ch for ch in text if not unicodedata.combining(ch))
        return text.lower()

    normalized_subject = normalize_text(subject)
    normalized_body = normalize_text(body)
    return any(phrase in normalized_subject or phrase in normalized_body for phrase in block_phrases)

