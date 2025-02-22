import git
from config import TIMEZONE

def check_git_repo():
    try:
        repo = git.Repo(search_parent_directories=True)
        return repo
    except git.exc.InvalidGitRepositoryError:
        return git.Repo.init(".")

def commit_changes():
    repo = check_git_repo()
    with repo.config_writer() as cfg:
        cfg.set_value("user", "name", "github-actions[bot]")
        cfg.set_value("user", "email", "github-actions[bot]@users.noreply.github.com")
    
    repo.git.add(A=True)
    try:
        repo.git.commit(m="Atualizando e-mails processados.")
    except git.exc.GitCommandError:
        print("Nenhuma alteração para commitar.")
    repo.git.push()