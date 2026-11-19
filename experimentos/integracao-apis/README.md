# Laboratório independente de APIs públicas — IFC Araquari

## Objetivo

Coletar documentos de empenho, liquidação e pagamento emitidos pela **UG 158459** no Portal da Transparência/CGU. A **UO 26422** corresponde ao IFC como instituição; os recortes não são intercambiáveis.

Este experimento **não altera** `main.py`, IMAP, processamento do Tesouro Gerencial, `data/`, `emails/`, o dashboard principal nem o experimento SIOP/SIDRA já existente.

## Execução

O workflow `.github/workflows/cgu_araquari_experimental.yml` valida o código em PRs e executa a coleta com `CGU_API_KEY` nos eventos de push relevantes na main, execução manual e agenda diária. A chave fica exclusivamente no GitHub Actions, enviada pelo cabeçalho `chave-api-dados`. É proibido colocá-la na URL, em logs ou em arquivos versionados.

Consulta os **sete dias encerrados anteriores** ao dia atual em `America/Sao_Paulo`. Para cada dia, consulta as fases 1, 2 e 3 (`/despesas/documentos`, com `unidadeGestora=158459`, `dataEmissao`, `fase`, `pagina`). Não presume o tamanho da página: a paginação só é considerada completa ao receber página vazia. O limite operacional é **30 páginas** por dia/fase, configurável via `CGU_MAX_PAGES` (limite máximo de segurança: 80). Esse aumento visa concluir os pagamentos, que extrapolavam cinco páginas; ainda é obrigatório receber uma página vazia para considerar a consulta completa. Se atingir o limite com documentos, a consulta é marcada **parcial**; sua contagem é apenas limite inferior e seu total monetário permanece nulo. O JSON pode ser publicado com status de cobertura parcial, jamais com falso total. Valores monetários ausentes ou em formato ilegível são mantidos como `null`, com contagem `valores_invalidos`; os quantitativos de documentos seguem disponíveis quando a paginação está completa, mas o **total da fase permanece indisponível**, sem atribuição de zero ou soma parcial.

**Liquidações:** a CGU pode retornar `valor: null` para os documentos NS. Nesses casos, o coletor consulta `GET /despesas/empenhos-impactados` para cada NS (fase 2) e soma exclusivamente os campos `valorLiquidado` de todos os empenhos/subitens afetados, respeitando sinais e estornos. Essa consulta também exige paginação completa (até oito páginas por documento, `CGU_MAX_IMPACT_PAGES`). Sem dados suficientes, valor inconsistente, falha do serviço, página repetida ou limite atingido, a liquidação permanece com valor `null`, preservando-se a contagem documental. O coletor publica quantos valores de NS foram recuperados, sem divulgar os empenhos relacionados nem informações pessoais da resposta de impacto.

**Pagamentos:** o limite de paginação foi ampliado, com proteção para páginas repetidas e limite operacional. As quantidades são exatas somente quando a paginação se encerra normalmente; valores parciais não viram totais.

Os únicos dados publicados por documento são identificador, fase, data e valor. Nomes, CPF/CNPJ, observações e textos livres são descartados antes da publicação. As somas por fase representam valores documentais na janela de emissão, **não** execução acumulada, saldos de empenho nem valores contábeis reconciliados.

Para executar localmente (sem compartilhar a chave), defina a variável `CGU_API_KEY` em seu terminal e execute:

```bash
node --test experimentos/integracao-apis/test_cgu.mjs
node experimentos/integracao-apis/coletar-cgu.mjs
```

O segundo comando faz consultas reais e grava apenas `experimentos/integracao-apis/dados/cgu-ug-158459.json`. Nunca comite dados sem revisar qualidade e privacidade.

## Visão experimental

`experimentos/integracao-apis/index.html` é independente e carrega somente o JSON da própria pasta. Antes da primeira coleta válida, exibe "aguardando" sem valores inventados.

## Reversão

Reverter o PR remove o coletor/workflow/página experimental sem tocar nos dados da produção. Para suspender imediatamente as consultas, desabilite o workflow no GitHub Actions.

## Critérios para conciliação

O valor da NS reconstruído por empenhos impactados é uma **soma documental da CGU**, não uma liquidação contábil automática do SIAFI. A conferência com o Tesouro Gerencial requer mesma UG, intervalo, conceito de valor líquido/bruto, exercício, tratamento de anulações e restos a pagar. Não substituir relatórios do Tesouro com base apenas nessas somas.

Fontes de referência: [Documentos da despesa (CGU)](https://api.portaldatransparencia.gov.br/swagger-ui/index.html) e `GET /api-de-dados/despesas/empenhos-impactados` (campos `valorLiquidado`, `valorPago` etc.).
