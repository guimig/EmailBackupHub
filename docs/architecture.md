# Arquitetura Técnica Do EmailBackupHub

Este documento registra o estado técnico atual do projeto e orienta as próximas fases de melhoria. Ele não define uma nova implementação por si só; serve como inventário para mudanças pequenas, testáveis e reversíveis.

## Objetivo Do Projeto

O EmailBackupHub coleta relatórios enviados por e-mail, salva os relatórios em HTML, gera dados estruturados em JSON e publica uma interface estática no GitHub Pages.

Requisitos permanentes:

- não exigir backend;
- não quebrar GitHub Pages;
- não expor credenciais;
- não alterar secrets;
- não marcar e-mails como lidos antes de concluir geração, log, commit e push;
- não substituir dado ausente por zero;
- preservar compatibilidade com JSONs existentes sempre que possível.

## Fluxo De Execução Atual

Entrada principal:

```text
main.py
```

Fluxo:

1. `start_run()` inicializa o estado da execução.
2. `process_emails(commit=False, return_details=True)` busca e processa e-mails não lidos.
3. `create_latest_summary_html()` atualiza os HTMLs atuais na raiz.
4. `update_root_index()` recria `index.html` e `relatorios.html`.
5. `generate_data_files()` gera a API estática em `data/`.
6. `finish_run()` monta o resumo da execução.
7. `write_run_log_safely()` grava `data/run-log.json`.
8. `commit_changes()` versiona e publica artefatos.
9. `mark_emails_as_seen()` marca e-mails processados como lidos.

Essa ordem deve ser preservada.

## Responsabilidades Dos Arquivos

### Coleta E Segurança

- `imap_client.py`
  - conecta no IMAP;
  - busca e-mails não lidos;
  - usa `BODY.PEEK[]` para não marcar como lido durante a leitura;
  - marca e-mails como lidos apenas quando chamado pelo fluxo principal.

- `email_processor.py`
  - decodifica mensagens;
  - extrai HTML ou texto;
  - sanitiza HTML;
  - ignora mensagens com "não houve retorno";
  - salva relatórios em `emails/<slug>/`;
  - registra UID de origem no source map.

### Geração Estática

- `html_generator.py`
  - cria HTMLs atuais na raiz;
  - cria `index.html`;
  - cria `relatorios.html`.

- `data_generator.py`
  - faz parsing de tabelas HTML;
  - normaliza colunas e linhas;
  - separa totais;
  - extrai métricas;
  - gera snapshots;
  - gera séries históricas;
  - gera `data/index.json`;
  - gera `data/search-index.json`;
  - gera `data/report-definitions.json`;
  - aplica cache e política de retenção em modo conservador.

- `report_definitions.py`
  - fonte central de nomes amigáveis;
  - periodicidade;
  - limites de atualização;
  - colunas conhecidas;
  - regras de destaque;
  - regras de métricas.

- `run_logger.py`
  - registra dados da execução em `data/run-log.json`;
  - mantém histórico curto das últimas execuções.

### Front-End

- `dashboard.html`
  - página principal do GitHub Pages.

- `assets/js/dashboard.js`
  - carrega `data/index.json`;
  - carrega relatórios financeiros;
  - carrega séries;
  - renderiza KPIs;
  - renderiza gráficos;
  - renderiza alertas;
  - exporta listagem em CSV.

- `report-viewer.html`
  - visualizador individual de relatórios.

- `assets/js/report-viewer.js`
  - carrega um relatório JSON por `?report=...`;
  - permite filtros, ordenação, colunas visíveis e agrupamentos;
  - mostra totais;
  - exporta CSV;
  - exporta HTML imprimível/PDF.

- `assets/js/common.js`
  - utilitários comuns pequenos;
  - atualmente carrega e consulta `data/report-definitions.json`.

## Modelo De Dados Estático

### `data/index.json`

Índice geral dos relatórios disponíveis.

Contém:

- `schema_version`;
- `generated_at`;
- `api`;
- lista de `reports`;
- contagem histórica.

### `data/reports/<slug>.json`

Representa o último relatório disponível de um tipo.

Contém:

- metadados;
- colunas;
- linhas;
- totais;
- qualidade de parsing;
- métricas;
- metadados de origem das métricas.

### `data/series/<slug>.json`

Série histórica derivada dos snapshots preservados.

Cada ponto pode conter:

- data;
- hash;
- totais;
- métricas;
- metadados de métricas;
- qualidade.

### `data/report-definitions.json`

Artefato gerado a partir de `report_definitions.py` para consumo pelo JavaScript.

### `data/run-log.json`

Registro da última execução e histórico curto.

## Política De Datas E Fechamento

Os relatórios são gerados após o fechamento do sistema. Portanto, um relatório recebido ou gerado no dia normalmente representa o fechamento do dia anterior.

Exemplo:

```text
Data de recebimento: 2026-07-01
Fechamento representado: 2026-06-30
Competência mensal: 2026-06
```

Essa distinção deve aparecer nas próximas melhorias de retenção e séries.

## Problema De Acúmulo De HTMLs

Hoje muitos relatórios são recebidos e salvos diariamente. Se todos os HTMLs diários forem mantidos indefinidamente, o repositório crescerá sem controle.

Necessidade real:

1. manter a informação mais atual de cada relatório;
2. manter fechamentos mensais;
3. não preservar todos os fechamentos diários.

## Política De Retenção Proposta

Para cada tipo de relatório (`slug`), preservar:

1. o HTML mais recente disponível;
2. o HTML recebido no 1º dia útil de cada mês;
3. snapshots/series correspondentes a esses pontos.

O relatório recebido no 1º dia útil de um mês deve ser classificado como fechamento do mês anterior.

Exemplo:

```text
Arquivo recebido em 2026-07-01
Motivo de retenção: monthly_close
Fechamento mensal: 2026-06
```

Arquivos diários que não sejam o último relatório e não sejam fechamento mensal devem ser candidatos a remoção da árvore atual.

## Séries Históricas E Exercício

Na passagem de exercício, saldos e métricas podem zerar ou mudar de base. Por isso, os gráficos históricos principais do dashboard devem considerar apenas dados com fechamento a partir de janeiro de 2026.

Regra proposta:

```text
SERIES_MIN_DATE = 2026-01-01
```

Dados anteriores podem continuar acessíveis como arquivo histórico, mas não devem ser usados nos gráficos principais do cabeçalho.

## Pontos De Atenção Técnica

### 1. Tamanho Do Repositório

O histórico diário de HTMLs e snapshots gera muitos arquivos. A retenção real é necessária para conter crescimento futuro.

### 2. `data_generator.py` Grande

O arquivo concentra parsing, retenção, métricas, snapshots e geração de APIs. A modularização futura reduzirá risco.

### 3. Fallbacks Por Colunas Posicionais

Ainda existem regras baseadas em nomes como `Valor 7`, `Valor 8` e similares. Esses fallbacks devem continuar funcionando, mas devem ser tratados como baixa confiança.

### 4. Código Legado

Arquivos como `html_generator2.py` e `file_manager.py` devem ser auditados. Se não forem usados, devem ser removidos ou movidos para área legada em fase específica.

### 5. Encoding

Alguns ambientes exibem mojibake no terminal. Os arquivos publicados devem ser verificados em UTF-8 no navegador.

## Próximas Fases Recomendadas

### Fase 17 — Política Formal De Retenção Em Dry-Run

- refinar `data/retention-plan.json`;
- classificar preservação por `latest` e `monthly_close`;
- calcular competência de fechamento;
- não apagar arquivos ainda.

### Fase 18 — Séries Históricas Desde 2026

- filtrar pontos usados nos gráficos principais;
- evitar mistura de 2025 com 2026;
- manter dado ausente como ausente.

### Fase 19 — Cache E Reprocessamento Incremental

- evitar parsing de HTML já processado;
- reforçar uso de hash;
- logar cache hits e tempo por etapa.

### Fase 20 — Limpeza Real Dos HTMLs Diários

- aplicar retenção depois de validar dry-run;
- remover apenas arquivos não preservados;
- registrar tudo no run log.

### Fase 21 — Modularização Do Gerador

- separar parser, métricas, retenção e séries;
- preservar comportamento.

### Fase 22 — Testes Mínimos

- testar números brasileiros;
- testar 1º dia útil;
- testar retenção;
- testar RAP;
- testar ausência de dados.

### Fase 23 — Métricas Com Confiança

- classificar métricas por origem e confiabilidade;
- expor confiança no dashboard.

### Fase 24 — Simplificação Do Front-End

- reduzir fallbacks duplicados;
- manter `common.js`;
- criar módulos adicionais apenas se reduzir risco.

### Fase 25 — Redução Histórica Do Git

- avaliar apenas depois de estabilizar retenção;
- operação sensível, pois reescreve histórico.

