# Etapa 7 — consultas salvas no visualizador

## Objetivo

Permitir voltar a uma consulta do Tesouro Gerencial que já foi preparada com filtros, colunas, ordenação e preferências de leitura, sem configurar tudo novamente. Não cria cópia dos relatórios ou dos dados financeiros.

## Funcionamento

Em `report-viewer.html`, ao final da tabela, expanda **Minhas consultas salvas**. Dê um nome à consulta atual e selecione **Salvar consulta atual**. Para reutilizar, escolha o nome e pressione **Aplicar**. A seção também oferece **Excluir** e **Copiar link da consulta atual** (quando o navegador autorizar a área de transferência).

As configurações são guardadas no `localStorage` do próprio navegador, separadas pelo `slug` do relatório. **Não são sincronizadas com outros computadores, contas ou servidores e não ficam no GitHub.** Os termos pesquisados podem conter informações sensíveis: não salve consultas com dados pessoais em computadores compartilhados, não compartilhe URLs com filtros sensíveis sem avaliar o destinatário.

São guardadas somente as preferências: termo da busca, filtros tipados, seleção e largura de colunas, ordenação, agrupamentos opcionais, seleção de totais, quebra de texto e linhas por página. Nenhum registro, valor de saldo, CPF, conteúdo de JSON ou e-mail é duplicado no armazenamento como dado de origem. O limite é de 12 consultas por relatório e nome de até 60 caracteres.

## Resiliência a relatórios novos e atualizados

A configuração de cada coluna é salva por **nome de cabeçalho**, não por posição. Quando o Tesouro Gerencial reordena colunas, a consulta conserva os filtros associados aos nomes corretos. Se alguma coluna desaparecer, suas regras deixam de ser aplicadas e o usuário recebe uma mensagem. Não é preciso configurar cada novo `slug`: o mesmo módulo `report-viewer-presets.js` atende a qualquer relatório válido.

Se o navegador negar o armazenamento, estiver em modo privado ou encontrar um arquivo de preferências ilegível, mostra uma mensagem e mantém o visualizador funcionando. A aplicação não apaga silenciosamente preferências ilegíveis.

## Compatibilidade

Os links antigos `fN` e os links atuais `tfN`, a exportação de todos os registros filtrados, as competências contábeis 013/014, os dados auditáveis RAP e o HTML original permanecem inalterados.

## QA e reversão

```bash
node --check assets/js/report-viewer-presets.js
node --test tests/report_viewer_presets_stage7.test.cjs
node tests/viewer_browser_smoke.cjs
```

O GitHub Actions executa também os regressivos de Python, JavaScript e navegador. A alteração pode ser revertida sem migração ou alteração de arquivos financeiros, pois somente o navegador do usuário mantém as preferências.
