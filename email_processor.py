import os
import re
import email
import datetime
import html
import unicodedata
from email import policy
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

from bs4 import BeautifulSoup, Comment

from config import BACKUP_FOLDER, TIMEZONE
from html_generator import update_root_index
from git_utils import commit_changes
from imap_client import fetch_unread_emails, mark_emails_as_seen

DANGEROUS_TAGS = {
    "script",
    "iframe",
    "object",
    "embed",
    "link",
    "meta",
    "base",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
}
URL_ATTRIBUTES = {"href", "src", "action", "formaction", "xlink:href"}
SAFE_URL_SCHEMES = {"", "http", "https", "mailto"}
DANGEROUS_STYLE_PATTERNS = ("expression", "javascript:", "url(", "behavior:", "-moz-binding")


def process_emails():
    emails = fetch_unread_emails()
    print(f"Numero de e-mails encontrados: {len(emails)}")

    processed_uids = []
    for msg_data in emails:
        msg = email.message_from_bytes(msg_data["raw"], policy=policy.default)
        if process_message(msg):
            processed_uids.append(msg_data["uid"])

    update_root_index()
    commit_changes()
    mark_emails_as_seen(processed_uids)


def process_message(msg):
    subject = msg.get("subject", "Sem titulo")
    date_str = msg.get("date")
    date = parsedate_to_datetime(date_str) if date_str else datetime.datetime.now(TIMEZONE)
    body = get_email_body(msg)

    if should_skip_email(subject, body):
        print(f"Ignorando e-mail marcado como 'nao houve retorno': {subject}")
        return True

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
        return True
    except Exception as e:
        print(f"Erro ao processar a mensagem: {e}")
        return False


def get_email_body(msg):
    """Retorna o corpo do e-mail como HTML seguro."""
    if msg.is_multipart():
        html_body = None
        plain_body = None
        for part in msg.walk():
            if part.get_content_disposition() == "attachment":
                continue

            content_type = part.get_content_type()
            if content_type == "text/html" and html_body is None:
                html_body = decode_email_part(part)
            elif content_type == "text/plain" and plain_body is None:
                plain_body = decode_email_part(part)

        if html_body is not None:
            return sanitize_email_html(html_body)
        if plain_body is not None:
            return plain_text_to_html(plain_body)
        return ""

    content_type = msg.get_content_type()
    body = decode_email_part(msg)
    if content_type == "text/html":
        return sanitize_email_html(body)
    return plain_text_to_html(body)


def decode_email_part(part):
    payload = part.get_payload(decode=True)
    if payload is None:
        try:
            return str(part.get_content())
        except Exception:
            return ""

    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace")
    except LookupError:
        return payload.decode("utf-8", errors="replace")


def plain_text_to_html(text):
    return f"<pre>{html.escape(text or '')}</pre>"


def sanitize_email_html(content):
    soup = BeautifulSoup(content or "", "html.parser")

    for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
        comment.extract()

    for tag in soup.find_all(DANGEROUS_TAGS):
        tag.decompose()

    for tag in soup.find_all(True):
        for attr, value in list(tag.attrs.items()):
            attr_lower = attr.lower()
            if attr_lower.startswith("on") or attr_lower == "srcdoc":
                del tag.attrs[attr]
                continue

            if attr_lower in URL_ATTRIBUTES and not is_safe_url(value):
                del tag.attrs[attr]
                continue

            if attr_lower == "style":
                cleaned_style = sanitize_style(value)
                if cleaned_style:
                    tag.attrs[attr] = cleaned_style
                else:
                    del tag.attrs[attr]

    return str(soup)


def is_safe_url(value):
    if isinstance(value, (list, tuple)):
        value = " ".join(value)
    value = str(value or "").strip()
    if value.startswith("#"):
        return True
    scheme = urlparse(value).scheme.lower()
    return scheme in SAFE_URL_SCHEMES


def sanitize_style(value):
    if isinstance(value, (list, tuple)):
        value = " ".join(value)
    style = str(value or "")
    style_lower = style.lower().replace("\\", "")
    if any(pattern in style_lower for pattern in DANGEROUS_STYLE_PATTERNS):
        return ""
    return style


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
        text = BeautifulSoup(text, "html.parser").get_text(" ", strip=True)
        text = unicodedata.normalize("NFD", text)
        text = "".join(ch for ch in text if not unicodedata.combining(ch))
        return text.lower()

    normalized_subject = normalize_text(subject)
    normalized_body = normalize_text(body)
    return any(phrase in normalized_subject or phrase in normalized_body for phrase in block_phrases)

