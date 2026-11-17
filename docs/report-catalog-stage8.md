# Etapa 8 — descoberta automática e favoritos no catálogo

## Visão geral

O catálogo em `dashboard.html` usa exclusivamente `data/index.json`. Qualquer relatório novo gerado a partir de um e-mail e incluído no índice aparece automaticamente, sem cadastrá-lo em JavaScript ou criar uma definição específica para a interface de pesquisa. Os relatórios financeiros já existentes continuam calculados pelas métricas auditáveis definidas anteriormente; um novo `slug` não é somado automaticamente a esses indicadores.

## Novos recursos

- **Favoritos**: o símbolo ☆ ao lado de um relatório permite marcar ou desmarcar. O campo **Mostrar relatórios** oferece “Todos”, “Somente favoritos” e “Novos desde meu último acesso”, combinados com a pesquisa textual, periodicidade e status.
- **Novos relatórios**: na primeira visita, os relatórios já existentes formam a referência inicial. Quando o `index.json` receber novos `slugs`, eles aparecerão como “Novo neste catálogo”, e um aviso permitirá consultar e marcar as novidades como vistas. A sinalização persiste até o usuário marcá-las como vistas.
- **Sem cadastro por relatório**: as regras dependem apenas dos `slugs` presentes no índice publicado, gerado pelo sistema atual. Também funciona quando forem recebidos novos tipos de relatórios.
- **Persistência somente local**: o módulo guarda as listas de slugs conhecidos, novos e favoritos no `localStorage`. Não salva linhas, HTML, saldos, conteúdo de e-mails nem JSON de relatórios; não exige servidor ou permissões adicionais.
- **Privacidade e limitações**: as preferências são específicas de cada navegador, não sincronizadas com outros usuários e podem não sobreviver ao modo privado ou à limpeza dos dados locais. Arquivos locais incompatíveis/corrompidos não são sobrescritos automaticamente.

## Preservação e validação

A página `relatorios.html`, os HTMLs originais, leitura IMAP, geração de relatórios e publicação não foram alterados. O dashboard permanece compatível com métricas RAP auditáveis e com o resumo JSON da etapa 2. A sinalização de “Novo neste catálogo” diz respeito ao **primeiro aparecimento do relatório no índice visto pelo navegador**, e não a um alerta de atualização de seu conteúdo.

Testes:

```bash
node --check assets/js/report-catalog.js
node --test tests/report_catalog_stage8.test.cjs
node tests/dashboard_browser_smoke.cjs
python validate_baseline.py
python validate_data.py
```

No GitHub Actions, as verificações de navegador incluem navegação e favoritos em telas desktop/mobile. A etapa é inteiramente reversível por meio do PR correspondente, sem migração de dados.
