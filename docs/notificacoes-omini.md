# Omini — Avisos internos, pendências e plano de push

Implementação sobre `feature/fase-2-4-solicitacoes`, base `6e66f0f`. O responsável informou que o fluxo anterior foi validado no iPhone com SQL Server real. Esta entrega adiciona **avisos dentro do app e atualização automática enquanto ativo**; não implementa push, serviços em segundo plano ou novas estruturas no banco.

Não houve alteração em backend, schema, migrations, GRANTs, regras de autorização, autenticação, contratos de contratação ou SecureStore de recuperação. Nenhum SQL, seed, migration ou reset foi executado. Dependências e lockfile permanecem iguais: **Expo SDK 58**, React Native e SecureStore existentes. Não foi instalado `expo-notifications`.

## O que os indicadores significam

| Indicação                 | Fonte e significado                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Contador profissional     | Total real de `GET /api/requests/received?status=REQUESTED`, referente ao prestador autenticado. Precisa aceitar ou recusar.           |
| Contador do cliente       | Total real de `GET /api/requests/sent?status=AWAITING_CONFIRMATION`. Precisa conferir e confirmar a conclusão ou informar o que falta. |
| Banner individual         | Uma solicitação ou uma mudança de versão observada pelo monitor, com ID real e acesso privado aos detalhes.                            |
| Resumo inicial            | Pendências preexistentes na primeira sincronização da conta/perfil, sem apresentar uma sequência de pedidos antigos como novos.        |
| Aviso tratado/visualizado | Metadado local de apresentação/consulta, independente da resolução do pedido. Não é um contador de notificações não lidas.             |

Zero oculta o contador. Antes da primeira resposta válida, o valor é desconhecido e o badge não inventa zero. Falhas posteriores mantêm o último valor consultado. Para grandes números, mostrar `99+`, com a quantidade integral no valor acessível do botão profissional. Ler o detalhe ou dispensar o banner **não** resolve a pendência. Aceite/recusa e confirmação atualizam o indicador após consulta ao servidor.

O banner profissional usa **“Nova solicitação recebida!”**, mensagem genérica e ações Ver solicitação/Dispensar aviso. Não contém nome, descrição, localização, contato ou valor. O cliente recebe avisos para aceita, recusada, em andamento/reaberta, cancelada e aguardando confirmação. A confirmação tem prioridade na fila. A conclusão pelo próprio cliente continua no fluxo/histórico existente, sem inventar um novo evento de notificação.

## Arquitetura e ciclo de vida

`RequestUpdatesProvider` é montado uma única vez sob a sessão e o modo na raiz. `RequestMonitor` centraliza polling, filas, snapshots, deduplicação e estado. `RequestNoticeHost` apresenta no máximo um banner, como irmão da Stack: ocupa espaço próprio, sem sobrepor botões/conteúdo ou criar Tabs/modais de notificação.

- Um único timeout é agendado **25 segundos depois de concluir o ciclo anterior**. Latência e erros podem aumentar esse intervalo. Não há promessa de atualização instantânea.
- Consultar ao restaurar a sessão autenticada, entrar no painel/listas, voltar ao primeiro plano, após mutação confirmada e pela ação Atualizar. Pedidos de refresh simultâneos compartilham o ciclo atual; invalidações por mutação coalescem em uma consulta posterior.
- Usar AppState: inactive/background limpam o timeout e abortam a consulta. Nenhum polling é mantido com o app suspenso/fechado. Ao voltar a active, sincronizar imediatamente. Banners já apresentados não são reapresentados em cada retorno; o contador continua representando ações pendentes.
- Logout/troca de conta abortam a consulta, invalidam a geração assíncrona e limpam o estado da sessão antes de exibi-lo para outra identidade. O hook também oculta estado cujo owner não corresponda ao usuário atual, inclusive no render anterior ao cleanup.
- Consultas usam JWT/SessionManager existentes e uma instância RequestsApi vinculada ao owner. AbortSignal cancela a requisição e a leitura do corpo; se a operação ainda estiver na fila de sessão, conferir cancelamento antes de enviar HTTP. A fila única de refresh/logout da autenticação foi preservada.
- Falha de uma das experiências não impede atualizar o contador/aviso válido da outra. Erros seguros, sem detalhes internos, ficam nas telas de solicitações com **Atualizar avisos**; o próximo ciclo também tenta novamente. Não limpar contador/estado para fingir sucesso.

As listas e detalhes focados acompanham a revisão do monitor, inclusive no retorno ao app. Telas retidas na Stack não fazem consultas extras. A atualização automática mantém os dados da mesma consulta visíveis durante loading/falha; mudança de conta/filtro continua ocultando dados anteriores. Não atualizar automaticamente o detalhe enquanto houver confirmação em andamento; recarregar quando ficar seguro. Eventos de histórico já carregados são preservados e mesclados por ID/versão, pois são imutáveis.

### Consultas limitadas e consistência

Não foram criados endpoints. Por ciclo:

- Prestador: uma consulta recebidas/REQUESTED, página 1, tamanho 20.
- Cliente: uma consulta para cada status `AWAITING_CONFIRMATION`, `REQUESTED`, `ACCEPTED`, `REJECTED`, `IN_PROGRESS`, `CANCELLED`, página 1, tamanho 20. REQUESTED estabelece o estado anterior; não gera aviso de criação para o próprio cliente.
- Conta com ambos os perfis: até **sete consultas filtradas**, sem concorrência entre ciclos. O monitor guarda somente metadados de até 140 resultados por ciclo, não os textos do atendimento. Não percorre todo o histórico concluído a cada intervalo. Telas focadas podem fazer sua consulta normal após a revisão.

Os contadores usam `total` do servidor, **nunca o tamanho da página**, inclusive acima de 20/99 registros. Os endpoints mantêm autorização por participante. Cada consulta representa o estado naquele instante; o conjunto não é uma transação única entre chamadas.

Polling observa snapshots, não um stream de eventos. Pode condensar transições que aconteçam entre duas consultas. Avisos individuais ficam limitados aos 20 resultados mais recentes de cada filtro; mudanças fora dessa janela podem resultar apenas no resumo de alterações dos totais e no contador de ação. Empates de data e páginas antigas não devem ser anunciados como pedidos novos. Não usar esses metadados como auditoria, garantia de entrega ou prova de leitura. O histórico real continua no SQL Server; a futura outbox/push descrita abaixo é o caminho para entregar todos os eventos de maneira durável.

## Deduplicação, privacidade e formulários

O namespace local é **`omini.request.notices.v1.<userId>`**, separado dos tokens de autenticação e de `omini.requests.pending.v1.<userId>`. Não apagar/reescrever dados da sessão ou de envios pendentes.

Persistir no SecureStore somente IDs de solicitações, papel, status/versão, versão tratada e versão visualizada, mais baselines/totais de detecção. Não persistir nomes, descrições, contatos, tokens ou conteúdo de notificações. Limite de 256 entradas por conta, recência limitada e dois slots de checkpoint. Os blocos têm no máximo 1200 caracteres ASCII; até 64 por slot. O manifesto muda por último, depois de gravar o slot alternativo completo, usando Keychain `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Escritas são serializadas por conta. Uma falha parcial mantém o checkpoint anterior legível; não há crescimento ilimitado de chaves por evento.

`handled` indica bootstrap/apresentação/tratamento; `viewed` somente consulta real do detalhe/ação conhecida. Um baseline inicial não afirma que o usuário leu todos os pedidos. A fila em memória comporta um banner visível e até três pendentes. Identidade/versão impedem repetição em cada consulta; IDs saídos do estado/janela são revalidados antes de mostrar avisos adiados. Metadados locais não sincronizam leitura entre dispositivos e têm retenção limitada; contadores sempre são consultados novamente.

Falha de leitura/gravação do controle não impede consultar totais, mas evita apresentar avisos sem checkpoint seguro. Mostrar erro discreto e permitir retry; registros corrompidos não são apagados automaticamente. Persistência local não substitui autorização: abrir o detalhe continua exigindo sessão e participação verificadas pelo backend.

Banners ficam ocultos nos formulários profissionais `/edit`, aliases de formulário, criação/retomada de solicitação e autenticação. Novos avisos esperam o usuário sair, sem modal obrigatório, perda de rascunho ou mudança de modo. Confirmações nativas existentes continuam protegendo sua interação. Botões têm alvos existentes de pelo menos 44 pontos, textos quebram linha, o conteúdo pode rolar com fonte ampliada e respeita safe areas. Android usa anúncio polite; no iOS a apresentação pode ser anunciada em fila pelo VoiceOver. O comportamento nativo ainda requer validação física.

## Uma conta, dois perfis

Monitorar os perfis ativos da conta autenticada independentemente do modo visual escolhido. Um usuário com perfil prestador recebe aviso profissional enquanto está no modo cliente. O modo **não muda sozinho**.

Ver solicitação no mesmo contexto real abre o ID na Stack correspondente. Ao cruzar de experiência ou sair da demonstração, usar a retomada existente e pedir **Continuar como prestador/cliente**; somente essa interação seleciona o contexto real e abre o detalhe/lista. Não aceitar URL externa/arbitrária de retorno. Conta que não possui o perfil não pode ser encaminhada silenciosamente para ele. O contador profissional permanece na barra aprovada; o do cliente fica na aba Solicitações. Na demonstração, badges reais não são misturados aos dados fictícios; o acesso por aviso requer entrada explícita no contexto real.

## Arquivos alterados

- `apps/mobile/src/requests/notifications/monitor.ts`: monitor central, snapshots, pendências, filas e ciclo de vida.
- `apps/mobile/src/requests/notifications/storage.ts`: metadados limitados/isolados e checkpoints no SecureStore.
- `apps/mobile/src/requests/notifications/provider.tsx`: contexto, banner acessível, roteamento explícito e badge reutilizável.
- `apps/mobile/app/_layout.tsx`: montagem única. `app/client/_layout.tsx`: indicador de confirmação.
- `apps/mobile/src/marketplace/provider/ProviderNavigation.tsx`: contador profissional, preservando destinos/Stacks/labels e safe areas. `provider/FlowUI.tsx`: texto de Ajuda sobre atualização com o app aberto.
- `apps/mobile/src/requests/api.ts`, `marketplace/api.ts`: cancelamento opcional das consultas sem outro mecanismo de autenticação.
- `apps/mobile/src/requests/{screens,NewRequest}.tsx`: invalidar após mutações, marcar versão consultada, atualizar telas focadas sem interromper confirmações.
- `apps/mobile/src/marketplace/hooks.ts`: retenção opcional para atualização dos pedidos; comportamento padrão dos cadastros preservado.
- Testes `request-monitor.test.ts`, `notification-storage.test.ts`, `notifications-navigation.test.tsx`; README e este documento.

## Validações e limites desta entrega

**186 testes aprovados: 63 API + 123 mobile**, preservando os 155 anteriores e acrescentando 31 cenários. A cobertura inclui contador real, primeira sincronização, deduplicação/reinício, aceite/recusa, versões, prioridade, conta dupla, foreground/background, fila única, cancelamento HTTP inclusive no corpo/fila de sessão, logout/conta diferente, erros, checkpoints incompletos, recuperação, navegação Stack, formulários, atualização da lista e acessibilidade/fonte ampliada. Os testes usam dados controlados exclusivamente nos diretórios de teste.

Verificações: typecheck, lint, testes, build da API, rotas, marca, segredos, validação Prisma/migrations e bundles Hermes iOS/Android. Não há novas dependências, chaves, permissões de notificação do sistema ou configuração de APNs/FCM nesta entrega.

Inspeção em Chromium: cópia temporária React Native Web com autenticação/JWT/API NestJS HTTP reais e repositórios de teste em memória. Duas sessões distintas: prestador com dois perfis, aviso enquanto navegava como cliente, mudança explícita de contexto, ID correto, contador zerado após aceite, aviso de aceite ao cliente, AWAITING_CONFIRMATION com contador e conclusão/histórico preservados. O aviso profissional apareceu em aproximadamente 23 segundos naquele teste. Isso não é um SLA. Também houve inspeção do banner final em 320/375/390/430 px, sem overflow horizontal ou botão cortado detectado nas telas examinadas. O harness substitui o SecureStore nativo por memória e não foi incluído no produto.

**Não houve teste no iPhone físico, Keychain, APNs, FCM ou SQL Server real nesta execução.** Bundles/simulações/browser não equivalem a esses testes. Não há operação de banco pendente para esta implementação interna. O monitor só informa mudanças depois de consultar com o app ativo; aplicativo fechado ou sem rede não recebe aviso remoto.

## Atualizar no Windows

Parar API e Expo, preservar `.env` e revisar alterações locais antes de atualizar. Não usar reset/clean para descartar trabalho próprio.

```powershell
Set-Location C:\projetos\omini
git status --short
git fetch origin
git switch feature/fase-2-4-solicitacoes
git pull --ff-only origin feature/fase-2-4-solicitacoes
npm ci
npm run typecheck
npm run lint
npm test
npm run build:api
npm run check:routes
```

Não executar migration, seed, db push, GRANT ou gerar outra chave JWT. Em dois terminais:

```powershell
Set-Location C:\projetos\omini
npm run dev:api
```

```powershell
Set-Location C:\projetos\omini
npm run dev:mobile -- --clear
```

Usar o endereço LAN já configurado para a API, sem localhost no iPhone, mesma rede privada Wi-Fi, Expo Go com SDK 58 e permissão de rede local. Notificações internas não exigem permissão de push. Para API em produção, manter HTTPS e configuração de segurança existente.

## Validar no iPhone

1. Usar duas sessões: cliente A em outro aparelho ou Swagger no Windows, e prestador B no iPhone. Manter B autenticado com o aplicativo aberto no Painel. Não compartilhar JWT/senhas em logs, chat ou capturas.
2. Se houver pedidos antigos, esperar um resumo discreto; contador deve corresponder a REQUESTED, independentemente de terem sido lidos. Sem pedidos, contador oculto.
3. A envia uma nova solicitação real. Aguardar cerca de 25 segundos mais latência: B deve perceber banner e contador sem procurar manualmente a lista. Dispensar e aguardar outros ciclos: mesmo aviso não deve repetir, contador continua até responder.
4. Ver solicitação abre o pedido correto. Ler o detalhe não zera o contador. Aceitar/recusar atualiza o total; retorno nativo leva à lista e ao painel, preservando os três cards, Minha conta e Ajuda.
5. Repetir com B possuindo ambos os perfis e navegando como cliente. Não mudar automaticamente para prestador; Ver solicitação/Continuar como prestador abre o contexto profissional correto.
6. Enquanto B edita serviço/área/perfil ou um formulário de solicitação, A envia outro pedido. Não interromper rascunho, teclado ou guard de saída. Ao sair com segurança, aviso pendente aparece se ainda estiver válido.
7. Em A, conferir aviso de aceite/recusa e, principalmente, proposta de conclusão. O contador do cliente indica AWAITING_CONFIRMATION; abrir detalhes mantém a pendência até confirmar/reabrir. Executar o ciclo completo e conferir o histórico real.
8. Mandar app B ao segundo plano/bloquear tela e criar pedido em A. **Não esperar push.** Ao retornar, atualizar contadores/lista e apresentar nova mudança identificada. Repetir retorno sem outra mudança: não reapresentar o banner já tratado.
9. Desligar a rede durante uma consulta: manter o último contador conhecido, não mostrar alerta falso ou zero inventado. Conferir erro/retry em Solicitações; restabelecer rede e observar recuperação. Na primeira consulta sem dados válidos, badge pode ficar oculto.
10. Sair da conta/trocar usuário durante atualização e repetir login: nenhum ID/banner/contador da outra conta deve aparecer. Sessão e recuperação de envio pendente anteriores continuam funcionando.
11. Fonte ampliada, VoiceOver, safe area/home indicator, rolagem e larguras menores: mensagens e botões sem cortes, contador falado integralmente, banner dispensável e sem cobrir conteúdo/rodapé. Registrar modelo/iOS/Expo Go e resultados físicos.

## Push remoto futuro — somente proposta

### Aplicativo e credenciais

Adicionar Expo Notifications em fase própria e gerar **development build com EAS**. Expo Go não será apresentado como solução de push remoto com app fechado. Validar a matriz vigente do SDK e testar em dispositivos físicos. Configurar APNs para o bundle ID iOS (ambientes sandbox/produção corretos) e FCM para o projeto Android; credenciais geridas por EAS/vault/backend, com acesso mínimo, nunca em `EXPO_PUBLIC_*`, Git ou logs. Builds assinados e loja exigem configurações próprias, distintas do monitor atual.

Pedir permissão **explicitamente e em contexto**, explicando o benefício e permitindo recusa sem bloquear o uso do Omini. Oferecer preferências por categoria/experiência, horários e privacidade; não solicitar permissão repetidamente. Registrar apenas tokens válidos emitidos para o projeto/build correto.

### Registro autenticado e múltiplos dispositivos

Propor API autenticada para registrar/atualizar/revogar instalação, vinculando o token à conta atual no servidor. Uma conta pode ter vários dispositivos; uma instalação não deve continuar recebendo dados da conta anterior após logout/troca. Não confiar em `userId` enviado pelo aparelho. Revalidar vínculo, expiração/inatividade, preferências e rotação do token. Logout e revogação de sessão devem retirar/suspender o vínculo de envio sem depender apenas de apagar o token local.

Token não é senha de login, mas é dado sensível de roteamento: minimizar acesso, considerar criptografia em repouso e hash para unicidade/deduplicação. Não logar token integral nem usar identificadores invasivos de dispositivo sem necessidade. Tratar tokens inválidos/desinstalados, permissões revogadas e recibos como DeviceNotRegistered removendo/inativando o vínculo, sem retries infinitos.

### SQL Server, outbox e fila

Em entrega futura revisada, propor migrations **incrementais** para instalações/preferências, outbox de eventos e recibos de entrega/leitura. Usar UUIDs, DateTime2 UTC, limites explícitos, FKs NoAction e permissões mínimas separadas para aplicação/worker, preservando OminiDB e histórico. Nenhuma tabela, SQL ou permissão dessa proposta foi criada agora.

Associar a notificação ao **`ServiceRequestEvent.id`**, `requestId`, versão, tipo e destinatário derivado dos participantes imutáveis `clientUserId`/`providerUserId`. Gravar outbox na mesma transação do evento; o worker só envia **depois do commit**. Não chamar APNs/FCM/Expo dentro da transação SQL. Unicidade por evento/destinatário/canal/instalação e chaves de idempotência impedem duplicação lógica em retries. Entrega pela rede é pelo menos uma vez; não prometer exatamente uma entrega em todos os sistemas.

Usar fila durável, tentativas limitadas, backoff exponencial com jitter, TTL, Retry-After e tratamento de falhas permanentes/transitórias. Validar recibos do provedor, encaminhar falhas esgotadas para revisão, observar atraso e não gerar tempestade após indisponibilidade. Workers concorrentes precisam de claim/lease/lock e confirmação idempotente. Preferências podem mudar entre enfileirar e enviar: revalidá-las junto com o vínculo da instalação.

### Conteúdo, deep links e estado

Payload mínimo: tipo interno, ID/versão/evento necessários ao roteamento; sem descrição, endereço, contato ou nome sensível na tela bloqueada. Mensagem genérica por padrão, prévia conforme preferência explícita. Deep links aceitam somente rotas estruturadas conhecidas; restaurar sessão e consultar o pedido autorizado antes de mostrar detalhes. Se conta/perfil/participação não corresponder, apresentar indisponibilidade segura; não contornar guard ou mudar de modo sem ação do usuário.

Contadores de ação devem continuar derivados dos estados reais. Separar notificações entregues, apresentadas, lidas e solicitações resolvidas. Um recibo de push não prova leitura. Para sincronizar leitura entre dispositivos, usar estado autenticado no backend com unicidade usuário/evento e sem suprimir a pendência de ação. Evitar dupla apresentação entre push aberto e polling pelo mesmo evento/versão, inclusive em restauração/reconexão. Contador nativo do ícone deve ser derivado de política clara e recalculável, independente da soma de banners locais.

### Auditoria, observabilidade e testes futuros

Auditar enfileiramento, destinatário autorizado, tentativa, resultado e motivo de descarte com IDs correlacionáveis e retenção limitada. Medir latência após commit, retries, falhas permanentes, backlog, tokens inválidos e conversão em ação, sem expor tokens/conteúdo privado. Segregar credenciais e painéis por ambiente; limitar acesso operacional e documentar resposta a incidentes.

Testar autorização/IDOR, instalação sob conta errada, logout, rotação, preferências/recusa, transação revertida sem envio, retries idempotentes, workers concorrentes, invalidação de tokens, foreground/background/app fechado, vários dispositivos, deduplicação push/polling e deep link com sessão expirada. Validar APNs/FCM com development builds e dispositivos reais antes de prometer esse comportamento ao usuário.
