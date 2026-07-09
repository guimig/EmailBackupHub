import os
import pytz


def env_flag(name, default=False):
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "sim", "on"}

# Configurações gerais
EMAIL_SENDER = "serpro.gov.br"
BACKUP_FOLDER = "emails"
TIMEZONE = pytz.timezone("America/Sao_Paulo")
REPO_ROOT = os.getcwd()  # Define o diretório raiz do repositório

# Configurações IMAP
RETENTION_KEEP_LATEST = env_flag("RETENTION_KEEP_LATEST", True)
RETENTION_KEEP_FIRST_BUSINESS_DAY = env_flag("RETENTION_KEEP_FIRST_BUSINESS_DAY", True)
RETENTION_DRY_RUN = env_flag("RETENTION_DRY_RUN", True)
RETENTION_APPLY_DELETE = env_flag("RETENTION_APPLY_DELETE", False)
RETENTION_ARCHIVE_IGNORED = env_flag("RETENTION_ARCHIVE_IGNORED", False)
CACHE_ENABLED = env_flag("CACHE_ENABLED", True)

IMAP_SERVER = "imap.gmail.com"
IMAP_PORT = 993
EMAIL_ADDRESS = os.getenv('GMAIL_EMAIL')
EMAIL_PASSWORD = os.getenv('GMAIL_PASSWORD')
