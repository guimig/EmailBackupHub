# Explorador inteligente de gráficos do visualizador

## Problema resolvido

O visualizador anterior limitava os gráficos a uma seleção de até 25 registros em barras, sem identificar as dimensões adequadas para cada relatório, distinguir registros de totais nem permitir distribuição por categoria, pizza/rosca ou séries válidas por competência.

A partir deste aprimoramento, a seção **Explorar dados em gráficos**, posicionada depois da tabela e recolhida por padrão, analisa o esquema e os dados disponíveis. **Sugere uma visualização útil**, enquanto o usuário continua livre para escolher formato, análise, classificação, valor, limite e (quando disponível) o registro-base de um quadro mensal.

## Possibilidades e significado

| Análise | Formatos adequados | Aplicação prática | Regra de cálculo |
| --- | --- | --- | --- |
| Valores por registro | Barras | Comparar NEs, PTRES, contratos e saldos individuais | Uma barra = uma linha; **sem agregação** |
| Quantidade por categoria | Barras ou pizza/rosca | Quantos registros por natureza, grupo, fonte, recolhedor etc. | Contagem das linhas filtradas, sem valores monetários |
| Soma por categoria | Barras, pizza/rosca para partes não negativas, linha para datas/competências válidas | Consolidar **quando pertinente** movimentos líquidos ou valores contábeis que o usuário considere aditivos | Soma **explicitamente selecionada**, sem misturar totais com linhas |
| Um registro entre competências | Barras; linha só com meses civis | Inspecionar a posição de um mesmo empenho entre JAN–DEZ e, quando houver, 013/014 | Uma linha de dados ao longo das **colunas de competência**, sem somar empenhos diferentes |

A pizza/rosca não é oferecida para valores individuais, categorias demais, negativos ou total nulo. A linha exige **datas/competências do próprio relatório**, não datas de recebimento de e-mails ou histórico de arquivos. Períodos contábeis `013/2025` e `014/2025` aparecem como categorias em barras, mas não são convertidos em meses civis ou utilizados em linhas cronológicas. Lacunas não são interpoladas.

## Sugestões automáticas, não cadastradas manualmente

O módulo `assets/js/report-chart-explorer.js` encontra dimensões e medidas a partir de `column_schema` e dos valores presentes, sem criar um caso novo para cada `slug`. Corrige com segurança colunas classificadas como valores quando o título indica código ou identificador. A inferência permanece conservadora:

- **GRU:** a coluna de `Emissão - Mês` e uma coluna de `Movim. Líquido` são adequadas para visualizar soma de movimentações agrupadas por **mês de emissão**. Isso não transforma a emissão na data efetiva da arrecadação. Os valores do conjunto filtrado não são automaticamente considerados equivalentes à métrica auditada de um relatório completo.
- **Restos a Pagar e despesas:** seleção automática de barras por registro e medida monetária; soma por natureza somente se o usuário escolher a opção e verificar a aditividade e a ausência de sobreposições.
- **Crédito disponível:** barras para os saldos de registros/combinações orçamentárias, não falso histórico.
- **Saldo de empenhos a liquidar mês a mês:** comparação de um único NE ao longo das competências contidas nas colunas, preservando as competências especiais.
- **Relatórios novos sem medidas reconhecíveis:** distribuição de quantidade por categoria.

A classificação pode variar conforme as colunas, os registros e filtros efetivamente presentes. O usuário pode sempre clicar **Aplicar sugestão** para restabelecer a recomendação correspondente aos registros filtrados.

## Integração à tabela

1. Abra o relatório e aplique busca/filtros. Os gráficos consideram o **conjunto inteiro filtrado**, não só a página atual.
2. Expanda **Explorar dados em gráficos**.
3. Para categorias agrupadas, selecione barra, parcela ou ponto. O sistema aplica um filtro na mesma coluna à tabela, recalcula o gráfico e permite acessar os respectivos registros.
4. Para valores individuais ou competências de um mesmo registro, clique na barra ou ponto para abrir a ficha completa.
5. Ajuste a visualização no próprio painel; as **consultas salvas** passam a registrar modo, tipo, dimensão, medida e limite (mas não a posição volátil de um registro no arquivo).
6. Use **Limpar** para desfazer a seleção e recuperar a lista completa. Exportações CSV, HTML e PDF não são truncadas pelo limite de itens do gráfico.

### Cuidados com dados

- Os relatórios do Tesouro Gerencial podem conter saldos, totais, movimentações, valores de exercícios distintos e códigos numéricos. O tipo `money` não comprova que a soma seja apropriada.
- O modo **Soma por categoria** está identificado expressamente, com advertência sobre a necessidade de revisão contábil.
- Para gráficos de linha, não inferimos meses ausentes como zero, nem usamos as datas dos snapshots como datas de lançamento.
- Roscas só exibem o conjunto completo de até dez parcelas; não ocultam “Outros” para fabricar percentuais.
- Gráficos são apenas visões locais, não alteram JSON ou relatórios de origem.

## Testes

```bash
node --check assets/js/report-chart-explorer.js
node --check assets/js/report-viewer.js
node --test tests/report_chart_explorer.test.cjs
node tests/viewer_browser_smoke.cjs
```

A suíte completa do GitHub Actions inclui testes com relatórios reais de GRU, RAP, crédito, despesas e saldo mensal, além de cenários sem valores numéricos, 3.254 linhas, dados inválidos, zeros, negativos, injeção HTML e comportamento no navegador em desktop e celular.

## Escopo preservado

Não foram alterados `relatorios.html`, os relatórios HTML originais, `main.py`, IMAP, a geração de JSON, históricos, execução do robô ou publicação automática. A implantação está restrita ao visualizador estático, seus módulos de apresentação, preferências locais e testes.

Para reversão, basta reverter o PR. Dados e histórico permanecem intactos.
