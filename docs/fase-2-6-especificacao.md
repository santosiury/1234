# Omini — Especificação proposta da Fase 2.6

Status: **escopo funcional aprovado pelo responsável em 21/11/2026: encerramento motivado, reputação visual, avaliação bidirecional e notificações push remotas; em 22/11/2026 foi acrescentada a ocultação do diagnóstico de API para usuários finais; implementação pendente**. Documento de planejamento, **não** equivale a código entregue ou migration aplicada.

Base técnica: continuidade da branch `feature/fase-2-5-contato-avaliacoes` (NestJS + Prisma/SQL Server, React Native/Expo SDK 58). Omini mantém contratação direta entre cliente e prestador; sem comissão, gerenciamento de orçamentos ou pagamentos dos serviços. A Fase 2.5 teve migrations, permissões, API principal, testes de contato e avaliações e conexão pelo iPhone validados em ambiente local em 22/11/2026; os fluxos completos com gravação haviam sido validados em OMINI_TEST. Isso não equivale a publicação pública do app. A atualização coordenada das dependências Expo SDK 58 permanece pendente e deve ter regressão própria antes de qualquer release.

## 1. Encerramento motivado de solicitação por falta de acordo

### Problema
Na Fase 2.5, `cancel` é permitido somente ao **cliente** em `REQUESTED` e `ACCEPTED`. Depois de `start`, o estado `IN_PROGRESS` não admite cancelamento motivado; tampouco há ação para o prestador encerrar um aceite sem acordo. Aceitar indica interesse em conversar, e **não** significa preço ou condições acordados. O estado `IN_PROGRESS` pode ter sido acionado antes do acordo.

### Escopo aprovado
- Oferecer **Encerrar atendimento** a cliente e prestador para negociações sem acordo **após aceite**, inclusive se a solicitação já estiver em `IN_PROGRESS`, sujeito às regras de proteção abaixo.
- Apresentar **um único motivo selecionável** (radio buttons ou seletor de escolha única), nunca checklist múltiplo.
- Se selecionado **Outro motivo**, exibir campo livre obrigatório com **10 a 500 caracteres**, aparado, normalizado e validado também no backend.
- Motivo aprovado/selecionado na prévia: **“Não chegamos a um acordo sobre o valor”**. Ele deve existir como **primeira opção**; no formulário real, não pré-selecionar motivo, para assegurar escolha consciente.
- Exigir confirmação explícita antes de registrar a transição, com aviso de que o atendimento será encerrado, não concluído.
- Registrar ator, motivo estruturado, texto complementar quando aplicável e data/hora confiável em histórico acessível aos participantes. Não disponibilizar motivo ou relato em catálogo e avaliações públicas.
- Notificar/atualizar a outra parte pelos mecanismos existentes e, quando houver permissão/instalação compatível, pelo novo fluxo push da Fase 2.6. A conclusão da transição não pode depender de entrega push.
- Ao encerrar: impedir novas consultas ao telefone, remover botões WhatsApp/Ligar, preservar histórico e impedir novas avaliações para solicitações não concluídas. Não apagar contato que a outra pessoa já obteve fora do app.
- Manter `COMPLETED` exclusivo para confirmação real de conclusão pelo cliente. Não converter encerramento por desacordo em `COMPLETED`, não gerar evento fictício de conclusão e não afetar avaliações históricas válidas.

### Motivos do CLIENTE (escolha única)
| Código proposto | Rótulo aprovado |
| --- | --- |
| `NO_PRICE_AGREEMENT` | **Não chegamos a um acordo sobre o valor** |
| `DEADLINE_NOT_SUITABLE` | O prazo não atende à minha necessidade |
| `SERVICE_MISMATCH` | O serviço oferecido não corresponde ao solicitado |
| `PROVIDER_UNAVAILABLE` | O profissional não poderá realizar o atendimento |
| `NO_LONGER_NEEDED` | Não preciso mais do serviço |
| `OTHER_TERMS_NO_AGREEMENT` | Não chegamos a um acordo sobre as condições |
| `OTHER` | Outro motivo (explicação obrigatória) |

### Motivos propostos para o PRESTADOR (a revisar na implementação)
| Código proposto | Rótulo sugerido |
| --- | --- |
| `NO_PRICE_AGREEMENT` | Não chegamos a um acordo sobre o valor |
| `SCOPE_MISMATCH` | O serviço solicitado está fora do escopo combinado |
| `SCHEDULE_CONFLICT` | Não conseguimos combinar data ou horário |
| `UNABLE_TO_PERFORM` | Não poderei realizar o serviço |
| `OTHER_TERMS_NO_AGREEMENT` | Não chegamos a um acordo sobre as condições |
| `OTHER` | Outro motivo (explicação obrigatória) |

### Estados e proteção contra encerramentos indevidos
- Candidatos à transição: `ACCEPTED` e `IN_PROGRESS`. `REQUESTED` mantém a rejeição/cancelamento atual, com compatibilidade retroativa a revisar.
- Considerar reutilizar `CANCELLED` com razão/ator estruturados para permitir migração compatível; **decidir o desenho antes de implementar**, comparando semântica com `REJECTED` e o histórico atual. Não criar estado novo apenas por preferência visual.
- Em `IN_PROGRESS`, perguntar se **houve execução efetiva, parcial ou entrega**. Quando houve trabalho executado ou divergência sobre isso, **não** encerrar automaticamente como simples "sem acordo"; preparar tratamento diferenciado de interrupção/pendência e deixar o caso fora do fluxo simplificado até definição de produto. A resposta não deve funcionar como prova definitiva de execução.
- `AWAITING_CONFIRMATION`, `COMPLETED`, `CANCELLED` e `REJECTED` não podem ser encerrados por esta ação simplificada. Preservar o fluxo atual de confirmação/reabertura.
- Autorizar apenas participantes originais com perfis/contas ativos; validar estado e versão do registro no servidor com transação serializável, idempotency key, trilha de auditoria e sem duplicar eventos.
- Sanitizar texto livre: impedir HTML, dados de contato/PII evidentes, URLs e caracteres de controle, com mensagens de validação úteis. Preservar privacidade dos registros.
- Definir o comportamento de desistência sem acordo versus cancelamento comum, para não confundir métricas e reputação.

### Alterações técnicas planejadas (não implementadas)
- **shared**: ação/transições, motivo tipado, rótulos, campos de leitura compatíveis.
- **API**: validação estrita do motivo, transição autorizada e idempotente, persistência de evento e resposta sem exposição de PII; manter contrato das rotas históricas ou versionar mudanças incompatíveis.
- **SQL Server**: avaliar se bastam campos/eventos históricos existentes; se campos adicionais forem necessários, criar migration **aditiva**, jamais editar migrations já aplicadas nem resetar dados.
- **Mobile**: botão condicionado ao estado/perfil, formulário de seleção única, campo Outro, confirmação, resposta segura a falha de rede/repetição, refresh do histórico, acessibilidade e estados vazios.
- **Testes**: transições elegíveis/negadas, concorrência, múltiplos toques, idempotência, revogação de acesso ao contato, não elegibilidade para avaliação, datas/histórico, perfis adversários, texto inválido, app iPhone e Android.

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
