import imaplib
from config import IMAP_SERVER, IMAP_PORT, EMAIL_ADDRESS, EMAIL_PASSWORD, EMAIL_SENDER


def connect_imap():
    try:
        if not EMAIL_ADDRESS or not EMAIL_PASSWORD:
            raise RuntimeError("GMAIL_EMAIL e GMAIL_PASSWORD devem estar definidos.")

        mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
        mail.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        return mail
    except Exception as e:
        print(f"Erro ao conectar ao servidor IMAP: {e}")
        return None


def fetch_unread_emails():
    mail = None
    try:
        mail = connect_imap()
        if not mail:
            return []

        mail.select("inbox")
        status, messages = mail.uid("search", None, f'(UNSEEN FROM "{EMAIL_SENDER}")')
        if status != "OK":
            print("Erro ao buscar e-mails.")
            return []

        email_uids = messages[0].split()
        emails = []
        for email_uid in email_uids:
            status, msg_data = mail.uid("fetch", email_uid, "(BODY.PEEK[])")
            if status == "OK" and msg_data and msg_data[0]:
                emails.append({"uid": email_uid.decode("ascii"), "raw": msg_data[0][1]})
        return emails
    except Exception as e:
        print(f"Erro ao buscar e-mails: {e}")
        return []
    finally:
        if mail:
            try:
                mail.logout()
            except Exception:
                pass


def mark_emails_as_seen(email_uids):
    if not email_uids:
        return

    mail = None
    try:
        mail = connect_imap()
        if not mail:
            return

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
