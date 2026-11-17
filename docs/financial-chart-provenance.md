# Correção de proveniência dos gráficos financeiros

**Referência analisada:** dados de `data/index.json`, gerados em 17/11/2026; relatórios e séries JSON do repositório no momento da correção.

## Diagnóstico demonstrado

A função `build_series()` em `data_generator.py` cria séries a partir de *snapshots* dos relatórios. Cada ponto recebe `date_iso` obtida de `doc["date_iso"]`, que representa a data de geração/extração do relatório ou a data inferida do nome do arquivo. Ela **não equivale à data de lançamento da despesa ou arrecadação**. A antiga função `renderHistoricalLineChart()` usava essas datas no eixo horizontal; o desenho era interrompido em lacunas maiores que 45 dias.

Na referência consultada:

| Relatório | Pontos na série de extrações | Intervalos | Informações de lançamento na tabela atual |
| --- | ---: | --- | --- |
| Despesas empenhadas, liquidadas e pagas por mês | 6 | abril, maio, julho, setembro, outubro e novembro de 2026 | Valores atuais por NE/natureza, **sem coluna de data individual de lançamento** |
| Crédito disponível por mês | 6 | abril, maio, julho, setembro, outubro e novembro de 2026 | Saldos por classificação/conta no mês de referência, **sem evolução mensal reconstruível** |
| Recolhimento próprio — GRU | 7 | janeiro, abril, maio, julho, setembro, outubro e novembro de 2026 | **242 registros**, com `Emissão - Dia` e `Emissão - Mês` de 2026 |

A soma dos `242` registros na coluna **`724210100 / = ARRECADACAO LIQUIDA POR COD DE RECOLHIMENTO / Movim. Líquido - R$ (Item Informação)`** corresponde a **R$ 251.831,42**, exatamente o total auditado da GRU. Já `Conta Contábil / Doc - Valor` resulta em **R$ 251.404,86**; usar essa coluna na série mensal causaria divergência. Esses valores são descrições da extração de 17/11/2026, **não garantia de comportamento futuro**.

## Correções implementadas

1. **Execução da despesa:** em vez da linha de extrações, o painel apresenta três barras dos valores auditados no último relatório: empenhado, liquidado e pago. Nenhuma data de lançamento é inferida.
2. **Crédito disponível / provisionamentos:** duas barras **independentes** mostram os respectivos saldos auditados, com suas datas de referência. A interface não deduz que um valor seja parte, diferença, consumo ou complemento contábil do outro.
3. **GRU:** o sistema busca o JSON detalhado **somente para este gráfico**, após carregar o resumo compacto já existente. Um módulo genérico reconstrói os meses por data de emissão e soma **somente** a coluna de movimentação líquida. Valida exercício, referência, integridade da data, compatibilidade com a coluna de mês, valores numéricos, status da métrica auditada e reconciliação dos centavos.
4. **Falhas seguras:** se o relatório detalhado não estiver disponível, se a origem tiver outra versão ou se a soma divergir do total auditado, informa explicitamente que **não foi possível produzir série mensal confiável** e conserva o valor auditado no KPI, sem inventar zeros.
5. **Interface:** removido o seletor “Histórico exibido” dos cartões que não usam séries de lançamentos. O módulo de gráficos temporais genéricos permanece disponível para usos futuros com datas verificáveis, mas não é acionado por esses três cartões.

**Atenção:** `Emissão - Dia` do relatório GRU é a data de emissão do documento. Não a chamamos de data da arrecadação efetiva, pois o dado disponível não comprova equivalência.

## Compatibilidade

Não foram modificados `relatorios.html`, os relatórios HTML, `data_generator.py`, `dashboard_summary.py`, a retenção de arquivos, `main.py`, IMAP, marcação de e-mails, produção dos JSONs ou publicação. O `dashboard.html` continua hospedado no GitHub Pages e ainda usa `data/dashboard-summary.json` para os KPIs, com seu fallback anterior.

Os períodos contábeis `013/2025` e `014/2025` são mantidos em seus relatórios e **não são reinterpretados como meses civis**. Não há alteração na camada semântica do visualizador.

## Critérios de aceitação

- [ ] Não existem linhas baseadas em datas de extração nos cartões de despesa, crédito e GRU.
- [ ] O cartão de despesas exibe somente valores atuais auditáveis.
- [ ] O cartão de crédito compara dois valores auditados, sem subtração implícita.
- [ ] O cartão GRU mostra janeiro a novembro por **mês de emissão** conforme fonte de 17/11/2026, somando R$ 251.831,42.
- [ ] Divergência de um centavo além da tolerância de reconciliação, campo ausente ou data inválida impede desenho de barras mensais.
- [ ] Erro de rede não impede abertura dos outros indicadores ou da lista de relatórios.
- [ ] O carregamento em tema claro/escuro não repete requisições do detalhe GRU desnecessariamente.
- [ ] CI de JavaScript/Python e navegador em desktop e celular passa sem alterações no pipeline financeiro.

## Homologação e reversão

Validar os dados com `node --test tests/financial_chart_provenance.test.cjs`, além da suite existente e dos testes Chrome `tests/dashboard_browser_smoke.cjs`.

Se o comportamento contábil do relatório GRU mudar, a validação impedirá que a série seja exibida sem reconciliação. O fluxo de e-mails não é afetado. Reverter o PR para retornar à interface anterior, sem qualquer migração de dados.

**Evolução futura:** um gráfico temporal de despesas só deve ser criado a partir de fonte comprovada por competência/data de lançamento e medida definida, com regras de consolidação específicas. Uma sequência de relatórios extraídos não pode substituir essas evidências.
