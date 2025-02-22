import imaplib
from config import IMAP_SERVER, IMAP_PORT, EMAIL_ADDRESS, EMAIL_PASSWORD, EMAIL_SENDER

def connect_imap():
    try:
        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        return mail
    except Exception as e:
        print(f"Erro ao conectar ao servidor IMAP: {e}")
        return None

def fetch_unread_emails():
    try:
        mail = connect_imap()
        if not mail:
            return []

        mail.select('inbox')
        status, messages = mail.search(None, f'(UNSEEN FROM "{EMAIL_SENDER}")')
        if status != 'OK':
            print("Erro ao buscar e-mails.")
            return []

        email_ids = messages[0].split()
        emails = []
        for email_id in email_ids:
            status, msg_data = mail.fetch(email_id, '(RFC822)')
            if status == 'OK':
                emails.append(msg_data[0][1])
        return emails
    except Exception as e:
        print(f"Erro ao buscar e-mails: {e}")
        return []