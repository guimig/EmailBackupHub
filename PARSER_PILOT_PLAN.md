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

O script `generate_parser_pilot.py` gera:

- `artifacts/parser-pilot-saldos-de-contas-de-contratos.json`

Esse arquivo e publicado apenas como artefato do workflow `Parser Diagnostics`.
Ele nao e gravado em `data/`, nao altera JSON oficial e nao e carregado pelo
dashboard ou pelo report-viewer.

O artefato tambem inclui um bloco `readiness`, com resumo objetivo para revisao:

- se a quantidade de colunas bate entre producao e experimental;
- diferenca de quantidade de linhas;
- existencia de riscos ou avisos experimentais;
- motivos que ainda exigem revisao manual;
- `ready_for_production` sempre `false` nesta etapa.

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

Diferencas pequenas de quantidade de linhas sao tratadas como aviso, nao como
erro, ate revisao manual do piloto.
