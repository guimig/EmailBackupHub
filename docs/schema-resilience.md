# Resiliência a mudanças dos relatórios do Tesouro Gerencial

## Escopo e finalidade

O EmailBackupHub recebe HTMLs por e-mail, extrai tabelas e publica `data/index.json`, relatórios JSON, séries e indicadores resumidos. O catálogo e o visualizador devem continuar utilizáveis quando novos relatórios forem reconhecidos pelo pipeline existente e quando os campos de relatórios conhecidos mudarem. **Não é possível garantir correção semântica para qualquer alteração arbitrária da origem.** O programa prefere sinalizar uma inconsistência a apresentar números presumidamente corretos.

Esta etapa aprimora somente a camada estática de apresentação, controle e validação do navegador. **Não modifica** `relatorios.html`, os HTMLs originais, IMAP, `email_processor.py`, `data_generator.py`, `main.py`, nem os processos de atualização, relatórios financeiros ou processamento de e-mails.

## O que passa a ocorrer automaticamente

1. **Relatório novo no índice:** o dashboard usa a lista de `data/index.json` para oferecer acesso, pesquisa, status, qualidade, favoritos e detecção de novidade sem cadastrar o slug. O visualizador monta colunas, filtros e gráficos conforme o JSON e seu `column_schema`, sem layout específico por relatório.
2. **Coluna incluída, excluída ou reordenada:** o visualizador usa os nomes atuais para montar ferramentas, aponta diferenças desde a última referência salva no navegador e mantém filtros compartilhados associados aos nomes, não aos índices.
3. **Variação simples de grafia:** capitalização, acentuação e separadores são reconciliados somente se houver correspondência **única**. Regras de filtro incompatíveis com o tipo atualizado são descartadas e informadas, nunca transferidas para outra coluna.
4. **Mudança de tipo detectada:** compara as classificações das colunas e examina amostra distribuída de até **160 registros por coluna**. Sinaliza valores incompatíveis com tipo monetário, numérico, data e período. A ferramenta não interpreta códigos como dinheiro nem cria novas regras de totalização.
5. **Ausência de relatório no índice:** quando o mesmo navegador conhecia um slug anteriormente, o dashboard informa que ele não está no índice atual. Não presume a causa nem apaga favoritos. Se o slug reaparecer, suas preferências permanecem.
6. **Confirmação manual:** caso a estrutura mude, a comparação com a referência anterior permanece visível até o usuário confirmar explicitamente a nova estrutura; a confirmação afeta somente o navegador, sem modificar a fonte.
7. **Links compartilháveis v2:** são criados com os campos `sv=2`, `cv`, `vg`, `vgs`, `vs` e `vf`, que identificam nomes de colunas. Os parâmetros antigos (`cols`, `sort`, `tf0`, `f0` etc.) continuam aceitos, mas **links antigos com índices não podem ser reparados com segurança** se a ordem das colunas tiver mudado antes de sua primeira abertura. Crie um novo link com a versão atual.
8. **Consultas salvas:** são vinculadas ao nome das colunas. Campos que sumiram ou viraram tipos incompatíveis são ignorados e alertados. A posição de um registro em uma tabela não é usada como identidade de coluna.

## Como conferir a estrutura

Na página do visualizador, em **Informações técnicas, métricas e qualidade dos dados**, abra **Validação da estrutura recebida**. Confira tipo detectado, preenchimento e valores incompatíveis na amostra, além de colunas novas, ausentes, renomeadas ou reordenadas.

Quando houver uma mudança, é possível acionar **Confirmar estrutura atual**. O navegador pergunta antes de registrar a nova referência. A referência local contém apenas **nomes das colunas e tipos**, sem CPF, NE, saldos, números de processos ou registros. Não há sincronização entre computadores.

Um aviso discreto aparece acima da tabela apenas quando existirem ocorrências ou filtros antigos cuja correspondência precise ser conferida.

## Matriz de mudanças e necessidade de desenvolver software

| Mudança na origem | Adaptação automática | Quando é preciso desenvolver/configurar |
| --- | --- | --- |
| Reordenação de colunas | Sim, em links v2 e consultas salvas | Links legados por índice devem ser recriados após conferência |
| Inserção de coluna | Sim, desde que o parser a identifique e gere JSON válido | Tipo ou filtro excepcional pode exigir `column_schema_overrides` |
| Exclusão de coluna | A tabela continua; filtros/medidas afetados são descartados ou ficam indisponíveis | Métrica institucional dependente da coluna exige nova regra verificada |
| Renomeação apenas de acentos/maiúsculas/separadores | Correção por correspondência única, com aviso | Se o significado mudou, revisão manual é indispensável |
| Renomeação substantiva ou divisão/fusão de campos | Coluna atual visível; a antiga é apontada como ausente | Reconfigurar métricas, consultas salvas, correspondências e eventualmente parser |
| Mudança na periodicidade/campo de data | UI se adapta aos tipos existentes | Recomendar cronologia exige uma data real e agregação contábil validada |
| Campo monetário passa a ser código, percentual ou acumulado | Sinalização de tipo/valor possivelmente incompatível | Revisar regras de soma, indicadores e gráfico; não inferir automaticamente |
| Inclusão de novo relatório recebido por e-mail | Catálogo, tabela, filtros e sugestões genéricas de gráficos: sim, se o pipeline produziu JSON válido | Incluir novo **KPI gerencial** demanda definição de métrica, regra e testes |
| Relatório deixa de ser enviado | Ausência no índice sinalizada **somente quando o gerador deixar de listá-lo** | Parar de receber e-mails **não remove HTMLs antigos**; retirar a pasta/arquivo de forma planejada exige ação sobre o acervo |
| Mudança do título/caminho e, portanto, do slug | Aparece como novo relatório | Associar séries históricas, favoritos ou consultas entre slugs exige mapeamento explícito |
| HTML muda para múltiplas tabelas, colunas mescladas, PDF, CSV, anexo ou outro tipo de corpo | Não garantido | Pode exigir adaptação do parser, sanitização ou rotina de leitura/extração |
| Formato de mensagens ou autenticação do e-mail muda | Fora desta camada | Modificação do IMAP/processador e eventual configuração/credenciais |
| Exclusão completa de relatórios no índice | Catálogo mostra vazio; indicadores específicos ficam indisponíveis | Verificar origem, retenção e publicação antes de interpretar como exclusão |

## Limitações obrigatórias

- **Semântica contábil:** um tipo `money` não prova que valores são somáveis. A comparação não autoriza novas métricas financeiras; os indicadores atuais do dashboard ainda dependem de **slugs e regras contábeis específicas**. A substituição ou alteração radical de um desses relatórios poderá exigir implementação de regras em `report_definitions.py`, geração de métricas auditáveis e `assets/js/dashboard.js`. O correto é mostrar indisponibilidade em vez de números deduzidos.
- **Parser HTML:** o gerador atual ainda procura a tabela de maior dimensão e identifica cabeçalhos, totais e linhas por heurísticas. Uma mudança radical pode produzir colunas erradas ou JSON inválido, cuja apresentação não pode ser reconstruída apenas pelo JavaScript.
- **Comparação histórica:** o controle de alterações de estrutura funciona **por navegador**, comparando duas estruturas observadas. Não é uma auditoria central compartilhada, e uma primeira visita após uma mudança não permite conhecer o esquema anterior. Histórico de extrações de relatórios não substitui datas de lançamentos.
- **Amostragem e desempenho:** a validação inspeciona no máximo 160 linhas distribuídas. Pode não detectar uma anomalia rara; `Todas as linhas` ainda consome memória proporcional ao tamanho do relatório.
- **Exclusão de e-mail:** ausência de novas mensagens não implica remoção dos HTMLs preservados. Relatórios só somem do índice se o gerador deixar de encontrar fontes correspondentes.
- **Segurança:** GitHub Pages é público. O navegador não oferece isolamento para dados financeiros sensíveis publicados no repositório. Referências locais não ficam acessíveis entre máquinas.

## Testes e homologação

```bash
node --check assets/js/report-schema-guard.js
node --test tests/report_schema_guard.test.cjs
node --test tests/report_viewer_stage3.test.cjs tests/report_viewer_presets_stage7.test.cjs tests/report_catalog_stage8.test.cjs
node tests/viewer_browser_smoke.cjs
node tests/dashboard_browser_smoke.cjs
python validate_baseline.py
python validate_data.py
```

Os testes de navegador cobrem desktop/mobile com relatório financeiro de 11 colunas e documentos reais de GRU e saldo de empenhos. Testes unitários cobrem inclusão, exclusão, reordenação e grafia dos campos; troca de tipo; incompatibilidades; consultas salvas; links v2; ausência/reaparição no catálogo; amostras com falhas; e armazenamento indisponível.

Para reverter a interface, reverter o PR correspondente. Não existe migração de dados, alteração de métricas ou mutação dos HTMLs.
