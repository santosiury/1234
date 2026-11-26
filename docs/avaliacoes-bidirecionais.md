# Avaliações bidirecionais protegidas — Fase 2.6

Política aprovada pelo responsável do Omini em 24/11/2026. Implementação preparada na branch `feature/fase-2-6`; não homologada em SQL Server nem em dispositivo nesta entrega. A política substitui a proposta anterior deste documento. A Fase 2.5 permanece documentada como histórico, não como orientação de publicação para o novo fluxo.

## Elegibilidade e janela

- Cliente avalia prestador (`CLIENT_TO_PROVIDER`); prestador avalia cliente (`PROVIDER_TO_CLIENT`). Uma conta com dois perfis não pode avaliar a si própria.
- Apenas `COMPLETED`, com `completedAt` e evento canônico `confirm-completion` do cliente original, vindo de `AWAITING_CONFIRMATION`, na mesma versão/data da conclusão. Solicitação cancelada, rejeitada, pendente, inexistente ou pertencente a terceiros não permite envio.
- Autoria, destinatário e direção derivam da sessão e dos participantes originais no servidor. Payload continua `{ rating, comment? }`; não aceita IDs, direção, datas ou estado escolhidos pelo aplicativo.
- Nota inteira de 1 a 5; comentário opcional até 1.000 caracteres, normalizado, sem HTML, links ou dados pessoais reconhecíveis. É uma camada adicional de validação, não um detector perfeito de identidade.
- A janela começa em `completedAt`, usando UTC do SQL Server, e termina exatamente 14 × 24 horas depois. Envio novo exige `agora < closesAt`; na igualdade já está encerrado. Não começa no primeiro envio e não é prorrogada.
- O primeiro envio fica protegido. Se ambos enviarem antes do prazo, as duas notas são liberadas na mesma transação. Se apenas um enviar, a nota existente é liberada ao terminar o prazo; não se inventa nota para a outra direção.
- Envios são imutáveis. Unicidade `(requestId, direction)` e repetição de conteúdo idêntico devolvem o mesmo comprovante, inclusive após o prazo. Conteúdo diferente resulta em `409 REVIEW_IMMUTABLE`. Uma repetição não é avaliação retroativa nem novo envio.
- Conclusões anteriores à ativação não recebem `ReviewWindow` e não permitem novas avaliações em nenhuma direção. As avaliações históricas já existentes são preservadas integralmente.

## Anonimato permanente e publicação

Liberação da nota no domínio e divulgação da reputação são duas etapas. Ambas as notas são liberadas quando ambos enviam ou no prazo, mas só entram na reputação visível quando há um grupo seguro. O objetivo é impedir que a parte avaliada deduza a nota individual observando o incremento da média.

1. Não há endpoint público de avaliações individuais no novo fluxo. Não se devolvem nome, apelido individual, ID da avaliação, contratação, serviço, cidade, texto livre, data individual, ordem de envio, IDs de autor/destinatário ou confirmação de que a outra parte avaliou.
2. Comentários livres podem mencionar fatos que identificam o serviço mesmo sem nomes. Por isso, **não são publicados nem compartilhados com a contraparte**. Permanecem na base para auditoria interna e no comprovante autenticado do próprio autor. O autor pode rever o conteúdo que enviou; não pode consultar o da outra direção.
3. O comprovante próprio não revela `publishedAt`, `batchId` ou se a outra parte enviou. `protected: true` indica a política aplicável, não o estado de envio da contraparte.
4. A reputação aparece em grupos imutáveis com pelo menos **cinco contas autoras distintas por destinatário e direção**. Cinco serviços da mesma conta não atingem o limiar. Uma sexta nota isolada não altera o agregado já publicado: é preciso outro grupo de cinco autores distintos entre as notas ainda não divulgadas.
5. Antes de um grupo suficiente, a resposta usa `privacyProtected: true`, `average: null`, `total: 0`, distribuição zerada e `items: []`. Esses zeros são valores de supressão, **não informação de ausência de avaliações**. A tela diz “Reputação protegida”, sem diferenciar zero de uma amostra pequena.
6. Quando divulgado, o backend calcula média com decimal (uma casa), contagem real das notas divulgáveis e distribuição 5 → 1. A UI apenas apresenta esses agregados e dimensiona barras proporcionais. Não recalcula média a partir de páginas de comentários.
7. `anonymous: true` mantém `items: []` também para grupos suficientes, desativa paginação de comentários e preserva o formato externo de `ReviewsPage`. Avaliações históricas também usam a projeção agregada protegida após a ativação; os registros e textos originais não são apagados.
8. As rotas usam `Cache-Control: no-store`. Campos pessoais, textos ou saídas SQL não são registrados pelo novo publicador.

**Limite explícito:** supressão, grupos e ausência de metadados reduzem inferência; não garantem anonimato matemático contra conluio de contas, conhecimento externo, observação longitudinal, grupos unânimes, predominância de um autor com vários serviços ou informações já publicadas pela Fase 2.5. Conteúdo histórico já copiado por terceiros não pode ser tornado secreto retroativamente. Não anunciar anonimato absoluto. Não implementamos privacidade diferencial nem detecção avançada de contas combinadas nesta fase.

## Quem pode consultar a reputação do cliente

- `GET /api/reputation/me/client`: o cliente autenticado com perfil ativo consulta o próprio agregado protegido.
- `GET /api/reputation/requests/:id/client`: somente o prestador autenticado originalmente destinatário de uma solicitação desse cliente, com conta/perfil ativos, pode consultar o agregado. O servidor deriva o cliente da solicitação; não existe busca livre por ID do cliente.
- É permitido em `REQUESTED` **antes do aceite**, `ACCEPTED`, `IN_PROGRESS` e `AWAITING_CONFIRMATION`. `CANCELLED`, `REJECTED`, `COMPLETED`, terceiros e identificadores desconhecidos retornam indisponível. Isso limita a consulta à necessidade atual de atendimento. Um novo pedido aberto legítimo restabelece autorização.
- As duas audiências recebem o mesmo limiar de cinco autores e nunca comentários recebidos, nomes ou vínculos individuais.
- Guards de sessão e rate limiting antecedem o serviço. Erros de autorização usam resposta genérica; não revelam a existência de outro cliente/contratação.

## Contratos e funcionamento

| Rota                                      | Comportamento com a política ativa                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/reviews/requests/:id`           | Participante original vê apenas seu comprovante e sua oportunidade; acrescenta `viewer`, `target`, `closesAt`, `protected`. |
| `POST /api/reviews/requests/:id`          | Mesma rota/payload; identifica direção no servidor. Recibo próprio com rótulo genérico de seu papel.                        |
| `GET /api/reviews/providers/:id`          | Agregados anônimos de notas cliente → prestador; perfil precisa estar publicamente elegível.                                |
| `GET /api/provider/me/reviews`            | Mesmo agregado protegido para o próprio prestador, sem privilégios para ver autores.                                        |
| `GET /api/reputation/me/client`           | Agregado próprio do cliente.                                                                                                |
| `GET /api/reputation/requests/:id/client` | Agregado do cliente para o prestador autorizado no pedido aberto.                                                           |

Os campos novos são aditivos. Novos envios com política ativa exigem `X-Omini-Review-Policy: protected-14d-v1`; o aplicativo atualizado envia o cabeçalho fixo automaticamente. Escritores antigos recebem `426 REVIEW_CLIENT_UPDATE_REQUIRED` antes de qualquer acesso ao repositório. Isso declara compatibilidade da interface; não autentica nem identifica o autor. Com política desativada e antes da migration, rotas antigas continuam com os contratos da Fase 2.5 e as novas rotas retornam indisponível. Não ativar a política sem a migration e permissões aprovadas. Após a migration, o trigger bloqueia novas gravações pelo caminho antigo, impedindo regressão para publicação imediata.

## Persistência, concorrência e prazo

Três tabelas novas: `ReviewWindow`, `ParticipantReview`, `ReputationBatch`. FKs `NoAction`, IDs canônicos de `User`, índice e unicidade por direção; checks de nota, não autoavaliação, prazo e tamanho mínimo do grupo. O vínculo composto do grupo impede misturar destinatários/direções.

Na confirmação de conclusão, a API cria a janela na mesma transação Serializable do evento e mudança de status. Nenhum job cria janelas para conclusões antigas. Envios, expiração e liberação bloqueiam a mesma solicitação/janela (`UPDLOCK,HOLDLOCK`). Formação dos grupos bloqueia o destinatário; destinatários são processados em ordem determinística. Conflitos Prisma de unicidade/deadlock são repetidos até duas vezes, depois retornam erro seguro de concorrência.

O publicador interno consulta no máximo 20 janelas vencidas por ciclo, a cada 60 segundos, e retoma grupos pendentes. Não é notificação push. É desligado por padrão, não sobrepõe ciclos e registra apenas mensagem fixa em falhas. Liberação por prazo é eventual (normalmente até um ciclo após o vencimento); o bloqueio de novos envios vale no instante exato, mesmo com publicador parado. A leitura autenticada da própria oportunidade também libera uma janela vencida. Leituras públicas de reputação não escrevem.

O conjunto reputacional é revalidado em SQL: participantes corretos, direção, conclusão e evidência de histórico. Cada grupo compara todos os membros atribuídos e todos os membros ainda elegíveis com entryCount/distinctAuthorCount registrados na publicação. Uma retirada, ausência de publicação ou perda de elegibilidade de qualquer membro oculta o grupo inteiro, inclusive quando ainda restariam cinco ou mais autores. Não se devolvem remanescentes, não se modificam os contadores originais e não se reciclam membros em grupos novos. Atribuição parcial de membros causa falha e rollback da transação. Médias e contagens usam o mesmo conjunto. A autoria permanece interna para autorização, auditoria e prevenção de fraudes; não há avaliação de demonstração neste fluxo.

## Fraude, disputas e moderação

Nesta entrega há proteção contra autoavaliação, terceiros, duplicação, conclusão falsa sem evento, alteração de nota e exposição por amostra pequena. Conta compartilhada, conluio e serviços simulados entre contas distintas exigirão sinais de fraude e operação auditada futura; o código não promete detectá-los automaticamente.

Denúncias, contestação de serviço concluído, recursos e moderação administrativa ficam para integração futura. Não existe endpoint de exclusão ou modificação de notas nesta entrega. Qualquer invalidação futura deve preservar registro original, autoria interna, motivo, ator e trilha de decisão; reavaliar grupos inteiros antes de expor agregados remanescentes. Não transformar cancelamento/disputa em conclusão para gerar reputação.

## Homologação

Ver [corte de versão, recuperação e comandos revisados](fase-2-6-ativacao-segura.md) e [roteiro de interface](fase-2-6-avaliacoes-protegidas.md). Testes com mocks e verificações estáticas não substituem compilação T-SQL, permissões, locks e rollback no SQL Server real. Não aplicar migration no banco principal sem autorização expressa.
