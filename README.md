# EmailBackupHub

Repositório estático para coletar relatórios enviados por e-mail, preservar os artefatos relevantes e publicar uma interface de consulta no GitHub Pages.

O projeto foi construído para funcionar sem backend: a coleta e a geração dos dados rodam em Python, enquanto o consumo é feito por páginas HTML, CSS e JavaScript estáticos.

## O Que O Projeto Entrega

- `dashboard.html`: painel principal com KPIs, alertas gerenciais, gráficos e tabela de relatórios.
- `report-viewer.html`: visualizador de relatórios JSON com filtros, ordenação, colunas visíveis, agrupamento, totais e exportação.
- `relatorios.html`: listagem secundária dos relatórios HTML.
- `index.html`: entrada do GitHub Pages, redirecionando para o dashboard.
- `data/*.json`: API estática usada pelo dashboard e pelo report-viewer.
- `emails/<slug>/*.html`: relatórios HTML originais preservados conforme política de retenção.

## Fluxo De Execução

O ponto de entrada é:

```bash
python main.py
```

Fluxo principal:

1. Busca e-mails não lidos do remetente configurado.
2. Ignora mensagens com indicação de ausência de retorno.
3. Salva o corpo HTML do relatório em `emails/<slug>/`.
4. Atualiza os HTMLs atuais na raiz do repositório.
5. Gera JSONs estáticos em `data/`.
6. Registra a execução em `data/run-log.json`.
7. Comita e envia as alterações.
8. Somente depois disso marca os e-mails processados como lidos.

Essa ordem é importante: e-mails só devem ser marcados como lidos depois da geração, log, commit e push concluídos.

## Validação Antes Do Commit

O `main.py` executa uma validação estrutural depois da geração dos JSONs e antes do log final, commit, push e marcação dos e-mails como lidos.

Validação manual:

```bash
python validate_data.py
```

O validador verifica, entre outros pontos:

- arquivos essenciais do GitHub Pages;
- caminhos relativos usados pelo dashboard e pelo `report-viewer`;
- JSONs parseáveis;
- referências de relatórios em `data/index.json`;
- sinais de métrica RAP suspeita;
- ausência de credenciais ou conteúdo sensível no `run-log.json`.

Erros críticos retornam código de saída `1`. Warnings não bloqueiam a execução, mas ficam visíveis para manutenção.

## Baseline De Segurança

Antes de mudanças em parsing, retenção, geração de dados ou visualização, rode:

```bash
python validate_baseline.py
```

Essa validação protege páginas e arquivos essenciais contra regressões simples, especialmente depois de alterações no dashboard, `report-viewer` ou geração dos JSONs.

## Datas E Fechamento

Os relatórios do Tesouro Gerencial são gerados após o fechamento do sistema. Na prática, um relatório recebido ou gerado em determinado dia normalmente representa o fechamento do dia anterior.

Exemplo:

- relatório recebido em `2026-07-01`;
- informação de fechamento: `2026-06-30`;
- esse arquivo pode representar o fechamento mensal de junho/2026.

Essa regra deve ser considerada em retenção, séries históricas, alertas e leitura gerencial.

## Política De Retenção Pretendida

O projeto não precisa preservar todos os relatórios diários indefinidamente. A necessidade operacional é manter:

1. o relatório mais recente disponível de cada tipo;
2. os relatórios de fechamento mensal;
3. dados históricos suficientes para séries e auditoria.

Regra proposta para fechamento mensal:

- preservar o relatório recebido no 1º dia útil do mês;
- interpretar esse relatório como fechamento do mês anterior.

Exemplo:

- recebido no 1º dia útil de julho/2026;
- fechamento mensal de junho/2026.

Essa política evita crescimento descontrolado do repositório sem perder a informação atual e os fechamentos mensais relevantes.

## Séries Históricas

Os gráficos históricos do dashboard devem priorizar dados a partir de janeiro de 2026. A virada de exercício pode zerar bases, saldos e indicadores, então misturar 2025 com 2026 pode distorcer a leitura gerencial.

Dados antigos podem continuar disponíveis como arquivos arquivados, mas não devem contaminar os gráficos principais do cabeçalho do dashboard.

## RAP Auditável

As métricas de Restos a Pagar exigem cuidado porque valores baixos demais podem indicar leitura de subtotal, coluna errada ou linha parcial. Por isso, a extração de RAP deve registrar origem e qualidade da métrica.

Arquivos relacionados:

- `diagnose_rap_totals.py`: diagnóstico conservador de totais RAP;
- `experimental_rap_metrics.py`: extração experimental, usada para comparação e evolução controlada;
- `rap_metrics.py`: validação e normalização segura das métricas RAP;
- `validate_data.py`: alertas para RAP suspeito, baixo demais ou sem origem auditável.

Quando a métrica não for confiável, o dashboard deve exibir informação indisponível ou alerta de qualidade, nunca converter ausência ou suspeita em `0`.

## Diagnósticos De Parser

O parser de produção não deve ser trocado de forma ampla sem comparação e validação. Para evoluções seguras, use os diagnósticos:

```bash
python diagnose_headers.py
python compare_parser_outputs.py
python diagnose_rap_totals.py
```

O workflow `parser_diagnostics.yml` roda diagnósticos auxiliares para ajudar a identificar problemas de cabeçalho, células mescladas e divergências entre parser atual e parser experimental.

Esses diagnósticos são apoio técnico. Eles não devem substituir automaticamente a geração de dados sem uma fase específica, testes e validação visual.

## Estrutura Principal

```text
.
├── main.py
├── email_processor.py
├── imap_client.py
├── data_generator.py
├── report_definitions.py
├── run_logger.py
├── html_generator.py
├── dashboard.html
├── report-viewer.html
├── relatorios.html
├── assets/
│   ├── css/
│   └── js/
├── data/
│   ├── index.json
│   ├── report-definitions.json
│   ├── reports/
│   ├── series/
│   ├── snapshots/
│   ├── retention-plan.json
│   └── run-log.json
└── emails/
```

## Configuração

Variáveis de ambiente necessárias:

- `GMAIL_EMAIL`: conta usada para leitura via IMAP.
- `GMAIL_PASSWORD`: senha ou app password usada no IMAP.

Configurações principais em `config.py`:

- `EMAIL_SENDER`: remetente autorizado.
- `BACKUP_FOLDER`: pasta de relatórios HTML.
- `TIMEZONE`: fuso horário de referência.

Nunca versionar credenciais, tokens ou secrets.

## Dependências

```bash
pip install -r requirements.txt
```

Dependências atuais:

- `python-dotenv`
- `pytz`
- `gitpython`
- `bs4`

## Testes

A suíte mínima usa apenas `unittest`, da biblioteca padrão do Python:

```bash
python -m unittest discover -s tests
```

No GitHub Actions, os testes rodam depois da instalação das dependências e antes de `python main.py`. Assim, se uma regra crítica de parsing, retenção ou métrica falhar, a coleta não segue para o processamento de e-mails.

## GitHub Pages

O projeto é compatível com GitHub Pages porque todo o consumo é feito por arquivos estáticos:

- HTML;
- CSS;
- JavaScript;
- JSON.

Não há necessidade de backend, banco de dados ou servidor de aplicação.

## Documentação Técnica

Mais detalhes estão em:

- `docs/architecture.md`
