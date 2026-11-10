# Fase 2.2 — Autenticação Omini

Base obrigatória: `feature/fase-2-1-sqlserver-prisma`, commit `404d4ce13a6f84b330c1a78c9f262f62dee73500`. Branch de entrega: `feature/fase-2-2-autenticacao`. Nenhum merge automático. O schema mantém `sqlserver`; `migration_lock.toml` mantém `mssql`, conforme a correção já validada no SQL Server do usuário.

## O que foi implementado

Cadastro, login, perfil autenticado, acesso JWT, refresh com rotação, logout e restauração da sessão mobile. Uma conta pode ter cliente, prestador ou ambos. A experiência demonstrativa permanece disponível sem autenticação/banco. Categorias e profissionais apresentados no catálogo continuam fictícios: autenticar não habilita contratação, pagamentos, pedidos ou avaliações.

Arquivos principais:

- `apps/api/src/auth/`: validação, Argon2id, JWT, guards, rate limiter, repositório Prisma e endpoints.
- `apps/api/src/persistence/`: cliente compartilhado e ciclo de vida preservados, agora disponível para o repositório de autenticação.
- `apps/api/prisma/schema.prisma`, migration incremental e snapshot histórico da Fase 2.1; o SQL inicial aplicado não foi alterado.
- `apps/api/scripts/auth-key.ts`: geração de chave aleatória diretamente no `.env` local, sem exibir o valor.
- `apps/mobile/src/auth/`, rotas `login`, `register`, `account`, perfil e contexto de modos: integração, SecureStore e estados de sessão.
- `packages/shared/src/index.ts`: contratos TypeScript, sem segredos ou código de banco no bundle mobile.
- Testes API/mobile, validação de SQL, scripts de permissões, CI e documentação.

## Modelo e migration incremental

`20261110000000_authentication/migration.sql` adiciona exclusivamente:

| Tabela         | Finalidade                                                              |
| -------------- | ----------------------------------------------------------------------- |
| AuthCredential | Uma credencial por User, e-mail normalizado único e hash Argon2id       |
| AuthSession    | Família de sessão por login/dispositivo, expiração absoluta e revogação |
| RefreshToken   | Hash único do token opaco, consumo por rotação e expiração              |

As seis tabelas de negócio e seus dados/índices são preservados. Não há backfill de senhas, normalização destrutiva de emails existentes ou recriação de banco. Os relacionamentos novos usam UUIDs, FKs `NO ACTION` e timestamps UTC. O snapshot da modelagem anterior serve à validação da migration inicial; sua extensão `.snapshot` impede carregamento como segundo schema Prisma.

O SQL incremental é aditivo, transacional e recusa banco incorreto ou colisões. Foi derivado da modelagem e validado estaticamente contra o DMMF do Prisma. **Não foi aplicado nesta nuvem**, nem validado por execução no SQL Server. O teste de integridade também verifica o checksum do SQL antigo e a preservação dos campos/índices antigos. Isso não substitui o deploy e testes reais no Windows.

Usuários legados sem AuthCredential não recebem senha automaticamente nem podem ser assumidos por um novo cadastro com o mesmo email. Use um email novo para testar; eventual habilitação de contas legadas exige um fluxo verificado separado, fora desta fase.

## API e segurança

| Endpoint                | Acesso                              | Resultado                                                           |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| POST /api/auth/register | Público, limitado                   | 202 com mensagem genérica, inclusive para email duplicado           |
| POST /api/auth/login    | Público, limitado                   | Access token, refresh token, expirações e usuário seguro            |
| POST /api/auth/refresh  | Prova pelo refresh token            | Rotação de uso único; 401 se inválido/reutilizado                   |
| POST /api/auth/logout   | Prova pelo refresh token            | 204 idempotente; revoga somente a família correspondente            |
| GET /api/auth/me        | Bearer JWT + sessão válida no banco | ID, nome, email e perfis ativos                                     |
| POST /api/auth/profiles | Bearer JWT + sessão válida          | `{ "role": "client" }` ou `provider`; adiciona perfil à mesma conta |

- Senha: 12 a 128 caracteres, não apenas espaços; não é aparada nem armazenada em texto puro. Argon2id com 64 MiB, três iterações, paralelismo 1 e salt aleatório da biblioteca.
- Login incorreto, conta desconhecida/desativada e conta sem credencial retornam a mesma mensagem 401. Verificação com hash fictício reduz diferenças de custo para emails desconhecidos. Cadastro duplicado não modifica a conta existente e retorna o mesmo 202.
- Access JWT HS256: 15 minutos, issuer/audience fixos e assinatura validada; cada chamada privada também confirma usuário ativo e família não revogada/expirada no banco. Logout invalida imediatamente até access tokens ainda dentro dos 15 minutos.
- Refresh: 256 bits aleatórios, somente SHA-256 persistido. Família com validade absoluta de 30 dias, sem renovação indefinida. O consumo condicional e a criação do sucessor ocorrem na mesma transação. Reutilização de token consumido revoga a família inteira, inclusive o sucessor. Nenhuma senha/token/hash/chave é retornado em erros ou logs.
- Adicionar um perfil não cria outra conta e não reativa um perfil desativado administrativamente. O ID do usuário vem do guard, nunca do corpo da requisição.
- Validação estrita rejeita campos extras; erros JSON e erros internos são sanitizados. Respostas de autenticação usam `Cache-Control: no-store`.
- Rate limiting: login/cadastro, 20 tentativas por IP/15 min e cinco por par IP/email normalizado; demais rotas, 120 por IP/min. Email usado na chave do contador é HMAC, não texto puro. Respostas 429 incluem `Retry-After`.
- O limiter é **em memória por processo**, adequado ao backend único desta entrega. Antes de múltiplas instâncias, é necessário um armazenamento compartilhado/limite no gateway. Não habilite `trust proxy` indiscriminadamente: headers de IP enviados pelo cliente não são confiáveis.
- Tokens consumidos são retidos para detectar replay. A role runtime não recebe DELETE; manutenção/retensão das famílias expiradas é responsabilidade administrativa, sem job destrutivo nesta fase.

Não há recuperação de senha, verificação de email, MFA ou funcionalidades de negócio futuras nesta entrega. Autenticação exige `AUTH_ENABLED=true`, persistência e uma chave JWT adequada. Sem isso, as rotas de autenticação respondem 503 genérico e `/api/health`/demonstração continuam funcionando.

## Sessão no iPhone

Somente o refresh token e sua intenção (`refresh` ou `revoke`) ficam no Expo SecureStore. O access token e o usuário ficam em memória; não há AsyncStorage, localStorage ou arquivo de tokens. A acessibilidade Keychain é `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. SecureStore é o pacote compatível com SDK 58; não foi adicionado requisito de biometria/development build para esse fluxo básico.

Na abertura, o app mostra carregamento, lê o SecureStore e gira a credencial antes de autenticar. Falha de rede preserva o registro seguro e mostra opção de tentar novamente/demonstração; 401 expira a sessão. No retorno ao primeiro plano, o app consulta o usuário autenticado. Ações privadas fazem uma tentativa de refresh quando o access token é recusado.

O gerenciador serializa login/refresh/ações privadas/logout para evitar duas rotações do mesmo token e retorno de sessão após saída. Se o logout ocorrer sem rede, grava primeiro uma intenção segura de revogação, encerra a sessão local e a reenvia posteriormente. O reenvio ocorre na reabertura, no retorno ao primeiro plano ou antes de nova entrada; não há monitoramento contínuo de conectividade. Essa intenção **nunca** é usada para restaurar login; nova entrada aguarda sua revogação. Se o SecureStore falhar ao gravar essa intenção, o app informa que a saída não foi concluída, em vez de prometer logout seguro.

Perder uma resposta de refresh pode significar que o servidor já consumiu o token. Não há retry automático em loop: uma nova tentativa pode detectar replay e exigir login. Esse é um limite conhecido da rotação estrita, especialmente em rede instável.

Keychain/Expo Go e o comportamento real de suspensão, reinício ou reinstalação precisam de validação no iPhone. A conta real usa somente os perfis cadastrados; a demonstração sem conta permanece separada e explicitamente identificada.

## Atualizar em C:\projetos\omini

### 1. Atualizar código e instalar

Encerre API e Metro anteriores com Ctrl+C. Preserve modificações indicadas pelo primeiro comando; não use reset/checkout forçado.

```powershell
Set-Location C:\projetos\omini
git status --short
git fetch origin
git switch feature/fase-2-2-autenticacao
git pull --ff-only
npm ci
npm run typecheck
npm run lint
npm test
npm run build:api
npm run prisma:validate -w @omini/api
npm run check:migrations -w @omini/api
```

Use Node 22 LTS >=22.13 ou 24 LTS >=24.3. `npm ci` gera o Prisma Client 6.19.3 com os nove modelos; não modifica o banco. Se o addon Argon2 precisar de build na sua plataforma, siga a documentação oficial da biblioteca e use ferramentas oficiais, sem desativar TLS/checksums ou forçar peers.

### 2. Revisar/aplicar somente a migration incremental

OminiDB e a migration da Fase 2.1 já existem: não recrie o banco nem rode o SQL inicial manualmente. Faça backup local, revise o novo SQL e confira o histórico no SSMS. Preserve `apps/api/.env.migrations` com a identidade de migração separada; não use omini_app para DDL.

```powershell
npm run db:migrate:status -w @omini/api
# Status pode retornar código não zero porque existe a migration nova pendente.
npm run db:migrate:deploy -w @omini/api
if ($LASTEXITCODE -ne 0) { throw 'Migration nao concluida; nao habilite autenticacao.' }
npm run db:migrate:status -w @omini/api
```

O wrapper executa somente status/deploy, não reset/db push. Não execute estes comandos no Codex apontando para seu Windows. A CLI precisa acessar normalmente os artefatos verificados do Prisma no computador local. Não ignore falhas de checksum. Se o inventário/histórico divergir, pare e reconcilie antes de continuar.

### 3. Conceder DML às tabelas novas

No SSMS, com identidade administrativa confiável e **OminiDB selecionado**, revise/execute `docs/sql/auth-runtime-permissions.sql`. Ele concede à role existente `omini_runtime_role` apenas SELECT/INSERT/UPDATE em AuthCredential, AuthSession e RefreshToken. O script completo `runtime-permissions.sql` também foi atualizado para instalações novas.

Não conceda db_owner, db_datawriter, permissões de servidor, DDL ou acesso runtime a `_prisma_migrations`. Nenhuma permissão de migração é adicionada a omini_app. Não é necessário repetir o seed para autenticação; as oito categorias permanecem. O seed idempotente continua disponível para conferência local, sem apagar registros.

### 4. Habilitar backend sem publicar segredos

Preserve o `DATABASE_URL` existente em `apps/api/.env`, com omini_app, localhost:1433 e OminiDB. Não copie senha, URL privada ou chave para o chat/Git/mobile. Gere a chave **no seu computador**, sem exibir seu valor:

```powershell
npm run auth:key -w @omini/api
```

O comando acrescenta uma chave aleatória ao `.env` local e preserva chave existente. Não rotacione essa chave a cada startup. Edite localmente as flags:

```dotenv
PERSISTENCE_ENABLED=true
AUTH_ENABLED=true
```

`JWT_ACCESS_SECRET` deve estar presente (ao menos 48 bytes); o gerador cria 48 bytes aleatórios codificados em base64. `DB_DIAGNOSTICS_ENABLED` continua opcional e restrito a desenvolvimento/loopback. A credencial de migração não pertence a este `.env` runtime.

```powershell
npm run dev:api
```

Em outro terminal:

```powershell
Set-Location C:\projetos\omini
Invoke-RestMethod http://localhost:3000/api/health
Start-Process http://localhost:3000/docs
```

Nunca use JWT_ACCESS_SECRET em EXPO_PUBLIC_*. O transporte HTTP é permitido apenas para desenvolvimento em LAN privada confiável, com conta descartável de teste. Use HTTPS antes de dados reais/implantação; o cliente mobile de release rejeita autenticação por HTTP. SQL Server mantém a configuração TLS da Fase 2.1.

### 5. Iniciar Expo e testar no iPhone

Preserve/ajuste `apps/mobile/.env` com `EXPO_PUBLIC_API_URL=http://IP_DO_WINDOWS:3000/api`. Não use localhost no telefone. Windows/iPhone na mesma Wi-Fi, firewall para Node/3000 e Metro/8081 na rede privada e permissão de Rede Local no Expo Go.

```powershell
Set-Location C:\projetos\omini
npm run dev:mobile -- --go --clear
```

Atualize/abra o Expo Go com SDK 58 e escaneie o novo QR. Não reutilize o Metro da branch antiga.

Roteiro funcional:

1. Confirme que as experiências demonstrativas antigas continuam acessíveis, inclusive busca, detalhes, retorno, dashboard e teste de health.
2. Abra **Cadastrar no Omini**. Tente nome/email inválidos e senha curta: deve mostrar erro sem criar conta.
3. Cadastre nome, email novo e senha de 12–128 caracteres. Selecione apenas cliente para testar restrição, ou os dois perfis para alternância imediata. A resposta de cadastro é genérica, mesmo para email já existente.
4. Entre com senha errada: erro genérico. Entre corretamente: abre o modo permitido; na aba Perfil aparecem seu nome/email reais. Confira no SSMS um único User/AuthCredential para a conta de teste; não selecione hashes/tokens para copiar em logs.
5. Na conta apenas cliente, o modo prestador não é acessível antes de **Adicionar perfil de prestador**. Depois, alterne pelos botões do perfil. O ID da conta deve continuar o mesmo; nenhuma contratação é criada.
6. Feche e reabra o aplicativo: deve restaurar a sessão pelo SecureStore, com breve carregamento e rotação no servidor. Verifique também suspensão/retorno ao primeiro plano.
7. Use **Sair da conta**. Feche/reabra: não deve voltar autenticado. Teste também desligar a rede antes de sair: deve informar revogação pendente e continuar deslogado; reconecte para concluir a revogação antes de nova entrada.
8. Para sessão expirada/revogada, use somente a conta descartável de desenvolvimento. No SSMS, identifique seu User.id e atualize **somente suas AuthSession** para `revokedAt=SYSUTCDATETIME()`. No iPhone toque **Atualizar conta**: deve voltar ao login com mensagem de sessão expirada. Não altere sessões de usuários reais.
9. Teste cinco senhas incorretas para o mesmo email/IP; a tentativa seguinte deve retornar limite, com espera indicada pelo servidor. Não interprete 429 como senha correta/incorreta.
10. Confira que o histórico anterior, as seis tabelas e os oito slugs de categorias permanecem. Desative diagnóstico local quando não estiver usando.

## Evidências e limites da entrega

Os testes HTTP usam NestJS, Argon2id e JWT reais com um repositório em memória de teste. A implementação de produção é Prisma/SQL Server; o double não é armazenamento alternativo do aplicativo. Testes adicionais cobrem o compare-and-set do repositório SQL, erros sanitizados, preservação da modelagem/migration antiga, sessão mobile, SecureStore, telas, perfis e logout offline. Os testes removem variáveis de credenciais e ignoram `.env` locais.

Resultados desta entrega após `npm ci` limpo:

| Verificação                       | Resultado                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| Geração e validação Prisma 6.19.3 | Passaram, nove modelos, sem conexão ao banco                                                       |
| Migrations inicial/incremental    | Contratos estáticos passaram; SQL antigo com checksum preservado                                   |
| Typecheck, lint e build da API    | Passaram                                                                                           |
| Testes automatizados              | **44 passaram: 27 API/scripts e 17 mobile**, nenhum ignorado                                       |
| Rotas                             | 18 arquivos e ambas as experiências verificados                                                    |
| Arquivos sensíveis / npm ls       | Passaram; sem peers inválidos                                                                      |
| Matriz Expo SDK 58                | Passou em modo offline, inclusive SecureStore 58.0.2                                               |
| Bundles iOS e Android             | Gerados em Hermes; não são builds IPA/APK ou testes em aparelho                                    |
| Expo Doctor                       | 18/20 passaram; schema remoto Expo e metadados React Native Directory pendentes por falhas de rede |
| SQL Server/iPhone reais           | Não executados nesta nuvem                                                                         |

As duas verificações remotas do Doctor não foram desativadas nem tratadas como aprovadas. Nenhuma liberação de rede ou publicação de configuração de ambiente foi realizada como parte desta tarefa.

Nenhuma migration, grant ou seed real foi executado na nuvem e nenhuma tentativa de conexão ao seu SQL Server Windows foi feita. Não há iPhone conectado para confirmar Keychain, teclado, autofill, rede ou execução nativa. Validação estática de SQL, mocks e bundles não comprovam execução de migrations, concorrência real no SQL Server ou uso em aparelho físico. Esses itens permanecem para o roteiro acima.
