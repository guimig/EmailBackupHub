# Baseline de protecao

Este documento registra o ponto funcional atual antes de novas mudancas em parsing,
dashboard ou report-viewer. Ele deve ser usado como referencia para evitar que
alteracoes futuras contaminem novamente os JSONs e snapshots gerados.

## Commit estavel de referencia

- Branch: `main`
- Commit local atual usado como baseline: `33e5f817`
- Motivo: estado apos reverter as alteracoes que quebraram o parsing e o commit
  automatico posterior gerado pelo workflow.

## Regras de seguranca

- Nao misturar mudancas de parsing com mudancas visuais.
- Nao substituir o parser atual diretamente por uma implementacao nova.
- Nao invalidar cache de parsing sem validacao previa.
- Nao regenerar dados em massa sem revisar o diff de `data/`.
- Nao tratar dado ausente como zero.
- Nao publicar JSONs gerados se a validacao basica falhar.
- Nao alterar HTMLs originais dos relatorios fora de rotina explicita de retencao.

## Relatorios criticos

Esses relatorios devem ser usados como amostras obrigatorias antes de qualquer
alteracao futura em parsing, cabecalhos, metricas ou totais:

- `restos-a-pagar-rap.html`
- `saldos-de-contas-de-contratos.html`
- `evolucao-das-despesas-empenhadas.html`
- `despesas-empenhadas-liquidadas-e-pagas-mes-lancamento.html`
- `saldos-de-empenhos-do-exercicio-conta-contabil.html`
- `saldo-de-empenhos-a-liquidar-mes-a-mes.html`
- `credito-disponivel-mes-lancamento.html`
- `provisionamentos.html`
- `recolhimento-proprio-gru.html`

## Areas que exigem fases separadas

1. Parsing de HTML e cabecalhos mesclados.
2. Geracao de JSONs e snapshots.
3. Cache incremental e retencao.
4. Metricas financeiras e RAP.
5. Dashboard, graficos e alertas.
6. Report-viewer, filtros, colunas e exportacao.

## Validacao inicial

Use:

```powershell
python validate_baseline.py
```

ou, quando o comando `python` nao estiver disponivel no ambiente:

```powershell
py validate_baseline.py
```

O validador desta fase nao executa parsing e nao gera arquivos. Ele apenas confere
estrutura basica, arquivos essenciais e sinais simples de risco.
