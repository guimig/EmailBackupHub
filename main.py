from email_processor import process_emails
from html_generator import create_latest_summary_html, update_root_index

if __name__ == '__main__':
    try:
        process_emails()
        create_latest_summary_html()
        update_root_index()
    except Exception as e:
        print(f"Erro ao executar o script: {e}")