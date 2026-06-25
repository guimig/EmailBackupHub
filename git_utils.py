import os

import git

from config import BACKUP_FOLDER


def check_git_repo():
    try:
        repo = git.Repo(search_parent_directories=True)
        return repo
    except git.exc.InvalidGitRepositoryError:
        return git.Repo.init(".")


def get_generated_paths():
    paths = []

    if os.path.isdir(BACKUP_FOLDER):
        paths.append(BACKUP_FOLDER)

    if os.path.exists("index.html"):
        paths.append("index.html")

    for file_name in os.listdir("."):
        if file_name.endswith(".html") and file_name != "index.html":
            paths.append(file_name)

    return paths


def commit_changes():
    repo = check_git_repo()
    with repo.config_writer() as cfg:
        cfg.set_value("user", "name", "github-actions[bot]")
        cfg.set_value("user", "email", "github-actions[bot]@users.noreply.github.com")

    generated_paths = get_generated_paths()
    if not generated_paths:
        print("Nenhum arquivo gerado encontrado para commitar.")
        return

    repo.git.add(*generated_paths)
    if not repo.is_dirty(index=True, working_tree=True, untracked_files=False):
        print("Nenhuma alteração para commitar.")
        return

    repo.git.commit(m="Atualizando e-mails processados.")
    repo.git.push()
