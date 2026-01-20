# EmailBackupHub

Coleta automaticamente relatórios enviados por e-mail, salva cada mensagem em uma pasta por assunto e mantém uma página `index.html` atualizada com o histórico completo e os links para os arquivos mais recentes.

## Como funciona
- Busca e-mails **não lidos** de `serpro.gov.br` via IMAP (`imap.gmail.com`), autenticando com `GMAIL_EMAIL` e `GMAIL_PASSWORD`.
- Ignora qualquer mensagem cujo assunto ou corpo contenha a frase **“não houve retorno”** (com ou sem acento), evitando importar relatórios vazios.
- Cria uma pasta em `emails/<assunto-normalizado>/` e grava o corpo do e-mail em `<assunto-normalizado>_DD-MM-AAAA.html` (mantendo um `.gitkeep`).
- Copia o arquivo mais recente de cada pasta para a raiz do repositório, facilitando o acesso rápido aos relatórios atuais.
- Regenera `index.html` listando as últimas atualizações e todo o histórico, com filtros e ordenação no próprio navegador.
- Comita e faz push das alterações automaticamente (útil para uso em automações ou GitHub Actions).

## Pré-requisitos
- Python 3.10+ (recomendado)
- Acesso IMAP habilitado na conta de e-mail usada para leitura
- Dependências do projeto: `pip install -r requirements.txt`

## Configuração
1. Defina variáveis de ambiente:
   - `GMAIL_EMAIL` e `GMAIL_PASSWORD` (credenciais IMAP).
2. Ajuste `config.py` se necessário:
   - `EMAIL_SENDER`: remetente autorizado (padrão `serpro.gov.br`).
   - `BACKUP_FOLDER`: pasta onde os relatórios são armazenados (padrão `emails`).
   - `TIMEZONE`: fuso horário usado na marcação de datas.
3. Garanta que o repositório tenha remoto configurado e permissões para push, pois o script comita e envia mudanças.

## Execução
```bash
python main.py
```
O fluxo executa em três etapas: (1) baixa e salva e-mails válidos, (2) gera/copias os relatórios mais recentes para a raiz e (3) atualiza o `index.html` consolidando links e metadados.

## Estrutura gerada
- `emails/<assunto-normalizado>/*.html`: histórico completo de cada assunto, separado por pasta.
- `*.html` na raiz: cópia do arquivo mais recente de cada assunto, útil para links rápidos.
- `index.html`: página principal com filtros de texto, data, categoria e ordenação.

## Regras de bloqueio
- Mensagens com “não houve retorno” no assunto ou corpo são descartadas e logadas no console.
- Apenas e-mails do remetente configurado são considerados; o filtro IMAP usa apenas mensagens **não lidas**.

## Observações
- O conteúdo do e-mail é salvo como HTML exatamente como recebido (corpo puro do e-mail); anexos não são processados.
- Se não houver mudanças a comitar, o processo de git apenas informa no console.
