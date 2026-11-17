# Gráficos interativos — etapas 4 e 5

## Objetivo

Acrescentar exploração visual aos relatórios do Tesouro Gerencial sem alterar os relatórios HTML originais, o sistema de e-mails, a geração de JSON ou o processo de publicação. O código permanece estático e usa somente JavaScript nativo no GitHub Pages.

## Histórico do dashboard (etapa 4)

- Gráficos distribuídos em duas colunas no desktop e uma no celular, com área ampliada.
- Eixo horizontal respeitando datas reais do histórico, não espaços iguais entre extrações.
- Janelas de 30, 90, 365 dias ou histórico disponível; o recorte é relativo à **última data existente no conjunto**, não ao relógio do navegador.
- Legendas acionáveis, consulta por foco/hover/clique em pontos e link para o relatório de origem.
- Datas inválidas, métricas sem proveniência exigida e valores ausentes são descartados, **nunca convertidos em zero**.
- Lacunas entre observações superiores a 45 dias não são desenhadas como segmentos contínuos. Essa regra visual não altera nem interpreta a validade contábil dos saldos.
- Períodos contábeis `013/2025` e `014/2025` **não são datas civis** nem entram em conversões cronológicas. Permanecem disponíveis em filtros e ordenação próprios da tabela.

## Gráfico por registro no visualizador (etapa 5)

O gráfico foi deliberadamente colocado em seção **recolhida** após a tabela principal. Ao abrir:

1. Selecionar a coluna que identifica o registro (natureza, período, NE, conta ou outro campo).
2. Selecionar uma coluna numérica, monetária ou percentual reconhecida em `column_schema`.
3. Inspecionar até 25 barras por vez; clicar em uma barra abre todos os campos do registro original.
4. A visualização acompanha **todos os filtros e a ordenação** da tabela, mas não depende da página atual.

### Garantias semânticas

- **Uma barra = uma linha**: duas linhas com o mesmo rótulo continuam distintas. Não somar por natureza, exercício, competência, código, fonte ou outro atributo automaticamente.
- O campo numérico é validado antes da exibição. Zero válido permanece zero; valores vazios ou inválidos ficam ausentes.
- Linhas marcadas como total ficam fora do gráfico, mesmo quando a tabela está configurada para exibir totais.
- Registros de data ou período são ordenados para visualização sem modificar a ordem atual da tabela.
- A unidade monetária só aparece para colunas classificadas como `money`; percentual e quantidade são formatados conforme seu tipo.
- Não são necessários registros de `slug` nem desenvolvimento específico para um relatório novo.
- Gráficos de fontes sem medidas numéricas seguras não são inventados. O programa informa a ausência de dados adequados e mantém a tabela disponível.
- O limite de 25 barras é **visual**, não um recorte das exportações. CSV/HTML/PDF permanecem completos para o conjunto filtrado.

## Testes

```bash
node --check assets/js/interactive-charts.js
node --check assets/js/dashboard.js
node --check assets/js/report-viewer.js
node --test tests/interactive_charts_stage4.test.cjs tests/interactive_charts_stage5.test.cjs
node tests/viewer_browser_smoke.cjs
python -m unittest discover -s tests
python validate_baseline.py
python validate_data.py
```

O último teste de navegador exige Chrome/Chromium (executado no GitHub Actions) e verifica desktop e mobile, incluindo a abertura de uma barra.

## Limites

Gráficos por registro não são gráficos de totais contábeis nem relatórios de reconciliação. A comparação de saldos acumulados, métricas RAP e datas de competência deve seguir os valores auditáveis e as definições originais dos relatórios. Nenhuma análise de exercício misto é calculada automaticamente.

## Reversão

Remover a seção opcional e as referências ao módulo de gráficos do visualizador, mantendo os relatórios originais intactos. Em alterações de gráficos do dashboard, reverter o PR da etapa 4. Nenhum dado é convertido, excluído ou modificado por estes recursos.
