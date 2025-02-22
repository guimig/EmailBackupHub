from email_processor.imap_client import ImapClient
from email_processor.email_parser import EmailParser
from email_processor.file_manager import FileManager
from email_processor.git_manager import GitManager
from email_processor.html_generator import HtmlGenerator

def main():
    # Inicialização dos módulos
    imap_client = ImapClient()
    email_parser = EmailParser()
    file_manager = FileManager()
    git_manager = GitManager()
    html_generator = HtmlGenerator()

    if imap_client.connect():
        try:
            # Processamento de emails
            emails = imap_client.fetch_unread_emails()
            print(f"E-mails processados: {len(emails)}")

            for msg_data in emails:
                email_data = email_parser.parse_email(msg_data)
                file_manager.save_email(
                    email_data['subject'],
                    email_data['date'],
                    email_data['body']
                )

            # Geração de HTML
            html_generator.generate_summary()
            html_generator.generate_index()

            # Commit e push
            if git_manager.commit_and_push():
                print("Atualização concluída com sucesso!")
                
        except Exception as e:
            print(f"Erro no processamento: {str(e)}")
        finally:
            imap_client.close()

if __name__ == "__main__":
    main()