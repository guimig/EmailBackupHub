import os
import re
from datetime import datetime
from config import Config

class FileManager:
    def __init__(self):
        self.backup_folder = Config.BACKUP_FOLDER
        
    def save_email(self, subject, date, content):
        normalized_title = self.normalize_title(subject)
        folder_path = self._create_subject_folder(normalized_title)
        file_path = os.path.join(folder_path, self._generate_filename(normalized_title, date))
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return file_path

    def normalize_title(self, title):
        if not title:
            return "sem-titulo"

        title = re.sub(r'[^\w\s-]', '', title.lower())
        title = re.sub(r'[\s-]+', '-', title).strip('-')
        replacements = {
            'àáã': 'a',
            'éèê': 'e',
            'í': 'i',
            'óôõ': 'o',
            'úü': 'u'
        }
        
        for chars, replacement in replacements.items():
            title = re.sub(f'[{chars}]', replacement, title)
            
        return title

    def _create_subject_folder(self, normalized_title):
        folder_path = os.path.join(self.backup_folder, normalized_title)
        os.makedirs(folder_path, exist_ok=True)
        self._create_gitkeep(folder_path)
        return folder_path

    @staticmethod
    def _create_gitkeep(folder_path):
        gitkeep_path = os.path.join(folder_path, ".gitkeep")
        if not os.path.exists(gitkeep_path):
            open(gitkeep_path, 'a').close()

    @staticmethod
    def _generate_filename(title, date):
        return f"{title}_{date.strftime('%d-%m-%Y')}.html"