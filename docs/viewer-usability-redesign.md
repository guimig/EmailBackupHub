# Redesenho do visualizador de relatórios — experiência de consulta

**Data:** 17/11/2026  
**Escopo:** somente `report-viewer.html`, seus scripts e estilos, testes de interface e documentação.  
**Inalterados:** `relatorios.html`, relatórios HTML recebidos/gerados, IMAP, geração dos JSONs, rotina de atualização e publicação.

## 1. Problemas identificados

Com base nas quatro páginas do PDF de registro da interface e no código atual:

- Os elementos técnicos (métricas, origem, agrupamento, somas e opções de exportação) disputavam a atenção com a pesquisa e a leitura.
- Onze colunas eram comprimidas na página; alguns cabeçalhos quebravam palavras quase letra por letra.
- O usuário não dispunha de largura individual ajustável, nem de uma visão ampliada.
- Um seletor de ordenação e um filtro completo por coluna aumentavam o tamanho de todos os cabeçalhos.
- Ao ativar automaticamente `showTotals`, a contagem visível podia exceder o número de registros de detalhe indicado no topo (exemplo: 7 registros vs. 13 linhas incluindo totais).
- Excesso de blocos antes da primeira linha de dados dificultava a exploração mesmo em relatórios pequenos.

## 2. Nova hierarquia e percurso do usuário

1. **Identificar o relatório:** título, data/status e acesso direto ao HTML original.
2. **Buscar:** caixa de pesquisa livre; botão **+ Filtro** abre uma única edição de critérios, por tipo de dado.
3. **Ler:** conjunto reduzido de colunas sugeridas automaticamente, mantendo todas as colunas no arquivo. A indicação `X/Y colunas` permite ampliar a seleção.
4. **Explorar:** ordenar clicando no cabeçalho, ajustar a largura com o controle global ou arrastando a borda, quebrar texto quando necessário e expandir a tabela.
5. **Examinar detalhes:** botão **↗** abre todos os campos do registro, inclusive os que não estão visíveis na grade.
6. **Exportar:** menu único com CSV, HTML customizado e impressão/PDF. Exporta o conjunto filtrado integral, não apenas a página.
7. **Opcional, após os dados:** agrupamento, cálculos, proveniência, qualidade do parsing e métricas auditáveis em seções recolhíveis.

### Escolhas para evitar complexidade

- Sem vários dropdowns de ordenação nos cabeçalhos: apenas clique para crescente → decrescente → original.
- Sem tornar obrigatório configurar filtros individualmente para cada relatório ou cada slug.
- O padrão mostra **somente registros de detalhe**, com alternância explícita para incluir linhas de total.
- Para relatórios com até oito colunas, apresenta todas. Nos maiores, sugere as três primeiras, as três últimas e chaves usuais (PTRES, NE CCor, RIP, processo) quando houver.
- Indicadores e métricas auditáveis permanecem acessíveis, mas não ocupam a área principal.
- A interface abre o HTML original quando se deseja a leitura fiel à publicação, sem alterar essa origem.

## 3. Regras técnicas preservadas

- `column_schema` orienta formatos e operações, com fallback conservador.
- Identificadores seguem textuais; os períodos contábeis `013/2025` e `014/2025` não viram meses civis.
- Filtros combinados, paginação 25/50/100, URL compartilhável `fN`/`tfN`, agrupamento e exportações completas continuam disponíveis.
- Somas são opcionais e não legitimam somar saldos de diferentes períodos.
- Larguras são alterações visuais locais; não modificam dados nem JSON original.
- Dados textuais são escapados antes de inserção em HTML, inclusive dentro dos detalhes do registro.

## 4. Critérios verificáveis de aceitação

- [ ] Cabeçalhos da tabela sem seletor repetitivo de ordenação; ordenação por clique.
- [ ] Largura efetiva de cada coluna visível de no mínimo 148 px na captura de navegador.
- [ ] Sem rolagem horizontal na **página**; a grade dispõe de rolagem horizontal **interna**.
- [ ] Conjunto inicial menor que 11 colunas para relatório largo, com acesso a todas pelo seletor e pelo detalhe de registro.
- [ ] Tabela apresenta somente 12 linhas de detalhe em um exemplo com 12 dados e seis totais.
- [ ] Agrupamento e auditoria não aparecem expandidos por padrão.
- [ ] Abrir filtro por qualquer coluna e consultar o registro completo funciona sem dependências adicionais.
- [ ] Alterar largura e ampliar a grade funcionam em desktop e em viewport estreito.
- [ ] Exportações e URLs anteriores permanecem compatíveis; testes regressivos anteriores passam.
- [ ] Nenhum arquivo protegido foi modificado no PR.

A suíte automatizada de navegador `tests/viewer_browser_smoke.cjs` usa Chrome headless em duas larguras e publica capturas `desktop.png` e `mobile.png` como artefato temporário da execução de testes.

## 5. Publicação e reversão

Abrir PR; executar CI de Python, JavaScript e navegador. Somente integrar na `main` após aprovação; GitHub Pages então servirá a nova interface no mesmo endereço. Em caso de regressão, reverter o merge. Dados originais, HTMLs e rotina de e-mails não exigem reversão.
