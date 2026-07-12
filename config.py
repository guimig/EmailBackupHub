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

# Retencao de HTMLs historicos.
# Padrao seguro: auditar/simular, sem apagar arquivos.
RETENTION_KEEP_LATEST = env_flag("RETENTION_KEEP_LATEST", True)
RETENTION_KEEP_MONTHLY_CLOSE = env_flag("RETENTION_KEEP_MONTHLY_CLOSE", True)
RETENTION_DRY_RUN = env_flag("RETENTION_DRY_RUN", True)
RETENTION_APPLY_HTML_CLEANUP = env_flag("RETENTION_APPLY_HTML_CLEANUP", False)
RETENTION_MAX_REMOVAL_SAMPLE = int(os.getenv("RETENTION_MAX_REMOVAL_SAMPLE", "200"))

# Configurações IMAP
IMAP_SERVER = "imap.gmail.com"
IMAP_PORT = 993
EMAIL_ADDRESS = os.getenv('GMAIL_EMAIL')
EMAIL_PASSWORD = os.getenv('GMAIL_PASSWORD')
