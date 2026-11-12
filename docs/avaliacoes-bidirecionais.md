# Proposta futura: avaliações bidirecionais

**Especificação para depois da conclusão real das solicitações na Fase 2.4. Não implementada nesta entrega.** Não existem novos endpoints, tabelas, migrations, cálculos de reputação ou regras de avaliação em execução. As estruturas de avaliação abaixo continuam propostas; a vinculação usa agora o domínio de solicitações implementado na Fase 2.4, ainda pendente de aplicação revisada no banco e validação física.

## Condições para iniciar

A Fase 2.4 deve primeiro estabelecer participantes imutáveis, conclusão verificável, histórico de transições e tratamento de disputas. Um botão ou payload do aplicativo dizendo que o serviço foi concluído não é prova suficiente. A conclusão deve ser autorizada pelo fluxo real de solicitação, com evidência/auditoria e possibilidade de contestação.

Cada solicitação elegível deve identificar uma conta cliente e uma conta prestadora distintas, com perfis pertencentes a essas contas. Ter ambos os perfis na mesma conta não permite contratar/avaliar a si próprio. Nenhuma avaliação poderá nascer de serviços apenas anunciados no catálogo, demonstrações, solicitações canceladas, pendentes ou inexistentes.

## Vínculo com os modelos reais da Fase 2.4

A fonte canônica é `ServiceRequest.id`. Participantes imutáveis: `clientUserId` e **`providerUserId`** (IDs de `User` distintos), `providerId` (`ProviderProfile`) e `providerServiceId` (`ProviderService`). Não inferir o destinatário pelo proprietário atual do anúncio nem aceitar esses IDs do payload de avaliação. `serviceTitleSnapshot`, `clientNameSnapshot` e `providerNameSnapshot` preservam o contexto original, sem autorização para publicá-los automaticamente.

Elegibilidade futura exige `status = COMPLETED`, `completedAt` não nulo e evento `ServiceRequestEvent` com `action = confirm-completion`, `newStatus = COMPLETED`, `actorUserId = clientUserId` e versão correspondente. `propose-completion`/`AWAITING_CONFIRMATION` não autorizam avaliação. O histórico append-only usa `requestId`, `version`, `previousStatus`, `newStatus`, `occurredAt` e `reason`; uma criação/transição por versão. Datas vêm do servidor SQL em UTC. O código atual torna COMPLETED final, e reabrir é permitido apenas antes da confirmação final; eventual revogação/disputa posterior requer novo domínio auditado, ainda não implementado.

`Review.requestId` e `ReviewWindow.requestId` deverão referenciar **`ServiceRequest.id`** com FKs NoAction. Direção cliente → prestador deriva autor de `clientUserId` e destinatário de `providerUserId`; direção inversa troca esses dois IDs. Média pública deve agrupar as avaliações válidas recebidas pelo `providerId`/conta original de forma consistente, sem misturar o que o prestador escreveu. Criar unicidade `(requestId,direction)` e validar elegibilidade/participação na mesma transação de envio. Campos relacionados à conclusão/disputa não devem ser copiados do mobile.

O início da janela futura usa `ServiceRequest.completedAt`. Listas públicas nunca expõem IDs de usuário/solicitação, descrição do atendimento, motivos de reabertura ou localização. As APIs privadas de solicitações atuais só retornam nomes preservados e o papel do autor do evento; não devem ser transformadas em fonte pública de reputação. Ver [modelo, estados e implantação da Fase 2.4](fase-2-4-solicitacoes.md).

## Política proposta

| Tema          | Proposta a validar antes da implementação                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direções      | Cliente → prestador e prestador → cliente, independentes e vinculadas à mesma solicitação.                                                            |
| Nota          | Inteiro de 1 a 5, obrigatório. Não aceitar zero, decimais, valores ausentes ou fora do intervalo.                                                     |
| Comentário    | Opcional, texto simples, até 1000 caracteres, sem HTML executável ou dados pessoais de terceiros.                                                     |
| Elegibilidade | Solicitação atualmente concluída pelo fluxo autorizado; autor e destinatário são seus participantes canônicos.                                        |
| Unicidade     | Uma avaliação por direção e solicitação, inclusive se depois ocultada ou invalidada.                                                                  |
| Autoria       | Derivada do usuário autenticado e dos participantes da solicitação. O cliente da API não escolhe `authorId`, `subjectId` ou direção livremente.       |
| Autoavaliação | Proibida quando as contas do autor e destinatário forem iguais, mesmo com perfis diferentes.                                                          |
| Edição        | Proposta inicial: avaliação enviada é imutável. Retificações passam por processo auditado; não permitem reescrever a nota após ver a contraparte.     |
| Ausência      | Sem avaliações públicas válidas: `average: null`, `count: 0`. Não apresentar nota zero, média padrão, estrelas preenchidas ou comentários de exemplo. |

A escolha de prazos, recursos e moderação é uma decisão de produto ainda pendente. As regras desta seção são especificação, não mudanças no funcionamento atual.

## Publicação simultânea e prazo

Proposta: janela de **14 dias corridos desde `completedAt`**, usando UTC e relógio do servidor. O prazo começa na conclusão, não no primeiro envio. Isso impede que a primeira avaliação prorrogue a janela estrategicamente.

1. O primeiro envio fica selado. O autor pode consultar seu próprio comprovante e conteúdo, sem conhecer existência, nota ou texto da avaliação da outra parte.
2. Se ambos enviarem dentro da janela, publicar as duas avaliações atomicamente, sujeitas à moderação. Antes disso, nenhuma delas entra em médias, contagens, listagens ou notificações com conteúdo.
3. Ao expirar a janela, publicar a avaliação existente se válida, mesmo que a outra parte não tenha enviado. Não gerar uma segunda nota, penalidade ou avaliação automática.
4. Após o prazo, encerrar novos envios para a solicitação. O caso-limite entre o segundo envio e o job de publicação deve usar o mesmo lock/transação e horário do banco.
5. Publicação deve ser idempotente. Um worker pode retomar jobs interrompidos; notificações futuras usam outbox e identificador único, sem publicação duplicada.

Se uma avaliação aguardar moderação, não publicar a outra antecipadamente para pressionar a parte. Após o prazo, publicar apenas o conteúdo liberado, sem revelar o conteúdo retido ou a identidade de quem denunciou. Revogação da conclusão ou disputa relevante antes da publicação suspende a liberação até resolução; preservar os registros para auditoria.

## Modelagem incremental SQL Server / Prisma

O modelo `ServiceRequest` foi implementado na Fase 2.4. Depois de sua implantação revisada e validação real, revisar o desenho abaixo e criar **apenas migrations incrementais**, sem recriar OminiDB, apagar registros existentes ou alterar as oito categorias.

| Entidade proposta | Campos e restrições principais                                                                                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReviewWindow`    | `requestId` único/FK, `completedAt`, `closesAt`, `releasedAt` opcional, estado da janela e versão de concorrência. Uma janela por solicitação.                                                       |
| `Review`          | `id`, `requestId`, `direction`, `authorUserId`, `subjectUserId`, `rating`, `comment` opcional, estado de publicação/moderação, `submittedAt`, `publishedAt`, motivo interno de invalidação e versão. |
| `ReviewReport`    | Avaliação, denunciante autenticado, motivo tipado, descrição opcional limitada, estado de tratamento e datas; deduplicação por avaliação/denunciante conforme política.                              |
| Auditoria/outbox  | Ator autorizado, transição, motivo, data UTC e identificador idempotente. Evitar cópia irrestrita de conteúdo ou informações pessoais nos logs. Reutilizar infraestrutura da Fase 2.4 se existir.    |

Tipos sugeridos: IDs `UniqueIdentifier`; datas `DateTime2` com valores UTC gerados no servidor; nota `Int @db.TinyInt`; comentário `NVarChar(1000)`; estados/direções como strings limitadas com `CHECK` explícito. O provider SQL Server do Prisma não suporta enums Prisma: não propor um enum incompatível.

Restrições a revisar na migration futura:

- `UNIQUE(requestId, direction)` impede duplicidade inclusive em envios concorrentes. Ocultar não libera a chave para nova avaliação.
- `CHECK(rating BETWEEN 1 AND 5)`, `CHECK(authorUserId <> subjectUserId)` e `CHECK` de direções/estados autorizados. Nenhum valor de demonstração como default.
- FKs com `onDelete: NoAction` e `onUpdate: NoAction`, evitando exclusões em cascata e múltiplos caminhos de cascata do SQL Server.
- Verificar participantes e status em transação: `CHECK` não consulta outra tabela no SQL Server. Não alegar que um `CHECK` sozinho comprova conclusão ou autoria. A possibilidade de trigger/procedure restrita para reforçar gravações fora da API deve ser avaliada com o modelo real da Fase 2.4.
- Serializar envio, conclusão/revogação e publicação pelo mesmo registro de solicitação/janela. Usar isolamento e locks apropriados, como `Serializable` e acesso parametrizado com `UPDLOCK, HOLDLOCK` se necessário; tratar deadlocks com repetição limitada e idempotente. Nunca concatenar valores do usuário em SQL.
- Criar índices para `(subjectUserId, direction, publicationState, moderationState, publishedAt, id)`, para avaliações do autor e para jobs por prazo/estado. Paginar comentários; não carregar histórico inteiro para calcular média no aplicativo.

Preservar `schema.prisma` com `provider = "sqlserver"` e `migration_lock.toml` com `provider = "mssql"`. A migration futura será gerada/revisada em ambiente apropriado, conferida quanto a perda de dados e testada contra uma cópia de segurança antes de aplicação. Nunca usar `db push`, reset ou migrations no startup para essa implantação.

O usuário runtime `omini_app` continuará sem `db_owner`, `db_datawriter` ou privilégios administrativos. O script futuro de permissões deve conceder acesso somente às novas tabelas/operações necessárias. Não conceder `DELETE` para avaliações; separar privilégios de envio, publicação/moderação e migration conforme os processos/identidades adotados. A identidade de migration permanece distinta. Nenhum script de permissões é alterado agora.

## Média e quantidade

A reputação pública do prestador usa somente a direção cliente → prestador, publicada, válida e vinculada a solicitação elegível. Não misturar avaliações que o prestador escreveu com as que recebeu. A reputação do cliente usa a direção contrária, com exposição restrita conforme a seção de privacidade.

A API calcula a média e a contagem a partir do mesmo conjunto filtrado. No SQL Server, converter a nota para decimal antes de `AVG`: a média de valores inteiros sem conversão pode perder casas decimais. Arredondamento de apresentação não altera as notas armazenadas. A contagem não é o tamanho da página de comentários.

Inicialmente, preferir consulta agregada consistente à duplicação de contadores. Se houver necessidade comprovada de cache/summary, manter atualização transacional ou recomposição idempotente, com invalidação após moderação e testes contra divergência. Não somar duas vezes em retries. Considerar o mesmo snapshot de publicação para resumo e comentários; alterações concorrentes podem exigir revisão/cursor da leitura.

Avaliações ocultadas, fraudulentas ou invalidadas deixam de compor a média e contagem. Não apagar a trilha nem reduzir contadores manualmente sem recomputação consistente. Conclusão revogada deve suspender sua contribuição até decisão auditada. `average = null` continua sendo ausência, e não uma nota ruim.

## Autorização, fraude e privacidade

- Guard JWT e sessão ativa nos envios e consultas privadas; verificar participação no servidor em cada operação. Conhecer um UUID não autoriza acesso.
- Proteção contra IDOR e enumeração: responder de forma consistente a solicitações não acessíveis; não revelar se outra pessoa já avaliou, nem seus dados selados.
- Rate limiting por conta/sessão e IP, limites de payload e chave de idempotência vinculada ao autor/solicitação. A constraint única continua sendo a defesa final contra concorrência.
- Dificultar conluio/Sybil a partir do fluxo real de conclusão, sinais de repetição de pares, criação massiva de contas e padrões anômalos. IP compartilhado ou pouca atividade, isoladamente, não devem gerar condenação automática. Sinais de dispositivo precisam de necessidade, transparência, minimização e retenção limitada; não coletar localização ou identificadores invasivos por conveniência.
- Não permitir avaliações compradas, feitas por terceiros, pelo próprio profissional ou por contas sob controle comum para manipular reputação. Suspeitas devem ser auditáveis e passíveis de recurso, sem publicar uma acusação automaticamente.
- Comentários em texto simples, renderizados com escaping; limitar spam e conteúdo abusivo. Não registrar tokens, senhas, endereços de atendimento ou o comentário inteiro em logs operacionais.
- Perfil público do prestador recebe apenas avaliações recebidas e publicadas, com nome público/abreviado autorizado do autor e dados mínimos. Não expor IDs internos de solicitação/usuário, e-mail, telefone, localização exata ou notas ainda seladas.
- Avaliações do prestador sobre clientes ficam inicialmente em consultas autenticadas e autorizadas, com propósito e escopo restritos. Não criar um diretório público de reputação de clientes sem política de privacidade e consentimento adequados.
- O autor pode consultar o que escreveu em área privada. A API pública não retorna avaliações dadas pelo prestador nem dados privados para o frontend esconder. Filtrar na UI é defesa adicional, não controle de acesso.
- Definir retenção, anonimização, atendimento de direitos do titular e acesso de moderadores conforme a finalidade. Desativar conta não autoriza apagar silenciosamente a integridade de solicitações ou auditoria; definir política explícita para anonimização e reputação remanescente.

## Disputas, denúncias e moderação

Permitir denúncia autenticada com motivo objetivo, inclusive exposição de dados pessoais, ameaça, conteúdo discriminatório, fraude ou avaliação sem serviço elegível. Evitar relatórios duplicados e denúncias em massa usadas para apagar críticas legítimas.

Avaliação negativa por si só não é infração. Definir revisão proporcional ao risco, prazo operacional, recurso e motivos claros. Moderadores usam permissões separadas e auditadas; não editam a nota de um participante para favorecer outra parte. Se um comentário exigir redação/ocultação por dados pessoais, preservar evidência restrita e registrar motivo, autoria da decisão e impacto na reputação. Se a avaliação inteira for inválida, retirá-la do agregado e manter a unicidade histórica.

Não expor a identidade do denunciante, detalhes de uma disputa ou conteúdo removido em respostas públicas. Reversões e republicações precisam atualizar resumo/listagem de forma idempotente.

## API futura proposta — ainda inexistente

| Endpoint proposto                                | Autorização e conteúdo                                                                                                                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/requests/:requestId/reviews`          | JWT, participante elegível. Body somente `rating` e `comment` opcional. Direção/autor/destinatário derivados no servidor; rejeitar campos extras. Retornar apenas o próprio comprovante, sem informação sobre a contraparte selada. |
| `GET /api/requests/:requestId/my-review`         | JWT e participação. Próprio conteúdo/estado e prazo; não divulgar envio/conteúdo da outra parte antes da publicação.                                                                                                                |
| `GET /api/me/reviews`                            | JWT; paginação e filtro recebido/enviado, com escopo definido pelo usuário e direção, sem aceitar identidade arbitrária como autorização.                                                                                           |
| `GET /api/catalog/providers/:providerId/reviews` | Público, paginado, resumo consistente `{average: number ou null, count}` e comentários publicados mínimos. Rate limiting de leitura e ordenação determinística por data/id.                                                         |
| `POST /api/reviews/:reviewId/reports`            | JWT, motivo validado, deduplicação e limite de tentativas.                                                                                                                                                                          |
| Operações de moderação                           | API/permissão administrativa futura, auditada e independente das credenciais normais. Não faz parte do painel atual.                                                                                                                |

Respostas devem distinguir validação, autenticação, indisponibilidade e conflito de forma segura: por exemplo, 400/422 para nota/comentário inválido, 401 para sessão inválida, 404 consistente para recurso não acessível, 409 para avaliação já enviada/estado incompatível e 429 para excesso de tentativas. Repetir a mesma chave idempotente com o mesmo payload retorna o mesmo resultado; mudar o payload sob essa chave é conflito. Swagger, logs sanitizados e política de erros serão parte da implementação futura.

Não adaptar o DTO público existente agora. A futura integração precisará de contratos compartilhados revisados, parsing estrito e um adapter para o estado visual, sem suposições sobre dados ausentes ou confiança em campos fornecidos pelo dispositivo.

## Integração visual preparada agora

`ReviewsSection` é um componente de apresentação local, sem HTTP ou armazenamento. Seus tipos aceitam estados indisponível/vazio, carregamento, erro e dados recebidos futuramente: média, quantidade, comentários recebidos e comentários enviados. Não calcula média nem usa a quantidade de comentários como contagem. No perfil público, a apresentação de comentários enviados fica desabilitada; a API futura também deverá omiti-los.

Todos os pontos de uso atuais omitem dados e mostram **Ainda não há avaliações.** A frase do perfil próprio é **Depois de realizar serviços pelo Omini, seus clientes poderão avaliar seu atendimento.** No perfil público, a explicação usa a perspectiva de quem consulta o profissional. Não há botão para enviar, estrelas preenchidas, exemplos em produção ou chamada a endpoint de avaliações. Fixtures numéricas existem somente nos testes isolados do contrato visual, sem aparecer no catálogo.

## Plano de testes para a implementação futura

- Autorização: anônimo, sessão expirada/revogada, conta desativada, não participante, UUID de outro usuário, autor/destinatário/direção forjados e acesso público ao conteúdo selado.
- Integridade: notas 0/6/decimais/nulas, comentário acima do limite, autoavaliação com dois perfis da mesma conta, pedido não concluído/cancelado e alteração concorrente do status.
- Concorrência: duas inserções da mesma direção, duas direções simultâneas, retry após timeout, mesma chave com payload diferente e corrida entre envio e fechamento da janela.
- Publicação: antes/depois dos 14 dias, ambos enviando, apenas um enviando, nenhum enviando, reinício do worker e moderação pendente. Nenhum estado público deve denunciar o envio selado da contraparte.
- Agregados: média decimal correta, contagem independente da paginação, separação das direções, ocultação/invalidação/republicação, ausência (`null`/0) e consistência de cache caso adotado.
- Privacidade: DTOs públicos sem PII/IDs internos/conteúdo dado privado, comentário com HTML/controles, denúncia não pública, recurso e trilha de auditoria restrita.
- SQL Server real: constraints, FKs sem cascade, locks/deadlocks, índices, permissões runtime mínimas e preservação do banco/categorias existentes. Migrations devem ser incrementais e verificadas numa cópia; essa validação não será substituída apenas por mocks.
- Mobile: oportunidade apenas após conclusão autorizada, duas direções, estados de rede/sessão/erro, idempotência, fontes ampliadas e VoiceOver. Somente então integrar os dados reais ao componente preparado.

A liberação depende da Fase 2.4 concluída, decisões de produto/privacidade aprovadas e esses testes executados. Este documento não autoriza criar migrations, endpoints ou regras de avaliação na entrega atual.
