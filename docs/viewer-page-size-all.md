# Visualizador — quantidade de linhas por página

O seletor **Por página** do visualizador de relatórios oferece:

- 25, 50 (padrão), 100, 250, 500 ou 1.000 linhas
- **Todas as linhas filtradas**

## Comportamento

A opção `Todas as linhas filtradas` usa os registros que permanecem após busca, filtros, ordenação e opção de totais. Se a consulta tiver 3.254 registros, todos os 3.254 serão apresentados dentro da região rolável da tabela, sem dividir em páginas. Os botões **Anterior/Próxima** ficam desabilitados e a indicação passa a `Página 1 de 1`.

Relatórios de grande volume são carregados em lotes de 150 linhas, com indicação de progresso; outras interações não precisam aguardar a inclusão de todas as linhas no DOM. Ao alterar filtros, ordem ou página, o carregamento anterior é cancelado logicamente para não misturar linhas de consultas diferentes.

Agrupamentos continuam apresentando subtotais calculados sobre **todos os registros filtrados de cada grupo**, sem duplicar títulos ou totais quando o carregamento ocorre em lotes. A associação do botão **Ver registro** aos dados originais é preservada. Exportações CSV, HTML e PDF continuam abrangendo o conjunto completo filtrado, independentemente da quantidade de linhas exibida.

### Preferências

A quantidade selecionada é preservada na URL pelo parâmetro `ps`: por exemplo, `ps=1000` ou `ps=all`. Consultas salvas no navegador registram essa preferência e permitem recuperá-la. Links antigos com `ps=25`, `ps=50` e `ps=100` permanecem válidos. Valores desconhecidos retornam ao padrão de 50 linhas.

### Limites práticos

A opção **Todas** pode demandar mais memória no navegador caso o relatório tenha milhares de linhas e muitas colunas. O carregamento gradual reduz pausas longas, mas não é virtualização: todas as linhas selecionadas acabam presentes na tabela. Para dispositivos mais lentos, recomenda-se filtrar primeiro ou selecionar 250, 500 ou 1.000 linhas.

## Compatibilidade e testes

Somente o HTML, o JavaScript de visualização, as consultas salvas e testes foram alterados. **Permanecem inalterados** `relatorios.html`, todos os relatórios HTML originais, `main.py`, a geração e extração de dados, a rotina IMAP e os arquivos financeiros publicados.

Executar `node --test tests/report_viewer_stage3.test.cjs tests/report_viewer_presets_stage7.test.cjs` e `node tests/viewer_browser_smoke.cjs`, além da suíte do GitHub Actions. A cobertura contempla 3.254 linhas, filtros, link compartilhado, totais agrupados, valores nulos, carregamento assíncrono cancelável e navegadores desktop/mobile.

Reversão: reverter o PR correspondente, sem migrar ou alterar dados.
