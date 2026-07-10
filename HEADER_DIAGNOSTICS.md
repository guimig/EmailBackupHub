# Diagnostico de cabecalhos

Esta etapa prepara a investigacao dos problemas de parsing sem alterar a geracao
de dados. O objetivo e entender os relatorios com cabecalhos em multiplas linhas,
celulas mescladas, subtotais e colunas genericas antes de qualquer ajuste no
parser principal.

## Escopo desta etapa

- Nenhuma alteracao em `data_generator.py`.
- Nenhuma alteracao em `data/`.
- Nenhuma alteracao nos HTMLs de relatorios.
- Nenhuma alteracao no dashboard ou report-viewer.
- Criacao de ferramenta somente-leitura: `diagnose_headers.py`.

## Relatorios prioritarios

- `restos-a-pagar-rap.html`
- `saldos-de-contas-de-contratos.html`
- `evolucao-das-despesas-empenhadas.html`
- `despesas-empenhadas-liquidadas-e-pagas-mes-lancamento.html`
- `saldos-de-empenhos-do-exercicio-conta-contabil.html`
- `saldo-de-empenhos-a-liquidar-mes-a-mes.html`
- `credito-disponivel-mes-lancamento.html`
- `provisionamentos.html`
- `recolhimento-proprio-gru.html`

## Hipoteses de risco

- Uma linha visual de titulo pode estar sendo interpretada como cabecalho.
- Uma linha de cabecalho superior mesclada pode deslocar os nomes reais das colunas.
- Subtotais podem estar sendo confundidos com total geral.
- Colunas numericas de classificacao podem ser confundidas com valores monetarios.
- Fallbacks como `Valor 9`, `Valor 10`, `Valor 11` e `Valor 12` devem ser tratados
  como baixa confiabilidade ate haver validacao por relatorio.

## Como executar

```powershell
python diagnose_headers.py
```

ou:

```powershell
py diagnose_headers.py
```

Para focar em um relatorio:

```powershell
python diagnose_headers.py restos-a-pagar-rap.html
```

## Proxima etapa recomendada

Rodar o diagnostico em ambiente com Python disponivel, salvar a saida e escolher
um unico relatorio para correcao experimental. A primeira correcao deve ser feita
em parser paralelo ou funcao isolada, comparando a saida antiga e nova antes de
promover qualquer mudanca para a geracao oficial.
