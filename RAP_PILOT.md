# Piloto RAP

O primeiro relatorio piloto para correcao controlada de parsing sera
`restos-a-pagar-rap.html`.

## Motivo

- Ja houve historico de valor absurdo no grafico de RAP, como `R$ 15,00`.
- O relatorio usa colunas sensiveis para indicadores gerenciais:
  - RAP pago;
  - RAP a pagar;
  - RAP inscrito;
  - RAP cancelado.
- Ha risco de confundir subtotal, primeira linha parcial ou coluna posicional
  generica com total geral.

## Regra antes de mudar o parser

- Rodar `diagnose_headers.py`.
- Rodar `compare_parser_outputs.py`.
- Rodar `diagnose_rap_totals.py`.
- Validar `experimental_rap_metrics.py` com testes unitarios.
- Identificar a origem do valor:
  - linha;
  - coluna;
  - label;
  - score;
  - qualidade.
- So depois criar uma extracao experimental especifica.
- Nao promover alteracao para `data_generator.py` sem teste unitario e sem
  comparacao contra a saida atual.

## Comando

```powershell
python diagnose_rap_totals.py
```

O script e somente-leitura e nao grava JSON, cache, HTML ou log.

## Extracao experimental

`experimental_rap_metrics.py` transforma candidatos diagnosticados em metricas
auditaveis apenas quando ha origem minimamente confiavel.

A logica compartilhada de candidatos RAP foi movida para `rap_metrics.py`.
`data_generator.py` usa esse modulo apenas para o slug `restos-a-pagar-rap`,
sem alterar o parser de tabelas e sem afetar outros relatorios.
