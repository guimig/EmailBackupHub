Os scripts acima foram testados e estão funcionais (última atualização em 26/01/2025).

Entretanto, há muito a aprimorar. Especialmente a estrutura do código Python, que está com o código sujo, repetitiva em alguns pontos, merece melhor tratamento das variáveis, e deveria adotar uma estrutura modular de acordo com as melhores práticas de programação.

Erro identificado: a função manage_backups não está deletando os arquivos do repositório. Pode haver um problema com permissões.

Erro identificado: mesmo quando não há alterações, um novo commit está sendo gerado a cada execução em Actions.
