# Homologação e continuidade — etapa 6

## Limites mantidos

A etapa 6 reforça o teste e a rastreabilidade das alterações realizadas nas etapas 4 e 5. O comportamento da API estática, a geração automática dos JSONs e os relatórios HTML não são alterados. `relatorios.html`, `main.py`, IMAP e os fluxos de publicação permanecem inalterados.

## Matriz de testes

| Verificação | Teste automatizado | Critério |
| --- | --- | --- |
| Registros volumosos | `tests/report_viewer_stage3.test.cjs` | 3.254 linhas consultadas; página com 25; exportação de todas as linhas filtradas |
| Estado vazio | `tests/report_viewer_stage3.test.cjs` | Sem dados fictícios e sem travar a tabela |
| Filtros brasileiros | `tests/report_viewer_stage3.test.cjs` | BRL, zeros, negativos, intervalos, texto e períodos 013/014 |
| Renderização de gráficos por linha | `tests/interactive_charts_stage5.test.cjs` | Zero, tipos, rótulos repetidos, limite e clique |
| Segurança de apresentação | `tests/chart_security_stage6.test.cjs` | Escape de HTML; valores inválidos não são interpretados como zero |
| Dashboard real (browser) | `tests/dashboard_browser_smoke.cjs` | Indicadores confiáveis, séries visíveis, período 30 dias, tooltip, tema, fonte e ausência de overflow |
| Visualizador real (browser) | `tests/viewer_browser_smoke.cjs` | Responsividade, largura, paginação, filtro, ampliação, registro completo e gráfico opcional |
| Dados e pipeline legados | `validate_baseline.py`, `validate_data.py`, testes Python | Regressões estruturais e de qualidade não toleradas |

Ambos os testes de navegador usam **Chrome/Chromium headless**, sem testar o ambiente de produção ou executar a rotina de e-mails. O workflow disponibiliza capturas de desktop e mobile como artefatos por sete dias.

## Regras operacionais

1. Não marcar um PR como pronto para merge enquanto qualquer verificação falhar.
2. Para mudança de interface, testar ao menos desktop e mobile.
3. Comparar datas pelo padrão ISO ou parse de data civil válida. `013/2025` e `014/2025` são períodos contábeis e não datas.
4. Filtros e exportações devem preservar zeros, identificadores e a origem dos dados.
5. Não agregar saldos sem regra contábil explícita e validada.
6. Não gerar dependências externas nem novas APIs para relatórios futuros quando `column_schema` é suficiente.
7. Para rollback, reverter o PR relevante. Não há migração de dados vinculada às etapas 4–6.

## Homologação manual ainda recomendada

A análise visual real depende das condições do navegador, de relatórios mais recentes e das expectativas dos usuários: testar um relatório com muitas colunas, um de RAP com totais auditados, um com competência especial e um relatório sem uma coluna monetária. Conferir os textos, desempenho em dispositivo físico, acessibilidade por leitor de telas, cores e compatibilidade com o HTML original.

**Importante:** execução de CI não equivale a parecer de conformidade contábil, auditoria das evidências financeiras ou teste de carregamento de produção.
