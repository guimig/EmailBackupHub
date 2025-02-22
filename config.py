import os
import pytz

# Configurações gerais
EMAIL_SENDER = "serpro.gov.br"
BACKUP_FOLDER = "emails"
TIMEZONE = pytz.timezone("America/Sao_Paulo")

# Configurações IMAP
IMAP_SERVER = "imap.gmail.com"
IMAP_PORT = 993
EMAIL_ADDRESS = os.getenv('GMAIL_EMAIL')
EMAIL_PASSWORD = os.getenv('GMAIL_PASSWORD')