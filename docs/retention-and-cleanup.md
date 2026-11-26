# Retenção de relatórios e snapshots — operação segura

## Estado e limites

A versão anterior de `data/retention-plan.json` indicou 4.100 HTMLs, com 3.962 candidatos **segundo a política antiga**. Esses números não são um plano de exclusão válido após as novas proteções; regenere a auditoria.

A nova política em `retention.py` preserva:
- a última versão de cada relatório;
- relatórios diários dos últimos 60 dias;
- uma amostra semanal de 61 a 180 dias;
- o primeiro relatório disponível de cada mês ou o primeiro dia útil quando existente, como **candidatos provisórios de fechamento**;
- relatórios do fim de dezembro e início de janeiro (proteção de encerramento/abertura de exercício);
- datas futuras, por segurança.

`RETENTION_HOLIDAYS` aceita datas ISO separadas por vírgulas, como `2026-01-01,2026-04-03`. Não há importação automática do calendário do IFC. As datas presumidas por nome de arquivo não comprovam o período contábil do relatório; esse detalhe exige validação dos dados de origem.

## Auditorias somente leitura

Acesse Actions > **Audit Report Retention** > Run workflow. O workflow executa testes e disponibiliza artefato `retention-audit` por 14 dias.

Alternativamente, em checkout local:

```bash
python -m unittest tests/test_retention.py tests/test_snapshot_retention_audit.py
python retention_audit.py --output retention-html-audit.json
python snapshot_retention_audit.py --output retention-snapshot-audit.json
```

A auditoria de snapshots:
1. lista todos os `data/snapshots/<slug>/*.json`;
2. verifica referências existentes no `data/cache-index.json`, no `data/retention-plan.json` e no `data/index.json`;
3. protege arquivos recentes, de virada de ano, com nome não reconhecido ou referenciados;
4. soma arquivos e bytes por relatório e produz amostra dos candidatos;
5. informa referências a snapshots ausentes, sem alterar arquivos.

O formato e a data do arquivo **não garantem** equivalência de conteúdo. A seleção automática não elimina, por si, toda a necessidade de preservação administrativa e arquivística.

## Exclusão não automática

A exclusão de HTMLs segue desativada em `config.py`: `RETENTION_DRY_RUN=true` e `RETENTION_APPLY_HTML_CLEANUP=false`.

A auditoria de snapshots é somente leitura. A revisão programada usa um manifesto separado para selecionar até 5.000 JSONs legados vazios por lote. A idade mínima corresponde à janela da retenção semanal, de 180 dias na configuração padrão. A seleção exige o marcador `light_snapshot`, a ausência de tabelas e métricas e a conferência da data e do hash. O cache, o índice, as séries publicadas e a virada de exercício protegem os arquivos associados.

A revisão de HTMLs seleciona até 500 arquivos por lote, preservando o índice público e as fontes dos snapshots protegidos. Os workflows guardam os manifestos com SHA-256 e preparam as remoções em uma branch para revisão. A rotina horária de coleta mantém a simulação da limpeza.

## Checklist para uma limpeza aprovada

1. Criar backup verificável de todos os HTMLs e JSONs e manter o commit/manifesto original.
2. Executar auditorias e avaliar os relatórios maiores e os períodos de fechamento.
3. Confirmar a competência contábil e o calendário de feriados e autorizar o descarte conforme as normas aplicáveis.
4. Testar `python validate_baseline.py`, `python validate_data.py` e `python -m unittest discover -s tests`.
5. Aplicar exclusões em pequenos lotes de uma branch, verificando diferenças e referências após cada lote.
6. Regenerar dados a partir dos HTMLs preservados e confirmar a equivalência dos relatórios e gráficos essenciais.
7. Publicar somente após revisão; em falha, reverter o commit (sem reescrever histórico).

**Importante:** remover arquivos do último commit não diminui automaticamente o tamanho do histórico Git. A reescrita do histórico é atividade separada, de risco elevado e não incluída nesta implementação.

## Privacidade

O repositório é público. Evitar versionar artefatos de auditoria com detalhes desnecessários; o workflow publica resultados apenas como artifact temporário. Avaliar se arquivos financeiros de origem devem permanecer publicados.
