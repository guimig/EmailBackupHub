import email
from email import policy
from email.utils import parsedate_to_datetime
from datetime import datetime
from .config import Config

class EmailParser:
    @staticmethod
    def parse_email(msg_data):
        msg = email.message_from_bytes(msg_data, policy=policy.default)
        return {
            'subject': EmailParser._get_subject(msg),
            'date': EmailParser._parse_date(msg.get('date')),
            'body': EmailParser._extract_body(msg)
        }

    @staticmethod
    def _get_subject(msg):
        return msg.get('subject', 'Sem Título')

    @staticmethod
    def _parse_date(date_str):
        try:
            return parsedate_to_datetime(date_str).astimezone(Config.TIMEZONE)
        except (TypeError, ValueError):
            return datetime.now(Config.TIMEZONE)

    @staticmethod
    def _extract_body(msg):
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() in ['text/plain', 'text/html']:
                    return part.get_payload(decode=True).decode('utf-8')
        return msg.get_payload(decode=True).decode('utf-8')