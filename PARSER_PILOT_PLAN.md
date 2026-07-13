# Plano de piloto do parser experimental

Esta etapa nao altera o parser de producao. O objetivo e escolher um primeiro
relatorio piloto com base no artefato `parser-comparison.json` do workflow
`Parser Diagnostics`.

## Resultado observado

Artefato analisado:

- workflow: `Parser Diagnostics`
- run: `29210442360`
- arquivo: `parser-comparison.json`
- gerado em: `2026-07-12T21:52:50Z`

Todos os relatorios criticos analisados ficaram sem `experimental_risks`.
Mesmo assim, a similaridade de colunas aparece como `0.0` porque o parser de
producao ainda usa nomes genericos (`Coluna 1`, `Coluna 2`, etc.) nesses casos,
enquanto o parser experimental extrai nomes mais descritivos.

## Piloto recomendado

Primeiro piloto:

- `saldos-de-contas-de-contratos.html`

Justificativa:

- foi citado como exemplo de problema de cabecalho;
- tem superficie menor que os demais relatorios criticos;
- comparacao atual: 17 colunas na producao e 17 no experimental;
- comparacao atual: 29 linhas na producao e 28 no experimental;
- `experimental_risks`: nenhum;
- `experimental_warnings`: nenhum.

## Criterios antes de promover

Antes de usar o parser experimental na geracao oficial desse slug:

- comparar colunas completas, nao apenas amostra;
- explicar a diferenca de uma linha entre producao e experimental;
- confirmar que linhas de total/subtotal continuam identificadas corretamente;
- confirmar que valores monetarios continuam parseaveis;
- gerar JSON paralelo ou relatorio de comparacao, sem substituir o JSON oficial;
- validar `dashboard.html` e `report-viewer.html` com o JSON oficial intacto.

## Proxima etapa segura

Criar uma execucao paralela somente-leitura para o slug
`saldos-de-contas-de-contratos`, gerando um artefato experimental separado para
comparacao. Esse artefato nao deve ser consumido pelo dashboard nem pelo
report-viewer ate passar por validacao.

## Artefato paralelo

O script `generate_parser_pilot.py` gera artefatos isolados. No modo padrao,
ele continua gerando apenas o primeiro piloto:

- `artifacts/parser-pilot-saldos-de-contas-de-contratos.json`
- `artifacts/parser-pilot-saldos-de-contas-de-contratos.md`

No workflow `Parser Diagnostics`, o script roda com `--all-default-pilots` e
gera artefatos para estes relatorios criticos:

- `saldos-de-contas-de-contratos.html`;
- `evolucao-das-despesas-empenhadas.html`;
- `restos-a-pagar-rap.html`.

O modo em lote tambem gera:

- `artifacts/parser-pilot-index.json`;
- `artifacts/parser-pilot-index.md`.

Esse indice consolida contagens de linhas/colunas, delta de linhas e status de
revisao dos pilotos em uma unica visao. Ele tambem inclui um bloco `summary`
com:

- quantidade de pilotos que exigem revisao manual;
- quantidade de pilotos com diferenca de linhas;
- quantidade de pilotos com avisos experimentais;
- quantidade de pilotos marcados como prontos para producao;
- `safe_to_promote_any`, que deve permanecer `false`.

O indice tambem inclui `recommended_next_step`, que nesta fase deve apontar
para `manual_review`, com `allow_production_change=false` e motivos objetivos.
O Markdown do indice inclui ainda um registro de decisao manual, preenchido
fora do processo automatico, para documentar se o piloto nao deve ser promovido,
deve permanecer em revisao ou pode virar candidato a um piloto controlado.

Esses arquivos sao publicados apenas como artefatos do workflow
`Parser Diagnostics`. Eles nao sao gravados em `data/`, nao alteram JSON
oficial e nao sao carregados pelo dashboard ou pelo report-viewer.
O arquivo `parser-pilot-index.md` tambem e copiado para o resumo da execucao do
GitHub Actions, para permitir revisao rapida sem baixar o artefato.

O artefato tambem inclui um bloco `readiness`, com resumo objetivo para revisao:

- se a quantidade de colunas bate entre producao e experimental;
- diferenca de quantidade de linhas;
- existencia de riscos ou avisos experimentais;
- motivos que ainda exigem revisao manual;
- `ready_for_production` sempre `false` nesta etapa.

O resumo Markdown repete essas informacoes em formato legivel para revisao
manual, incluindo contagens de linhas/colunas, riscos, avisos e colunas
experimentais. Cada resumo tambem inclui um checklist de revisao manual para
conferir cabecalhos, amostra de linhas, totais/subtotais, valores monetarios e
compatibilidade do JSON oficial antes de qualquer promocao futura.

## Validacao automatica

O script `validate_parser_pilot.py` valida o artefato antes do upload. A
validacao falha se:

- `read_only` nao for `true`;
- `promotion_status` nao for `not_promoted`;
- houver `experimental_risks`;
- o bloco `readiness` estiver ausente;
- o artefato for marcado como pronto para producao;
- o artefato nao exigir revisao manual;
- as colunas experimentais estiverem vazias;
- as colunas experimentais ainda forem genericas (`Valor 1`, `Valor 2`, etc.);
- a quantidade de linhas experimentais for invalida.

Quando recebe `parser-pilot-index.json`, o mesmo validador confere se:

- o indice tambem e somente leitura;
- a contagem de pilotos bate com a lista consolidada;
- nenhum piloto esta marcado como pronto para producao;
- todos os pilotos continuam exigindo revisao manual;
- `safe_to_promote_any` permanece `false`;
- `recommended_next_step` nao permite mudanca em producao;
- os contadores do `summary` batem com a lista de pilotos;
- cada item referencia um HTML e possui contagens basicas validas.

Diferencas pequenas de quantidade de linhas sao tratadas como aviso, nao como
erro, ate revisao manual do piloto.

## Guarda de promocao

O script `validate_parser_promotion_guard.py` roda no workflow
`Parser Diagnostics` para impedir que arquivos do fluxo oficial importem ou
referenciem o parser experimental. A validacao falha se arquivos como
`main.py`, `email_processor.py`, `html_generator.py`, `data_generator.py` ou
`run_logger.py` referenciarem `experimental_table_parser` ou
`generate_parser_pilot`.

Essa guarda nao impede testes e artefatos experimentais. Ela apenas evita que o
parser experimental entre no processamento oficial sem uma fase futura de
promocao explicita.
