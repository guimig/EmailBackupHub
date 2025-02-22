from email_processor import process_emails
from html_generator import create_latest_summary_html, update_root_index

if __name__ == '__main__':
    try:
        # 1. Processa novos e-mails e gera arquivos nas pastas
        process_emails()
        
        # 2. Cria arquivos .html na raiz com os últimos relatórios de cada pasta
        create_latest_summary_html()
        
        # 3. Atualiza o index.html com todos os links
        update_root_index()
        
    except Exception as e:
        print(f"Erro no processo principal: {e}")