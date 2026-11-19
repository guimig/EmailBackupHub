# Laboratório independente de APIs públicas — IFC Araquari

## Objetivo

Coletar documentos de empenho, liquidação e pagamento emitidos pela **UG 158459** no Portal da Transparência/CGU. A **UO 26422** corresponde ao IFC como instituição; os recortes não são intercambiáveis.

Este experimento **não altera** `main.py`, IMAP, processamento do Tesouro Gerencial, `data/`, `emails/`, o dashboard principal nem o experimento SIOP/SIDRA já existente.

## Execução

O workflow `.github/workflows/cgu_araquari_experimental.yml` valida o código em PRs e executa a coleta com `CGU_API_KEY` nos eventos de push relevantes na main, execução manual e agenda diária. A chave fica exclusivamente no GitHub Actions, enviada pelo cabeçalho `chave-api-dados`. É proibido colocá-la na URL, em logs ou em arquivos versionados.

Consulta os **sete dias encerrados anteriores** ao dia atual em `America/Sao_Paulo`. Para cada dia, consulta as fases 1, 2 e 3 (`/despesas/documentos`, com `unidadeGestora=158459`, `dataEmissao`, `fase`, `pagina`). Não presume o tamanho da página: a paginação só é considerada completa ao receber página vazia. O limite operacional é 5 páginas por consulta. Se atingir o limite com documentos, o workflow falha **sem sobrescrever** o JSON anterior.

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
