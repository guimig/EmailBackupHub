from data_generator import generate_data_files
from email_processor import process_emails
from git_utils import commit_changes
from html_generator import create_latest_summary_html, update_root_index
from imap_client import mark_emails_as_seen

if __name__ == '__main__':
    try:
        # 1. Processa novos e-mails e gera arquivos nas pastas
        processed_uids = process_emails(commit=False)

        # 2. Cria arquivos .html na raiz com os últimos relatórios de cada pasta
        create_latest_summary_html()

        # 3. Atualiza o index.html com todos os links
        update_root_index()

        # 4. Atualiza a API estática e os dados para páginas complementares
        generate_data_files()

        # 5. Publica os artefatos gerados e só então marca e-mails como lidos
        commit_changes()
        mark_emails_as_seen(processed_uids)

    except Exception as e:
        print(f"Erro no processo principal: {e}")