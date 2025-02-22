import git
from email_processor.config import Config

class GitManager:
    def __init__(self):
        self.repo = self._initialize_repo()

    def _initialize_repo(self):
        try:
            return git.Repo(search_parent_directories=True)
        except git.InvalidGitRepositoryError:
            return git.Repo.init('.')

    def commit_and_push(self):
        self._configure_git_user()
        self.repo.git.add(A=True)
        
        try:
            self.repo.git.commit(m="Atualização automática de relatórios")
            self.repo.git.push()
            return True
        except git.GitCommandError as e:
            print(f"Nenhuma alteração para commitar: {str(e)}")
            return False

    def _configure_git_user(self):
        with self.repo.config_writer() as config:
            config.set_value("user", "name", Config.GIT_USER_NAME)
            config.set_value("user", "email", Config.GIT_USER_EMAIL)