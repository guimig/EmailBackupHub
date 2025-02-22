import pytz
import os

class Config:
    # Configurações de email
    EMAIL_SENDER = "serpro.gov.br"
    IMAP_SERVER = "imap.gmail.com"
    IMAP_PORT = 993
    EMAIL_ADDRESS = os.getenv('GMAIL_EMAIL')
    EMAIL_PASSWORD = os.getenv('GMAIL_PASSWORD')
    
    # Configurações de arquivo
    BACKUP_FOLDER = "emails"
    TIMEZONE = pytz.timezone("America/Sao_Paulo")
    
    # Configurações Git
    GIT_USER_NAME = "github-actions[bot]"
    GIT_USER_EMAIL = "github-actions[bot]@users.noreply.github.com"