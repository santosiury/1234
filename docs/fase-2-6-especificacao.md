# Omini — Especificação proposta da Fase 2.6

Status: **escopo funcional aprovado pelo responsável em 21/11/2026: encerramento motivado, reputação visual, avaliação bidirecional e notificações push remotas; em 22/11/2026 foram acrescentadas a ocultação do diagnóstico de API e a regra de cancelamento unilateral por ambos os participantes; implementação pendente**. Documento de planejamento, **não** equivale a código entregue ou migration aplicada.

Base técnica: continuidade da branch `feature/fase-2-5-contato-avaliacoes` (NestJS + Prisma/SQL Server, React Native/Expo SDK 58). Omini mantém contratação direta entre cliente e prestador; sem comissão, gerenciamento de orçamentos ou pagamentos dos serviços. A Fase 2.5 teve migrations, permissões, API principal, testes de contato e avaliações e conexão pelo iPhone validados em ambiente local em 22/11/2026; os fluxos completos com gravação haviam sido validados em OMINI_TEST. Isso não equivale a publicação pública do app. A atualização coordenada das dependências Expo SDK 58 permanece pendente e deve ter regressão própria antes de qualquer release.

## 1. Cancelamento autônomo e motivado de atendimento

### Decisão de produto atualizada pelo responsável em 22/11/2026
**Cliente e prestador têm autonomia individual para cancelar/encerrar a continuidade do atendimento sem depender da autorização, confirmação bilateral ou concordância da outra parte.** A proposta anterior de confirmação bilateral em `IN_PROGRESS` foi rejeitada expressamente. A ausência de acordo, o trabalho parcialmente realizado ou uma divergência não podem prender uma pessoa à relação contratual dentro do aplicativo.

### Estados e autores
| Estado atual | Cliente | Prestador | Comportamento |
| --- | --- | --- | --- |
| `REQUESTED` | Cancelar | Recusar | Preservar compatibilidade existente |
| `ACCEPTED` | Cancelar | Cancelar | Cancelamento unilateral motivado |
| `IN_PROGRESS` | Cancelar | Cancelar | Cancelamento unilateral motivado, mesmo com execução parcial |
| `AWAITING_CONFIRMATION` | Cancelar | Cancelar | Cancelamento unilateral motivado; não tratar como conclusão confirmada |
| `COMPLETED` | Não | Não | Manter conclusão histórica; sem cancelamento retroativo |
| `CANCELLED`, `REJECTED` | Não | Não | Estados finais, exceto recuperação idempotente |

- Reutilizar o estado final `CANCELLED` para continuidade encerrada, registrando motivo e contexto; avaliar a nomenclatura **“Atendimento encerrado”** na interface quando houver trabalho parcial. Nunca inferir “nenhum trabalho ocorreu” apenas de `CANCELLED`.
- O usuário toma a decisão unilateral: selecionar motivo, confirmar uma vez e receber sucesso após commit; **sem aceite da contraparte**. A outra parte apenas recebe informação e pode consultar o histórico.
- Não bloquear cancelamento por existir `startedAt`, evento `start`, `propose-completion`, alegação de trabalho parcial ou divergência. Essas informações determinam contexto/auditoria, não direito de veto.
- **Não** alterar `COMPLETED`, apagar trabalhos/avaliações passados ou inferir renúncia a pagamentos, indenizações, direitos ou deveres. O Omini não adjudica execução, pagamento ou culpa; possível disputa/contestação será tratada em módulo próprio futuro.
- Se já houve conclusão proposta (`AWAITING_CONFIRMATION`), preservá-la no histórico como alegação de uma parte, sem convertê-la automaticamente em `COMPLETED`; cancelamento não significa confirmação ou recusa jurídica do serviço.
- Cancelamento impede novas consultas do contato pelo aplicativo e novas avaliações **no fluxo atual que exige `COMPLETED`**, mas não apaga contato previamente obtido, nem altera avaliações históricas legítimas. Avaliar em fase futura como lidar com abuso de cancelamento unilateral para evitar reputação.
- Notificar a outra parte pelo canal interno e push (quando implementado), sem depender do sucesso da notificação para concluir a operação.

### Motivo de escolha única e contexto de execução
- Campo `reasonCode` obrigatório e validado no backend para novos cancelamentos após aceite; motivo **não pré-selecionado** e apenas uma opção por evento.
- Primeira opção em ambos os perfis: **“Não chegamos a um acordo sobre o valor”**.
- **Outro motivo** requer texto aparado entre **10 e 500 caracteres**, sujeito a controles de privacidade, sanitização e validação.
- Motivos do **cliente** (propostos): `NO_PRICE_AGREEMENT` (primeira), `DEADLINE_NOT_SUITABLE`, `SERVICE_MISMATCH`, `PROVIDER_UNAVAILABLE`, `NO_LONGER_NEEDED`, `OTHER_TERMS_NO_AGREEMENT`, `OTHER`.
- Motivos do **prestador** (propostos): `NO_PRICE_AGREEMENT` (primeira), `SCOPE_MISMATCH`, `SCHEDULE_CONFLICT`, `UNABLE_TO_PERFORM`, `OTHER_TERMS_NO_AGREEMENT`, `OTHER`.
- Em `IN_PROGRESS` ou `AWAITING_CONFIRMATION`, apresentar campo de contexto estruturado: **nenhum trabalho realizado / trabalho parcial realizado / trabalho integral alegado / situação contestada ou não sei informar**. O campo não condiciona o direito de cancelar; registra apenas declaração do autor, sem presumir concordância da outra parte.
- Registrar contexto/declaração de execução, ator, motivo e data UTC em evento auditável. Não expor relatos em catálogo ou avaliações públicas. Não confundir a declaração unilateral com prova objetiva.
- Antes de confirmar, apresentar mensagem clara de que o cancelamento interrompe a continuidade do atendimento no Omini, não comprova inexistência de execução e não resolve obrigações financeiras.
- O formulário permite cancelar sem contato direto com a contraparte e mostra confirmação amigável do resultado.

### Contratos/API, segurança e persistência
- Verificar autenticação e vínculo imutável do participante; autorização é função de **estado + perfil + ação** (não liberar `cancel` a prestador em `REQUESTED`).
- Preferir compatibilidade com `POST /api/requests/:id/cancel` para o cancelamento motivado; manter leituras e recibos idempotentes históricos da Fase 2.5. Os clientes antigos que não fornecem novos dados exigem uma política de compatibilidade explícita antes do rollout.
- Validar versão, chave idempotente e payload. Em corrida com conclusão, inicio ou cancelamento da outra parte, apenas uma transição vence; repetir requisição idêntica recupera o resultado, payload distinto deve gerar conflito seguro.
- Atualizar estado, `cancelledAt`, versão, evento de auditoria e motivo em transação serializável, sem apagar `acceptedAt`, `startedAt`, `completionProposedAt` ou histórico. Não preencher `completedAt` ao cancelar.
- **Migration nova, nunca editar migrations históricas**: campo opcional de código de motivo no evento e persistência do contexto de execução (preferir campos estruturados próprios, com compatibilidade retroativa).
- A constraint SQL `ServiceRequestEvent_transition_check` da Fase 2.4 proíbe `IN_PROGRESS → CANCELLED` e `AWAITING_CONFIRMATION → CANCELLED`. Uma migration de evolução deverá **substituir controladamente a constraint**, mantendo todas as transições antigas e acrescentando exatamente as novas, com `WITH CHECK CHECK CONSTRAINT`, transação e regressão. A substituição de constraint é alteração de esquema necessária, ainda que não exclua dados; documentar essa exceção ao princípio de migrações estritamente aditivas.
- Restringir alterações e consultas a quem participa, validar texto de entrada e proibir vazamento de dados privados. Auditar sem permitir alteração ou exclusão dos eventos antigos.

### Plano e testes
1. Implementar contratos, validações e testes de domínio sem banco principal.
2. Implementar backend e persistência, nova migration e verificações de schema em ambiente isolado, sem afetar a instância principal.
3. Interface de seleção única, contexto de execução, aviso, confirmação, atualização imediata do status e histórico para ambos os perfis.
4. Testar `REQUESTED`, `ACCEPTED`, `IN_PROGRESS`, `AWAITING_CONFIRMATION`, finais, execução parcial, divergência, simultaneidade, autorização, idempotência, rollback, contato, avaliação e compatibilidade antiga.
5. Validar migrations **somente em `OMINI_TEST`, porta 15433**, após checagem explícita da instância e autorização; jamais aplicar automaticamente em `OMINI`/1433. Comparar dados e permissões antes/depois.
6. Testar iPhone/Android, erros de rede, múltiplos toques, perfis distintos, acessibilidade, notificações internas e eventual push.
7. Implantar no principal apenas após testes, revisão e **autorização expressa** do responsável.

## 2. Reputação e avaliação visual no estilo Uber

### Requisitos aprovados
- Exibir média real e quantidade no card de busca e perfil do prestador: **⭐ 4,9 (127 avaliações)** como **exemplo ilustrativo**, nunca valor fixo.
- Exibir a seleção de 1 a 5 estrelas como affordance clara ao cliente após a conclusão; manter opção de avaliar posteriormente pelo histórico, sem obrigar o cliente e sem modal intrusivo.
- Mostrar nota e contagem obtidas da API de avaliações reais; **nenhuma nota fictícia**. Para zero avaliações, mostrar "Ainda não há avaliações", sem `0,0` ou estrela sugerindo reputação.
- Apresentar média com uma casa decimal no padrão pt-BR (`4,9`, `5,0`). Média calculada no backend sobre registros válidos existentes; mobile apenas formata.
- Manter comentários, datas, paginação e pseudônimo público existentes; sem telefone, e-mail ou IDs privados nos cards.
- Manter regra da Fase 2.5: **uma avaliação imutável por solicitação validamente `COMPLETED`**, com `confirm-completion` autêntico; publicação idempotente, diferenças retornam HTTP 409.
- Não permitir avaliação para `CANCELLED`, `REJECTED`, `IN_PROGRESS` ou solicitações encerradas por falta de acordo.

### Pontos de UI
1. Card de resultado de busca e perfil público: estrela pequena + nota + contagem clicável/âncora para comentários.
2. Detalhe concluído: convite voluntário "Avalie o atendimento"; ao tocar, tela intuitiva de 1..5 estrelas, comentário opcional, botão de publicar, confirmação da imutabilidade.
3. Painel do prestador: média/contagem e avaliações recebidas coerentes com o perfil público.
4. Estados: sem avaliações, carregando, offline, erro, paginação e grande fonte; áreas de toque acessíveis.

### Testes de aceitação
- Cadastrar duas avaliações de teste 5 e 4 estrelas em solicitações válidas distintas -> média 4,5 e total 2 no catálogo, perfil público e painel.
- Duas notas 5 -> média 5,0; total 2. Média nunca hardcoded.
- Sem avaliações -> estado vazio sem nota inventada.
- Após publicar -> formulário indisponível no mesmo pedido; reenvio igual retorna original e diferente retorna 409.
- Encerramento por desacordo não abre avaliação.
- Conferir formatação pt-BR, acessibilidade e layout em iPhone/Android.

## 3. Avaliações bidirecionais — cliente e prestador

### Novo escopo aprovado pelo responsável
Além da avaliação já implementada **cliente → prestador** na Fase 2.5, a Fase 2.6 deverá permitir **prestador → cliente**, com avaliações independentes vinculadas à mesma solicitação validamente concluída. A reputação do prestador **nunca** mistura avaliações enviadas por ele; a reputação recebida pelo cliente permanece separada e com visibilidade limitada.

Regras de produto:
- Somente após `COMPLETED` com `completedAt` e evidência real do evento `confirm-completion` pelo cliente. Solicitações `REQUESTED`, `ACCEPTED`, `IN_PROGRESS`, `AWAITING_CONFIRMATION`, `CANCELLED`, `REJECTED` e encerradas por desacordo são inelegíveis.
- **Uma avaliação por direção e por solicitação**, nota inteira de 1 a 5, comentário opcional até 1.000 caracteres, sem dados pessoais, HTML ou links. As publicações devem ser imutáveis e idempotentes, com unicidade no SQL Server.
- Apenas os participantes originais autenticados podem avaliar; `authorUserId`, `subjectUserId` e direção são derivados no servidor, nunca informados arbitrariamente pelo aplicativo. Autoavaliação, inclusive por dois perfis da mesma conta, é proibida.
- Tela do prestador deve oferecer **Avaliar cliente** após a confirmação legítima de conclusão; o cliente mantém **Avalie o atendimento**. Convidar sem obrigar; permitir retorno pelo histórico.
- Exibir separadamente avaliações recebidas e enviadas na área privada, com proteção de identidade e dados pessoais. **Não criar diretório público de notas de clientes nesta fase** sem política e autorização próprias; reputação do cliente é restrita às superfícies legitimamente autorizadas e minimizada.
- Preservar e tornar compatíveis todas as avaliações existentes da Fase 2.5 em `ServiceReview`, sem edição, deleção, recalculá-las indevidamente ou fabricar avaliação inversa. Propor migration aditiva somente após revisão de modelo e T-SQL em instância isolada.

### Decisão de publicação e reciprocidade ainda necessária
O documento pré-existente [Proposta de avaliações bidirecionais](avaliacoes-bidirecionais.md) descreve **janela de 14 dias e avaliações seladas até ambos avaliarem ou o prazo terminar**, para impedir retaliação. Essa política **não é implementação existente nem foi explicitamente escolhida pelo responsável**. É a recomendação de design a submeter antes da codificação.

A avaliação cliente → prestador da Fase 2.5 é publicada imediatamente. Para adicionar publicação selada a novas avaliações, definir estratégia de transição **sem reter, esconder ou alterar retroativamente** as duas avaliações já publicadas nem mudar silenciosamente os contratos legados. Considerar compatibilidade de mobile/API e publicação idempotente por job/outbox se adotado; testar fluxo com uma e duas partes enviando, prazo expirado e concorrência. Se a opção de publicação imediata for escolhida, documentar riscos de retaliação e mitigação.

### Arquitetura e testes de aceite
- Contratos compartilhados de direção, autoria e elegibilidade; API/guards de ambas as partes; SQL Server com constraints, FKs `NoAction`, índices e permissões mínimas. Evitar permissões de UPDATE/DELETE sobre avaliações.
- API pública de prestadores continua mostrando **somente** avaliações recebidas dos clientes; avaliações inversas ficam em endpoints autorizados. Média decimal, total e paginação consistentes.
- Testar duas avaliações distintas da mesma solicitação concluída (uma por parte), reenvio idempotente, tentativa de alterar nota (409), outra conta (404/403 seguro), status inválido e término sem acordo; ausência de dados pessoais nas respostas.
- Testar iPhone/Android, mudança de conta, sessão expirada, rede instável, repetição de toque e nenhum envio duplicado.

## 4. Notificações push remotas — aplicativo aberto, segundo plano e fechado

### Escopo aprovado
Implementar **notificações push reais** para cliente e prestador quando o Omini estiver em primeiro plano, em segundo plano ou fechado, sujeitas a permissões e às condições dos sistemas operacionais/rede. O usuário **não precisa manter o aplicativo aberto** para receber notificações elegíveis. A entrega é de melhor esforço — Apple/Google/provedor de push podem atrasar ou não entregar mensagens; não prometer chegada instantânea ou exatamente uma vez.

Eventos iniciais de notificação:
- **Prestador**: nova solicitação recebida; cancelamento/encerramento motivado pelo cliente; confirmação de conclusão ou reabertura pelo cliente quando relevante.
- **Cliente**: solicitação aceita ou recusada; prestador informou conclusão e aguarda confirmação; atendimento encerrado pelo prestador; outras mudanças com ação necessária.
- **Avaliações**: informar convite de avaliação após conclusão, sem revelar se/como a outra parte avaliou quando a política de avaliações seladas for adotada; nunca enviar nota ou comentário privado no push.
- Não enviar push inútil para cada polling, nem notificar ao destinatário sobre a própria ação. Preservar os banners e contadores internos existentes como mecanismo complementar e fallback.

### Aplicativo (Expo SDK 58)
- Integrar `expo-notifications` seguindo a matriz de compatibilidade vigente, usando **development build / EAS** e aparelhos físicos para testes de push remoto; **não pressupor funcionamento no Expo Go**, especialmente para notificações com o app fechado.
- Solicitar permissão em contexto, sem impedir o uso se negada. Disponibilizar preferências de notificação por tipo e opção de desativar. Respeitar configurações do sistema, sem insistir em permissão negada.
- Integrar APNs (iOS) e FCM (Android) conforme as credenciais e capacidades do projeto. Credenciais de envio privadas no serviço/backend ou EAS, nunca em Git, `EXPO_PUBLIC_*` ou logs.
- Toque na notificação abre a solicitação correta **somente após restauração de sessão e checagem de autorização na API**. Um deep link não pode expor telefone, descrição, contato, comentário ou informações de outra conta na tela bloqueada.

### Backend e persistência
- API autenticada de registro/atualização/revogação de instalações/tokens, vinculando cada token à identidade da sessão. Suportar múltiplos aparelhos; revogar/suspender associação ao sair da conta ou trocar de usuário. Evitar armazenamento e logs de tokens completos.
- **Outbox transacional** ligada a `ServiceRequestEvent` e à identidade real do destinatário, gravada na mesma transação da mudança de status. Enviar **somente após commit**, por worker/fila persistente; nunca disparar rede de dentro da transação SQL.
- Usar IDs idempotentes por evento/destinatário/instalação, tentativas limitadas, backoff, tratamento de tokens inválidos, auditoria mínima e verificações de preferências antes do envio. Deduplicar apresentação com avisos internos; recebimento não significa leitura nem resolução.
- Propor migrations **aditivas e revisadas** de tokens/instalações, preferências e outbox no SQL Server, com FKs `NoAction`, horários UTC e privilégios runtime/worker mínimos.
- Priorizar corpo genérico: por exemplo, **"Você tem uma nova solicitação no Omini"** e **"Seu atendimento foi atualizado"**, sem dados pessoais ou nomes de clientes/profissionais no payload de bloqueio.

### Critérios de aceite
- Prestador recebe notificação de novo pedido com o app fechado, cliente recebe aviso após aceite e pedido de confirmação, conforme permissão e conectividade do dispositivo; confirmar em **iPhone e Android físicos usando builds compatíveis**.
- Tocar uma notificação leva ao atendimento certo sem troca silenciosa de perfil e sem expor dados de outra conta.
- Usuário que não concede permissão continua utilizando o Omini normalmente e recebendo avisos internos ao abrir.
- Logout/troca de conta, dois dispositivos, token expirado, rede intermitente, retries e workers concorrentes não vazam conteúdo ou multiplicam eventos lógicos.
- Um atendimento concluído/encerrado não deve reaparecer como solicitação pendente por causa de push atrasado; reconsultar status real da API.
- Proteger ambiente de testes com chaves e dispositivos próprios; checar custos/limites do provedor e políticas antes de ativar em produção.

Referência técnica já existente: [Avisos internos, pendências e plano de push](notificacoes-omini.md#push-remoto-futuro--somente-proposta). Aquele documento contém o planejamento histórico; este item explicita a escolha das notificações push como escopo **da Fase 2.6**.

## 5. Ocultar diagnóstico de conexão com a API para usuários finais

### Motivação e decisão de produto (22/11/2026)
A Fase 2.5 manteve na tela **Perfil** um cartão técnico **“Conexão com a API”**, com botão **“Testar conexão”** e resultado do `GET /api/health`. O diagnóstico foi útil para a homologação no iPhone, incluindo a conexão com a API principal em `192.168.0.7:3000`, mas **não é funcionalidade voltada ao cliente ou prestador**. O responsável solicitou movê-lo para a Fase 2.6 após o fechamento funcional da 2.5.

### Comportamento desejado
- **Aplicativo público / build de produção:** não exibir a seção **Conexão com a API**, o botão **Testar conexão**, URLs, portas, dados técnicos de servidor ou mensagens de *health check* no Perfil de clientes ou prestadores.
- **Ambiente de desenvolvimento/QA:** preservar uma forma de testar conectividade, protegida por configuração explícita de desenvolvimento (ex.: `__DEV__` ou flag interna); não depender de uma chave que o usuário final possa habilitar inadvertidamente. O teste continua a ser de leitura e não coleta/envia dados pessoais.
- **Experiência de uso normal:** comunicação com a API ocorre automaticamente nas ações do app; se houver erro de rede ou indisponibilidade, apresentar mensagem amigável, opção de tentar novamente e estados de carregamento/offline adequados. Não mostrar detalhes de infraestrutura nem confundir indisponibilidade com falha de autenticação.
- **Backend:** manter `GET /api/health` para monitoramento e diagnóstico técnico, sem expor dados privados. Esta melhoria é principalmente de apresentação no aplicativo, não de remoção da rota.
- **Segurança e configuração:** não embutir endereços locais de testes como destino padrão de uma build pública; configurar a URL da API por ambiente e revisar permissões e distribuição de builds antes do release.

### Critérios de aceite
1. No iPhone e Android em **build de produção ou equivalente**, a tela Perfil de cliente/prestador não exibe o cartão ou botão de diagnóstico.
2. Em **desenvolvimento/QA**, a ferramenta continua acessível aos desenvolvedores e o teste HTTP ainda funciona.
3. Com API indisponível, o app informa de forma amigável, sem revelar IP, porta, stack trace, token ou informações internas; após reconexão, a funcionalidade normal retorna.
4. Contato, solicitações, avaliações, autenticação e navegação permanecem funcionais; validar regressão e acessibilidade em iPhone e Android.
5. Tratar a atualização coordenada das dependências compatíveis com Expo SDK 58 e executar novamente os testes de regressão antes da distribuição pública; não misturar upgrades com a simples ocultação sem validação.

## 6. Sequência e critérios de entrega
1. Revisão das regras de estados e do tratamento de trabalho parcialmente executado, sem quebrar Fase 2.4/2.5.
2. Especificação de modelos, contratos, regras de reciprocidade de avaliações e migrations aditivas necessárias, inclusive outbox/instalações push.
3. Implementação backend de encerramento, avaliações bidirecionais e outbox/worker push + testes de autorização, concorrência, imutabilidade, deduplicação e integridade.
4. Implementação mobile do encerramento motivado, da reputação visual, das duas direções de avaliação, das notificações e da ocultação do diagnóstico técnico em builds públicas, com QA em iPhone/Android e development builds próprios para push.
5. **Primeiro**: validação em `OMINI_TEST` (`localhost\\OMINI_TEST`, porta 15433), preservando a instância/banco principal (`localhost\\OMINI`, porta 1433). Confirmar permissões SQL, backup, status das migrations e dados históricos.
6. Somente depois de revisão e aprovação expressa do responsável, planejar implantação na base principal. Este documento não concede autorização para migrar, resetar, editar ou conectar a base principal.

### Fora do escopo aprovado até nova decisão
- Pagamentos, reembolsos e comissões; moderação/denúncias completas; garantia absoluta de entrega de push (impossível assegurar); resolução formal de disputas por trabalho parcialmente executado; novos planos de assinatura.
