import imaplib
from config import IMAP_SERVER, IMAP_PORT, EMAIL_ADDRESS, EMAIL_PASSWORD, EMAIL_SENDER


def connect_imap():
    if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
        raise RuntimeError("GMAIL_EMAIL e GMAIL_PASSWORD devem estar definidos.")

    mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT, timeout=60)
    try:
        mail.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
    except Exception:
        mail.shutdown()
        raise
    return mail


def fetch_unread_emails():
    mail = connect_imap()
    try:
        status, _ = mail.select("inbox", readonly=True)
        if status != "OK":
            raise RuntimeError("O IMAP não conseguiu abrir a caixa de entrada.")

        status, messages = mail.uid("search", None, f'(UNSEEN FROM "{EMAIL_SENDER}")')
        if status != "OK" or not messages or not isinstance(messages[0], bytes):
            raise RuntimeError("O IMAP não retornou um resultado válido para a busca.")

        emails = []
        for email_uid in messages[0].split():
            status, msg_data = mail.uid("fetch", email_uid, "(BODY.PEEK[])")
            uid = email_uid.decode("ascii")
            if status != "OK":
                emails.append({"uid": uid, "fetch_error": "O IMAP recusou a leitura do relatório."})
                continue
            raw = next(
                (item[1] for item in (msg_data or [])
                 if isinstance(item, tuple) and len(item) == 2 and isinstance(item[1], bytes)),
                None,
            )
            if raw:
                emails.append({"uid": uid, "raw": raw})
            else:
                emails.append({"uid": uid, "fetch_error": "O IMAP não retornou o corpo do relatório."})
        return emails
    finally:
        try:
            mail.logout()
        except (OSError, imaplib.IMAP4.error):
            pass


def mark_emails_as_seen(email_uids):
    if not email_uids:
        return

    mail = None
    try:
        mail = connect_imap()
        mail.select("inbox")
        for email_uid in email_uids:
            status, _ = mail.uid("store", str(email_uid), "+FLAGS", "(\\Seen)")
            if status != "OK":
                print(f"Erro ao marcar e-mail como lido: UID {email_uid}")
    except Exception as e:
        print(f"Erro ao marcar e-mails como lidos: {e}")
    finally:
        if mail:
            try:
                mail.logout()
            except Exception:
                pass
