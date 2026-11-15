# Fase 2.5 — Contato privado e avaliações reais

Base: `df75d0f6253b062200565ce39aa5a9c78ec39a98`, Fase 2.4 validada pelo responsável. Entrega na branch `feature/fase-2-5-contato-avaliacoes`, sem merge. Expo SDK 58, NestJS e Prisma 6.19.3 preservados; nenhuma dependência adicionada.

## Modelo comercial

**Modelo de negócio: assinatura mensal de prestadores.** Omini não cobra comissão, não administra orçamentos e não processa pagamentos dos serviços. Cliente e prestador combinam diretamente pelo WhatsApp ou telefone. A implementação de planos, assinaturas e pagamentos recorrentes é futura e não integra esta entrega. Também não há chat interno, propostas financeiras ou estados financeiros.

## Contato e consentimento

O cadastro com perfil cliente exige celular brasileiro válido, DDD, escolha explícita sobre WhatsApp e autorização de compartilhamento. A conta continua única para os dois perfis. Ativar o perfil cliente posteriormente exige atualizar primeiro o contato em Minha conta. O celular é validado no app e no servidor e normalizado em E.164 (`+55` + DDD + nove dígitos). A máscara exibida é `(48) 99876-5432`. Isso valida o formato; não verifica titularidade por SMS nem garante que exista uma conta WhatsApp.

`User.phone` continua opcional para preservar dados antigos. `hasWhatsapp` começa falso e `phoneShareConsentedAt` começa nulo, sem inferir consentimento a partir de telefones antigos. A data de autorização vem de `SYSUTCDATETIME()` no servidor. Minha conta permite editar telefone, opção WhatsApp e autorização; retirar a autorização bloqueia novas consultas de contato e novos pedidos. A autorização se aplica também aos atendimentos aceitos ainda abertos, conforme explicado antes de salvar.

Clientes antigos continuam entrando, consultando pedidos e executando transições permitidas. Somente **novas solicitações** exigem contato autorizado (`CONTACT_REQUIRED`). A recuperação de uma criação já confirmada consulta o recibo antes dessa exigência, preservando sua idempotência. Um envio ainda não recebido pela API mantém a mesma chave e o mesmo payload enquanto o cliente atualiza o contato e tenta novamente. O diário de solicitações pendentes e as chaves de sessão no SecureStore não foram alterados.

### Política de liberação

| Situação                                                  | Nova consulta do contato pelo prestador                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| REQUESTED                                                 | Indisponível                                                                                      |
| ACCEPTED                                                  | Somente prestador destinatário original, com perfil/conta ativos e consentimento atual do cliente |
| IN_PROGRESS                                               | Mesma regra                                                                                       |
| AWAITING_CONFIRMATION                                     | Mesma regra                                                                                       |
| REJECTED, CANCELLED, COMPLETED                            | Indisponível                                                                                      |
| Pedido antigo sem celular válido ou autorização explícita | Indisponível; cliente pode atualizar Minha conta                                                  |

O endpoint retorna o **contato atual**, sem criar snapshots de telefone em solicitações/eventos. Alterações de telefone valem para futuras consultas autorizadas em atendimentos abertos. Cancelar, concluir ou retirar autorização impede novas consultas; não apaga uma informação que alguém já tenha obtido fora do aplicativo.

Telefone não integra catálogo, busca, perfil profissional público, payload comum dos pedidos, JWT, notificações ou comentários gerados pelo aplicativo. `/auth/me` inclui somente o indicador booleano `contactReady`, sem telefone. O dono consulta o número em endpoint privado próprio. O backend não registra corpos contendo contatos; erros seguem o filtro sanitizado existente. Infraestrutura de produção deve manter bodies e cabeçalhos de autorização fora de logs/analytics.

A consulta específica verifica autenticação, identidade imutável do prestador, estado e consentimento dentro de transação Serializable. IDs de outros pedidos não liberam contato. Erros de indisponibilidade usam resposta genérica. Limites por minuto: contato GET 20/conta e 60/IP; PATCH 10/conta e 30/IP. Limites em memória são adequados à instância atual; múltiplas réplicas exigirão um limitador compartilhado.

### WhatsApp e ligação

Após o aceite, o prestador consulta “Contato do cliente”. Cada toque em WhatsApp ou Ligar **reconsulta a autorização**, em vez de reutilizar uma autorização armazenada. O número fica somente em memória, é removido ao desfocar ou ir para segundo plano, e não é gravado no SecureStore/AsyncStorage. Uma resposta atrasada não pode abrir outro aplicativo após troca de conta, saída da tela ou segundo plano.

O linking usa `https://wa.me/<numero-validado>?text=<mensagem-codificada>` e `tel:+55...`. A mensagem é fixa, sem descrição, endereço, IDs ou nomes: “Olá! Sou o profissional que recebeu sua solicitação pelo Omini. Gostaria de conversar sobre o atendimento.” Não há envio automático de mensagem nem chamada automática; o usuário confirma no aplicativo externo. Sem WhatsApp indicado, aparece Ligar. Quando há falha no linking, uma mensagem segura mantém a alternativa de ligação quando o contato continua disponível. Sem WhatsApp instalado, o link HTTPS pode abrir uma página de instalação no navegador; o usuário pode retornar e usar Ligar.

Aceitar demonstra interesse em atender e entrar em contato; não confirma preço. A interface orienta combinar o atendimento antes de iniciar. Estados, ações permitidas, cancelamento, histórico e idempotência da Fase 2.4 permanecem iguais.

## Avaliações

A única direção implementada é **cliente → prestador**. A API deriva autor, solicitação e prestador do registro existente, nunca do body. Exige cliente original com perfil/conta ativos, participantes distintos, status `COMPLETED`, `completedAt` e evento real `confirm-completion` da mesma versão, pelo cliente, com o mesmo instante de conclusão. `AWAITING_CONFIRMATION` não libera avaliação. Solicitações antigas concluídas pelo fluxo da Fase 2.4 podem ser avaliadas pelo histórico; não se fabrica evento para registros inconsistentes. Esses registros exigem análise administrativa antes de qualquer reparação.

Nota obrigatória inteira entre 1 e 5. Comentário opcional, até 1.000 caracteres, trim e normalização NFC; rejeita HTML, controles e padrões óbvios de telefone, e-mail, URL/endereço. Texto é renderizado como texto, sem HTML. A checagem não substitui moderação humana nem detecta todo dado pessoal; a interface orienta não incluir dados pessoais.

Uma publicação **imutável** por solicitação. A interface explica antes do envio que não há edição/exclusão nesta fase. Unicidade no SQL Server e transação Serializable impedem duas avaliações para o mesmo pedido. Repetição com mesma nota/comentário normalizados retorna a publicação original; conteúdo diferente retorna 409. A transação admite até duas novas tentativas em conflitos Prisma de unicidade/serialização. O botão tem trava de envio e preserva o conteúdo de uma tentativa com resposta incerta. Não existem endpoints de editar ou excluir, nem permissão de UPDATE/DELETE para a role de avaliações.

`ServiceReview` usa UUID e data UTC gerados no SQL Server, FKs NoAction para solicitação, duas contas e perfil profissional; CHECK de nota/participantes diferentes. O vínculo e a conclusão são verificados pelo domínio na mesma transação: FKs isoladas não provam autorização. A identidade runtime não pode alterar participantes dos pedidos nem modificar eventos existentes. Administradores continuam tecnicamente capazes de alterar dados e exigem controle operacional separado.

Publicação aparece imediatamente, sem janela de avaliação recíproca nesta fase. A API calcula média decimal (evita truncamento de AVG de INT no SQL Server) e quantidade a partir de registros vinculados aos mesmos participantes, perfil e evidência de conclusão. Não inclui dados demonstrativos. Média é nula quando não há avaliações; a interface mostra **“Ainda não há avaliações.”**, sem nota/estrelas fictícias.

Catálogo público e Meu perfil mostram média, quantidade, notas, comentários e datas reais, em páginas. Página 1..1000, tamanho 1..20 (mobile usa 5); ordem `createdAt DESC, id DESC`. Agregado e página usam o mesmo conjunto válido em uma transação. Entre páginas podem existir deslocamentos por novas publicações; voltar à primeira página atualiza a visão. O público só acessa perfis atualmente publicáveis no catálogo; o dono ativo também pode consultar sua reputação antes de publicar todos os serviços/áreas.

A autoria pública usa o rótulo **Cliente Omini**, sem ID da conta, e-mail, telefone ou ID de solicitação. O cliente vê sua publicação no atendimento concluído. O prestador só consulta as avaliações recebidas; não pode alterá-las. O vínculo a uma conclusão real, unicidade, bloqueio de autoavaliação, validação e limites reduzem fraude; não prometem detectar conluio. Moderação, denúncias e direção prestador → cliente são evoluções futuras descritas em [avaliações bidirecionais](avaliacoes-bidirecionais.md).

### Monitor e navegação

A conclusão abre uma opção **voluntária**, sem modal obrigatório: “Avalie o atendimento”. Também fica disponível depois no histórico. O monitor existente consulta `COMPLETED`, apresenta um convite uma vez para novas conclusões elegíveis e salva somente o marcador `reviewPrompted` junto aos metadados já existentes. Abrir um pedido não equivale a avaliar. Publicações removem o convite quando reconsultadas; histórico antigo não produz uma fila de banners no primeiro carregamento.

Após publicar, o cliente retorna ao atendimento e o monitor atualiza os dados. Perfis consultam avaliações ao ganhar foco e pela revisão do monitor existente, inclusive no dispositivo do prestador com app ativo (ciclo de aproximadamente 25 segundos). Não foi criado outro polling nem push remoto. Cliente+prestador fazem até oito consultas por ciclo. Em segundo plano/sem rede não há promessa de entrega em tempo real.

Formulário `/service-review/[id]` fica na Stack raiz, sem Tabs aninhadas ou barra profissional, com proteção de alterações não publicadas. Cards Meu perfil/Meus serviços/Onde atendo, Ajuda, SafeArea, Inter, cores, sessão e formulários anteriores foram preservados. Inputs com label passam a fornecer também esse label à acessibilidade, salvo label explícito.

## Contratos REST

Todos sob `/api`; Swagger em `/docs` (versão 0.2.5). Respostas privadas usam `Cache-Control: no-store`.

| Método e caminho                                | Autorização / propósito                                      |
| ----------------------------------------------- | ------------------------------------------------------------ |
| GET `/me/contact`                               | Próprio usuário autenticado                                  |
| PATCH `/me/contact`                             | Mesmo dono; body `{phone,hasWhatsapp,shareContact}`          |
| GET `/requests/:id/contact`                     | Prestador original após aceite, enquanto aberto e autorizado |
| GET `/reviews/requests/:id`                     | Participante; retorna `{canReview,review}`                   |
| POST `/reviews/requests/:id`                    | Cliente original elegível; body `{rating,comment?}`          |
| GET `/reviews/providers/:id?page=1&pageSize=10` | Público, perfil publicável; média/total/itens paginados      |
| GET `/provider/me/reviews?page=1&pageSize=10`   | Próprio prestador ativo                                      |

POST usa prefixo `/reviews/requests`, evitando colisão com a rota anterior `POST /requests/:id/:action`. Leituras privadas de avaliações usam o rate limit existente de solicitações (180/conta, 360/IP por minuto); publicação 30/conta e 60/IP. Reputação pública: 120/IP por minuto. Erros internos e credenciais não são devolvidos.

## Implantação SQL: somente pelo responsável após revisão

Duas migrations novas, sem alterações nas três históricas:

1. `20261115000000_customer_contact`: acrescenta `User.hasWhatsapp` com default falso e `User.phoneShareConsentedAt` nullable. Não altera telefones, contas ou categorias antigas.
2. `20261115010000_service_reviews`: cria somente `ServiceReview`, unicidade, índice e constraints/FKs. Começa sem avaliações, inclusive para serviços antigos; só clientes participantes publicarão registros reais.

Preservados `provider = "sqlserver"` no schema e `provider = "mssql"` em migration_lock. Seed de oito categorias permanece intacto e não precisa ser reexecutado. Não há reset, db push, criação/recriação de OminiDB ou backfill. Campos extras/tabela são compatíveis com dados antigos; cliente mobile deve ser atualizado junto da API para lidar com o contato obrigatório nos novos cadastros/pedidos.

As permissões adicionais estão em [contact-runtime-permissions.sql](sql/contact-runtime-permissions.sql) e [reviews-runtime-permissions.sql](sql/reviews-runtime-permissions.sql). O primeiro explicita SELECT/UPDATE das três colunas de contato, preservando as permissões de autenticação existentes. O segundo concede apenas SELECT/INSERT em ServiceReview para `omini_runtime_role`. Não atribui db_owner, db_datawriter, DELETE, UPDATE de avaliações ou DDL. Não execute os scripts com a identidade runtime nem troque a senha de `omini_app`. Antes de publicar, confira também roles/permissões herdadas preexistentes; um GRANT restrito não remove privilégios amplos concedidos externamente.

### Atualizar C:\projetos\omini

Feche API/Expo em execução e confira alterações locais antes de trocar branch. Não descarte arquivos locais para resolver conflitos; preserve `.env` e `.env.migrations` fora do Git.

```powershell
Set-Location C:\projetos\omini
git status --short
git fetch origin
git switch feature/fase-2-5-contato-avaliacoes
git pull --ff-only origin feature/fase-2-5-contato-avaliacoes
npm.cmd ci
npm.cmd run prisma:generate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build:api
npm.cmd run prisma:validate -w @omini/api
npm.cmd run check:migrations -w @omini/api
npm.cmd run check:routes
npm.cmd run check:secrets
```

`npm.cmd` evita o bloqueio de `npm.ps1` pela política do PowerShell; não precisa alterar ExecutionPolicy. Se a branch ainda não existir localmente, `git switch` cria o tracking da branch remota após fetch. Se houver conflito de arquivos locais, interrompa a troca e preserve o trabalho antes de continuar.

**Antes de aplicar no banco real:** faça backup verificado, registre contagens/histórico de migrations e restaure uma cópia em instância SQL Server **isolada e descartável**, usando também o nome OminiDB por causa dos guards. Use as identidades separadas de migration/runtime existentes; não aponte a cópia para o servidor real. Confirme host/porta/instância no SSMS e nos arquivos ignorados. A nuvem não validou execução T-SQL nesta entrega: o download da imagem oficial para a instância isolada retornou Forbidden. Essa validação é uma pendência obrigatória de implantação, não um teste aprovado.

Na cópia isolada, execute status/deploy com credencial de migration, aplique os dois GRANTs como administrador e rode o roteiro abaixo com registros representativos: cliente legado sem contato, cliente com contato antigo sem consentimento, dois prestadores, pedido aceito/cancelado/concluído e histórico de conclusão existente. Compare contagens e registros antigos antes/depois; devem permanecer iguais. Confirme as oito categorias existentes. Teste ainda rejeição de nota 0/6 por CHECK, duplicação de requestId por UNIQUE e UPDATE/DELETE de ServiceReview negados à identidade runtime. Essas tentativas ficam **somente na cópia**, sem operar em dados reais.

Depois da validação isolada e revisão dos scripts, o responsável pode aplicar no Windows:

```powershell
# Usa apps/api/.env.migrations existente, com MIGRATION_DATABASE_URL separado.
# Não substitua esse arquivo pelo .env runtime e não cole sua conexão em logs.
npm.cmd run db:migrate:status -w @omini/api
npm.cmd run db:migrate:deploy -w @omini/api
npm.cmd run db:migrate:status -w @omini/api
```

O primeiro status pode indicar migrations pendentes. Só deploy as aplica. No SSMS com administrador de implantação, selecione OminiDB e abra/examine/execute, nessa ordem, `docs/sql/contact-runtime-permissions.sql` e `docs/sql/reviews-runtime-permissions.sql`. Não há execução automática dos GRANTs no startup da API. Confira que a identidade runtime possui SELECT/INSERT nas estruturas anteriores necessárias e somente SELECT/INSERT em avaliações. Não use `db push`, `migrate reset` ou um rollback que apague a tabela. Uma reversão de release deve preservar as estruturas/dados adicionais e considerar restringir novos envios durante a troca de versões.

Não altere `apps/api/.env`, senha, chave JWT, nome OminiDB nem porta local 1433 se a instalação atual já funciona. API e mobile continuam usando as configurações existentes. Em dois terminais:

```powershell
# Terminal 1
Set-Location C:\projetos\omini
npm.cmd run dev:api

# Terminal 2
Set-Location C:\projetos\omini
Invoke-RestMethod http://localhost:3000/api/health
ipconfig
npm.cmd run dev:mobile -- --clear
```

Se o IPv4 mudou, ajuste apenas `EXPO_PUBLIC_API_URL` em `apps/mobile/.env` para `http://IP_ATUAL_DO_PC:3000/api` e reinicie Expo. O último IP informado pelo responsável era `192.168.0.6`; confirme-o com ipconfig, pois pode mudar. No iPhone/Samsung, nunca use localhost/127.0.0.1 para a API. Ambos precisam acessar `http://IP_ATUAL_DO_PC:3000/api/health` na mesma rede privada. Para fora do desenvolvimento local use HTTPS, conforme a proteção existente do aplicativo.

## Roteiro em iPhone e Samsung

Execute nos dois dispositivos, com Expo Go compatível com SDK 58 e a API atualizada. Estes passos ainda precisam de execução física; os testes automatizados usam linking simulado e não enviam mensagens.

1. Cadastre cliente com celular inválido: nenhum cadastro deve ser enviado. Informe DDD/celular válido, escolha WhatsApp e autorize compartilhar após aceite. Confirme máscara, labels, teclado e legibilidade em tela estreita/texto ampliado.
2. Entre numa conta antiga sem telefone. Login e histórico devem funcionar; uma solicitação nova exige atualizar o contato. Atualize em Minha conta sem recriar a conta. Teste também prestador adicionando perfil cliente e mantendo o mesmo usuário/sessão.
3. Cliente solicita serviço; confirme contador/banner no outro aparelho como antes. Prestador abre o pedido antes de aceitar: nenhum contato. Outra conta prestadora não pode consultar esse contato pelo endpoint.
4. Prestador aceita. O texto deve explicar interesse em conversar, sem confirmar preço. Consulte contato. WhatsApp abre o número correto com somente a mensagem genérica; envio depende de confirmação no WhatsApp. Ligar abre o discador. Sem WhatsApp indicado, somente Ligar. Sem WhatsApp instalado/falha externa, retorne e use a alternativa sem travar o Omini.
5. Mude o celular do cliente e consulte novamente pelo prestador: deve usar o atual. Retire autorização: nova consulta fica indisponível. Reautorize quando desejar. Coloque o app em segundo plano e volte: precisa consultar novamente; telefone não reaparece por cache.
6. Recuse/cancele outro pedido: não libera contato. Faça atendimento aceito → em andamento → informar conclusão → cliente confirma. Reabertura e cancelamento pré-início continuam com suas regras. Depois de COMPLETED, nova consulta de contato fica indisponível.
7. Ao confirmar conclusão, a opção “Avalie o atendimento” é voluntária. Dispense o banner/saia e avalie depois pelo histórico. Voltar com rascunho precisa confirmar descarte; formulário não mostra barra profissional.
8. Escolha nota 1..5, comentário opcional e publique após ler a regra de imutabilidade. Vários toques não duplicam. A própria avaliação aparece no atendimento; não oferece outra publicação. Um prestador/terceiro e pedidos não concluídos não podem publicar. Repita em um pedido concluído antigo com histórico válido.
9. Abra perfil público e Meu perfil do prestador: média/quantidade/notas/comentários/datas devem coincidir com registros reais. Sem avaliações, somente estado vazio. Gere mais de cinco avaliações legítimas no ambiente de teste e confira paginação. Atualize/focalize ou aguarde o ciclo do monitor ativo para receber os dados no segundo aparelho.
10. Saia, entre em outra conta e reabra o aplicativo. Sessão persistente e isolamento de conta devem permanecer; não devem surgir telefone, avaliação privada ou banner da conta anterior. Teste rede indisponível/retry e envio com resposta incerta sem duplicar solicitação/avaliação.
11. Confira painel com três cards, barra inferior, Ajuda, retorno ao painel, serviços/áreas/edição/ativação/desativação, catálogo real e modo demonstrativo. Faça uma rodada com fonte ampliada e home indicator/gestos Android.

## Validação disponível e limites

Resultados e lista completa dos arquivos estão em [relatório da Fase 2.5](fase-2-5-validacao.md). Nenhuma migration, GRANT ou teste modificou o SQL Server real. Não houve teste físico no iPhone/Samsung. A aplicação em OminiDB e o roteiro nos aparelhos dependem da revisão e execução pelo responsável, incluindo a pendência da instância isolada.
