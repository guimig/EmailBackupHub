import imaplib
from .config import Config

class ImapClient:
    def __init__(self):
        self.mail = None
        
    def connect(self):
        try:
            self.mail = imaplib.IMAP4_SSL(Config.IMAP_SERVER, Config.IMAP_PORT)
            self.mail.login(Config.EMAIL_ADDRESS, Config.EMAIL_PASSWORD)
            return True
        except Exception as e:
            print(f"Erro na conexão IMAP: {str(e)}")
            return False

    def fetch_unread_emails(self):
        try:
            self.mail.select('inbox')
            status, messages = self.mail.search(None, f'(UNSEEN FROM "{Config.EMAIL_SENDER}")')
            if status != 'OK':
                return []

            email_ids = messages[0].split()
            emails = []
            for email_id in email_ids:
                status, msg_data = self.mail.fetch(email_id, '(RFC822)')
                if status == 'OK':
                    emails.append(msg_data[0][1])
            return emails
        except Exception as e:
            print(f"Erro ao buscar emails: {str(e)}")
            return []

    def close(self):
        if self.mail:
            self.mail.logout()