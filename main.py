import sys

from data_generator import cleanup_retention_candidates, generate_data_files
from email_processor import process_emails
from git_utils import commit_changes
from html_generator import create_latest_summary_html, update_root_index
from imap_client import mark_emails_as_seen
from run_logger import add_run_error, finish_run, start_run, write_run_log_safely
from validate_data import validate_repository


if __name__ == "__main__":
    run_state = start_run()
    email_result = {"emails_found": 0, "emails": [], "processed_uids": []}
    generated_artifacts = {}
    try:
        # 1. Processa novos e-mails e gera arquivos nas pastas
        email_result = process_emails(commit=False, return_details=True)
        processed_uids = email_result["processed_uids"]
        cleanup_summary = cleanup_retention_candidates()

        # 2. Cria arquivos .html na raiz com os ultimos relatorios de cada pasta
        create_latest_summary_html()

        # 3. Atualiza o index.html com todos os links
        update_root_index()

        # 4. Atualiza a API estatica e os dados para paginas complementares
        generated_artifacts = generate_data_files() or {}
        generated_artifacts["retention_cleanup"] = cleanup_summary
        validation = validate_repository(strict=True)
        generated_artifacts["validation"] = {
            "errors_count": len(validation.errors),
            "warnings_count": len(validation.warnings),
            "checked_json": validation.checked_json,
            "errors": validation.errors[:10],
            "warnings": validation.warnings[:10],
        }
        if validation.errors:
            raise RuntimeError("Validacao estatica falhou: " + "; ".join(validation.errors[:5]))

        # 5. Registra a execucao antes do commit para versionar o log junto com os artefatos
        write_run_log_safely(finish_run(run_state, email_result, generated_artifacts))

        # 6. Publica os artefatos gerados e so entao marca e-mails como lidos
        commit_changes()
        mark_emails_as_seen(processed_uids)

    except Exception as e:
        add_run_error(run_state, "main", e)
        write_run_log_safely(finish_run(run_state, email_result, generated_artifacts, status="error"))
        print(f"Erro no processo principal: {e}")
        sys.exit(1)
