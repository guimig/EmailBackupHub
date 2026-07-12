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
