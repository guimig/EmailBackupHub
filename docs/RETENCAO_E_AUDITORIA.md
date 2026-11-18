# Retencao de relatorios e snapshots

## Estado atual

A retencao de HTMLs preserva o mais recente de cada tipo, todos os relatorios dos ultimos 60 dias, um por semana entre 61 e 180 dias, um candidato a fechamento por mes, e documentos de virada de ano. Os fechamentos identificados por nome/data sao **provisorios**: a competencia contabil nao e deduzivel com seguranca apenas do nome do arquivo.

A remocao automatica de HTMLs continua **desligada** por padrao (`RETENTION_DRY_RUN=true`, `RETENTION_APPLY_HTML_CLEANUP=false`). Nao habilitar essas opcoes antes de validar a preservacao institucional, a competencia dos relatorios, as referencias publicas e a regeneracao de `data/reports`, `data/series` e `data/index.json`.

`RETENTION_HOLIDAYS` aceita datas ISO separadas por virgula, por exemplo `2026-01-01,2026-04-03`. Sem esse parametro, o primeiro dia util considera apenas sabados e domingos. O calculo de fechamento por data e indicativo, nao substitui a competencia efetiva do relatorio.

## Auditorias sem exclusao

```sh
python -m pip install -r requirements.txt
python -m unittest discover -s tests -p "test_*retention*.py"
python retention_audit.py --output retention-html-audit.json
python snapshot_retention_audit.py --output retention-snapshot-audit.json
```

O workflow `Audit Report Retention` permite executar as mesmas verificacoes no GitHub Actions e obter os manifestos como artefatos por 14 dias, sem publicacao no site. Os arquivos JSON de auditoria nao contem uma ordem de exclusao.

O inventario de snapshots informa quantidade, tamanho, caminhos ativos, referencias ausentes, candidatos antigos e amostras por relatorio. **Candidato antigo e sem referencia no cache nao significa dispensavel**: snapshots podem ter links historicos externos ou servir para auditoria de versoes. Nao existe opcao `--apply` no auditor.

## Criterios antes de qualquer exclusao

1. Exportar um backup verificavel da versao atual (HTML, JSON, indices, fontes e scripts), separado do historico Git.
2. Confirmar que a fonte oficial institucional guarda os dados que precisam de preservacao.
3. Conferir se relatorios selecionados realmente correspondem a fechamentos mensais/anuais.
4. Comparar dados, somatorios, quantidade de linhas, graficos e filtros antes/depois da regeneracao.
5. Verificar links diretos existentes para `data/snapshots/` e URLs historicas do visualizador.
6. Excluir somente por lotes pequenos, com manifesto completo de hashes e plano de restauracao.
7. Nao reescrever o historico Git sem projeto separado, backup e janela de manutencao.

## Riscos conhecidos

- O gerador ainda conserva entradas antigas em `data/cache-index.json`; uma referencia antiga nao deve ser descartada apenas porque seu HTML deixou de participar da serie atual.
- O historico do Git permanece grande mesmo apos excluir arquivos do checkout.
- As URLs publicas de snapshots podem ser utilizadas externamente, embora nao estejam presentes no indice atual.
- A execucao automatica de `main.py` faz a limpeza HTML antes de regenerar os dados; por isso a flag destrutiva nao deve ser habilitada sem mudar essa ordem e validar o resultado.

## Reversao

As alteracoes estao isoladas na branch `audit/retention-snapshot-safety-20261117`. Nao executar exclusao automatica em producao. Em caso de regressao, nao incorporar a branch ou reverter os commits de codigo; os dados de producao permanecem intocados.
