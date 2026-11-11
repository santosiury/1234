# Omini — Fase 2.3: prestadores e catálogo integrado

## Base e escopo

Implementação sobre a branch existente `feature/fase-2-3-prestadores`, inicialmente em `1d692e776a353612adc096b62de4ccd1b33a7514`. Sem merge na main. Mantidos Expo SDK 58, RN 0.88.1, React 19.3, Inter, cores, marca, splash, abas e o dimensionamento responsivo dos CTAs.

A API de produção consulta/grava SQL Server com Prisma 6.19.3, pelo `PrismaService` e adapter existentes. Não existe repositório em memória ou fallback demonstrativo no runtime da API. Doubles em memória estão exclusivamente em `test/`.

Fluxo: conta existente → ativar prestador em `/auth/profiles` → editar nome/bio → cadastrar serviço em categoria ativa → cadastrar cidade/UF/bairro → outra conta (ou visitante) encontra o perfil no catálogo. Contratação, pagamentos, fotos, mapas, avaliações, preços e disponibilidade em tempo real continuam fora do escopo.

## Dados e permissões

Reutilizados `ProviderProfile`, `ProviderService`, `ProviderServiceArea`, `ServiceCategory` e `User`. Nenhum campo, modelo, índice ou migration foi criado ou alterado. `schema.prisma` continua com `sqlserver`; `migration_lock.toml`, com `mssql`. As migrations anteriores e o seed das oito categorias permanecem intactos.

Não há migration a aplicar nesta fase. Não execute `db push`, reset, deploy ou seed para instalar essa atualização. Nenhum SQL de migração foi executado na nuvem ou no Windows do usuário.

Os grants já existentes em `docs/sql/runtime-permissions.sql` cobrem SELECT/INSERT/UPDATE das nove tabelas. Nenhuma nova permissão é necessária. Não há DELETE, DDL, db_owner ou db_datawriter nas novas operações. Edições/desativações mantêm os registros e usam `isActive`.

O perfil é criado pela ativação já existente de autenticação, não por uma segunda conta. Nome profissional e bio são editáveis; o status do próprio perfil segue as regras existentes da conta e não pode ser forjado pelo editor. Perfis desativados não são reativados por esse cadastro. Serviços e áreas têm desativação/reativação própria. Nome de login e nome profissional são independentes.

## Endpoints e contratos

Prefixo `/api`; Swagger atualizado em `/docs` e especificação em `/docs-json`. Corpos, parâmetros, respostas e segurança estão documentados. Contratos TypeScript em `packages/shared/src/index.ts`.

| Método e caminho                  | Acesso  | Resultado / corpo                                         |
| --------------------------------- | ------- | --------------------------------------------------------- |
| GET `/catalog/categories`         | Público | `CatalogCategory[]`, somente categorias ativas            |
| GET `/catalog/providers`          | Público | `ProviderPage`: `items`, `total`, `page`, `pageSize`      |
| GET `/catalog/providers/:id`      | Público | `PublicProvider` ou 404                                   |
| GET `/provider/me`                | Bearer  | `ProviderWorkspace`, com serviços/áreas ativos e inativos |
| PATCH `/provider/me`              | Bearer  | `{ professionalName?, bio? }`                             |
| GET `/provider/me/services`       | Bearer  | Serviços da conta atual                                   |
| POST `/provider/me/services`      | Bearer  | `{ categoryId, title, description?, isActive? }`          |
| PATCH `/provider/me/services/:id` | Bearer  | Campos anteriores opcionais, ao menos um                  |
| GET `/provider/me/areas`          | Bearer  | Áreas da conta atual                                      |
| POST `/provider/me/areas`         | Bearer  | `{ city, state, neighborhood?, isActive? }`               |
| PATCH `/provider/me/areas/:id`    | Bearer  | Campos anteriores opcionais, ao menos um                  |

Respostas de criação: 201; consultas/alterações: 200. O proprietário vem sempre de `CurrentUser` + `AccessGuard`, nunca do corpo ou query string. `userId`, `providerId`, propriedades desconhecidas e PATCH vazio são recusados.

Limites: nome/título 2–120 caracteres; bio/descrição até 1000; cidade 2–100; bairro até 100; UF brasileira válida, normalizada para maiúsculas. Bairro vazio significa **toda a cidade**, não ausência de área. Até 50 serviços e 50 áreas por prestador, incluindo inativos; ao atingir o limite, edite um registro existente. Categorias não podem ser criadas pelo editor.

Erros seguem o filtro existente (`statusCode`, `code`, `fields`, `message`, `timestamp`). Sem token: 401; sem perfil prestador ativo: 403; id de outro proprietário: 404; validação: 400; duplicidade/concorrência/limite de coleção: 409; consultas excessivas: 429; banco indisponível: 503. Nunca retornar mensagens internas de SQL, credenciais ou stack traces ao mobile.

## Pesquisa e publicação

Parâmetros opcionais de `/catalog/providers`:

- `q`: até 80 caracteres; nome profissional, título de serviço ou nome da categoria.
- `categoryId`: UUID da categoria ativa, obtido da API.
- `city`, `state`, `neighborhood`: localização de atendimento.
- `page`: 1–1000, padrão 1.
- `pageSize`: 1–20, padrão 10.

Exemplo público:

```text
/api/catalog/providers?q=eletricista&city=Ararangu%C3%A1&state=SC&neighborhood=Centro&page=1&pageSize=10
```

Um profissional aparece somente se sua conta e perfil estiverem ativos, existir serviço ativo em categoria ativa e ao menos uma área ativa. O detalhe público segue os mesmos critérios e inclui apenas serviços/categorias e áreas ativos. Não há publicação manual adicional; salve os dados e atualize a busca.

Busca SQL parametrizada com `Prisma.sql`/`$queryRaw`, `COLLATE Latin1_General_100_CI_AI` para caixa/acentos, e escape dos metacaracteres de LIKE (`%`, `_`, `[`, `~`) como texto literal. Não há SQL concatenado a partir da entrada do usuário. `EXISTS` evita duplicação por múltiplos serviços/áreas. Cidade, UF e bairro precisam corresponder **na mesma área**; uma área de toda a cidade também corresponde a um bairro pesquisado. Ordenação por nome profissional CI/AI e id desempata a paginação. Categorias usam `sortOrder` e id.

O limite de consultas é de 120 por IP/minuto por processo para o módulo. O cache HTTP é `no-store`. Consultas mais amplas usam paginação limitada; não são aceitos campos arbitrários de ordenação/filtro. Em implantação com múltiplas instâncias, o limite por processo deve ser complementado por um limite compartilhado no gateway, como já ocorre com a autenticação.

## Autorização e sessão

As escritas usam transações Prisma com isolamento Serializable, conferindo perfil ativo/conta e propriedade do serviço/área antes de atualizar. Nenhuma operação transfere propriedade. Conflitos de unicidade não sobrescrevem dados, e conflitos de transação recebem resposta segura para atualizar/tentar novamente.

A exportação do guard pelo `AuthModule` permite reutilizá-lo. `SessionManager.request<T>` expõe operações privadas pela mesma fila e rotação de refresh existente; não implementa outra autenticação e não altera expiração, revogação, hashing ou storage. Access token continua em memória, refresh exclusivamente no Expo SecureStore. Uma resposta privada 401 passa pela recuperação/expiração já existente; o usuário volta ao login se a sessão não puder ser recuperada.

O payload público não inclui e-mail, telefone, userId, credenciais, sessões ou tokens. Use os ids públicos de prestador/serviço/categoria/área, sem inferir o id da conta.

## Mobile e demonstração

A entrada continua compacta. O acesso único agora se chama **Explorar Omini** e revela **Buscar profissionais reais**, além das duas opções demonstrativas. Usuários sem login podem consultar o catálogo. Contas autenticadas entram no catálogo real por padrão; a alternância de experiência respeita os perfis habilitados. Uma conta apenas prestadora pode ativar cliente pela área de conta existente.

O modo de origem (`real` / `demo`) permanece apenas em memória e é reiniciado ao trocar a identidade. Os registros demonstrativos estão separados em `src/demo/screens/` e mantêm avisos explícitos. Não há mistura nem fallback para profissionais fictícios quando a API falha.

- Cliente: home, categorias ativas, busca por nome/serviço, filtros recolhíveis de localização, paginação e detalhe público.
- Prestador: painel de completude, perfil profissional (nome/bio + áreas), serviços por categoria, edição e desativação/reativação.
- A área de perfil mantém os controles de conta, ativação dos perfis, alternância e logout.
- Estados de leitura, erro com tentativa novamente, vazio, envio, sucesso, validação e sessão expirada.
- Releitura ao focar telas, descarte de respostas antigas ao sair/mudar filtros e bloqueio de submissão durante salvamento.
- Formulários usam os componentes existentes, CTAs com altura adaptável, categorias com quebra de linha e descrições multiline com espaço adequado. Sem fotos ou números de avaliação/distância inventados.

## Arquivos principais

- `apps/api/src/marketplace/`: controllers, validação, guard de consultas, service, repositório Prisma e construtor de busca SQL.
- `apps/api/src/app.module.ts`, `auth/auth.module.ts`, `configure-app.ts`: integração e Swagger.
- `packages/shared/src/index.ts`: contratos reais, preservando os contratos demonstrativos existentes.
- `apps/mobile/src/marketplace/`: transporte REST validado, hooks de leitura, cards, catálogo e formulários.
- Rotas existentes `app/client/*`, `app/professional/[id].tsx`, `app/provider/*` e boas-vindas: integração, sem nova arquitetura de navegação.
- `src/mode.tsx`, `components/Profile.tsx`, `components/ui.tsx`, `auth/session-manager.ts`: seleção de origem, composição do perfil, textarea e chamada privada com sessão existente.
- `src/demo/screens/`: telas anteriores movidas para a experiência explicitamente demonstrativa.
- Testes `marketplace*.test.*`, doubles em `test/support/`, regressões de navegação/sessão e workflow de qualidade.

## Validação na nuvem

| Verificação executada                                        | Resultado                                                                                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                                          | Aprovado: API, mobile e shared                                                                                              |
| `npm run lint`                                               | Aprovado                                                                                                                    |
| `npm test`                                                   | **72 aprovados**, sem skips: 41 API/scripts e 31 mobile. Preservados os 48 anteriores e adicionados 24                      |
| `npm run build:api`                                          | Aprovado                                                                                                                    |
| `npm run prisma:validate -w @omini/api`                      | Aprovado via WASM; nove modelos                                                                                             |
| `npm run check:migrations -w @omini/api`                     | Aprovado; somente análise estática, nenhum SQL executado                                                                    |
| `npm run check:brand`                                        | Aprovado                                                                                                                    |
| `npm run check:routes`                                       | 18 arquivos de rota e duas experiências aprovados                                                                           |
| `npm run check:secrets`                                      | Aprovado para arquivos rastreados e novos não ignorados                                                                     |
| `npm ls --all`                                               | Sem dependências inválidas; nenhum manifest/lockfile alterado                                                               |
| `EXPO_OFFLINE=1 npm run check:dependencies -w @omini/mobile` | Matriz local do SDK 58 alinhada; consulta remota não realizada                                                              |
| `npm run export:ios -w @omini/mobile -- --max-workers 2`     | Bundle Hermes aprovado (~2,7 MB)                                                                                            |
| `npm run export:android -w @omini/mobile -- --max-workers 2` | Bundle Hermes aprovado (~2,7 MB)                                                                                            |
| Revisão auxiliar no Chromium                                 | Catálogo público em 320, 375, 390 e 430 px; campos dentro da largura, vazio e contratação desabilitada, sem erros de página |

Os exports foram executados com `EXPO_OFFLINE=1 EXPO_NO_DOTENV=1`, sem incorporar configurações locais da API/banco. As ferramentas de teste que precisam de sockets locais/subprocessos rodaram com a permissão do ambiente. O adaptador de prévia foi temporário e removido; não há aplicação web/PWA ou novas dependências na entrega. A inspeção no navegador usou eventos programáticos para navegação entre telas, não constitui teste de toque nativo.

Cobertura adicional: ativação do prestador na mesma conta, perfil, serviço, área, edição, desativação/reativação, buscas e filtros, ordenação/paginação, proteção de propriedade, projeção pública sem credenciais, SQL parametrizado, limites, dados inativos, falha segura, recuperação de sessão e formulários completos com troca de contas.

Os testes HTTP executam controllers/guards/services reais com repositórios de teste. Os testes do repositório Prisma verificam escopo, seleção, SQL parametrizado, ordenação, limites e transações com um client controlado. As integrações mobile usam formulários, roteador, validação dos contratos e gerenciador de sessão reais, com transporte controlado. O teste completo troca a conta prestadora por outra conta cliente e encontra o perfil salvo na fixture. **Nenhum desses testes comprova conexão/execução no SQL Server real.**

A revisão auxiliar de layout no Chromium usa respostas controladas, não cadastros no OminiDB; também não substitui UIKit/CoreText, teclado/safe area nativos nem execução em Expo Go no iPhone. Nada do adaptador ou das respostas de revisão foi adicionado ao aplicativo de produção.

## Atualização em C:\projetos\omini

Pare API e Expo com Ctrl+C. Salve alterações locais antes de trocar de branch, sem reset destrutivo:

```powershell
Set-Location C:\projetos\omini
git status --short
git fetch origin
git switch feature/fase-2-3-prestadores
git pull --ff-only origin feature/fase-2-3-prestadores
npm ci
npm run typecheck
npm run lint
npm test
npm run build:api
npm run prisma:validate -w @omini/api
npm run check:migrations -w @omini/api
npm run check:brand
```

Preserve `apps/api/.env` e `apps/mobile/.env`. Não gere outra chave JWT, não altere senhas e não copie os templates sobre suas configurações. No ambiente já validado da Fase 2.2, `PERSISTENCE_ENABLED=true` e `AUTH_ENABLED=true` devem continuar habilitados. Conexão com OminiDB, `omini_app`, porta e certificados permanecem como antes. Sem banco habilitado, o catálogo retorna 503 de forma explícita; `/api/health` continua independente.

**Nenhuma migration, seed ou concessão SQL adicional é necessária.**

Primeiro terminal:

```powershell
npm run dev:api
```

Segundo terminal:

```powershell
Set-Location C:\projetos\omini
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:3000/api/catalog/categories |
    Format-Table id, name, slug
Invoke-RestMethod 'http://localhost:3000/api/catalog/providers?city=Ararangu%C3%A1&state=SC'
ipconfig
npm run dev:mobile -- --clear
```

Health apenas confirma o processo. Uma resposta válida de categorias consulta de fato o banco; uma lista de prestadores vazia antes de completar os cadastros é normal. Verifique no `.env` mobile o IPv4 do Windows: `EXPO_PUBLIC_API_URL=http://IP_DO_WINDOWS:3000/api`. Não use localhost no celular. Confirme a rota de categorias pelo Safari usando esse IP e permita API/Metro na rede privada do Firewall.

## Roteiro obrigatório no iPhone com SQL Server real

1. Abra o Expo Go compatível com SDK 58 na mesma rede do Windows. Escaneie o QR e confirme a entrada compacta, logo, Inter e CTAs completos.
2. Entre em sua conta A. Em Perfil, ative **Adicionar perfil de prestador** se necessário. O id da conta não muda.
3. Use **Mudar para prestador**, abra Perfil e salve nome profissional e descrição. Confirme sucesso, saia da aba e volte para comprovar releitura.
4. Em Perfil, cadastre cidade **Araranguá**, UF **SC**, bairro **Centro** (ou deixe vazio para toda a cidade). Salve a área.
5. Em Serviços, selecione **Eletricista** da API, cadastre título **Reparo elétrico residencial** e descrição. Confirme a listagem e **Cadastro visível no catálogo** no painel.
6. Encerre e reabra o app. Confirme a sessão e a persistência do perfil, serviço e área. Nenhum dado depende de estado demonstrativo local.
7. Saia da conta A e entre com outra conta B, com perfil cliente. Busque **eletricista** e filtre Araranguá/SC/Centro. Alternativamente, consulte sem login por **Explorar Omini → Buscar profissionais reais**.
8. Encontre a conta A, abra o detalhe, confira nome, bio, serviço e áreas. Contratação permanece desabilitada, sem avaliação, preço ou disponibilidade inventada.
9. Na conta A, edite o serviço, desative-o e atualize a busca da conta B: com o único serviço inativo, o prestador some do catálogo. Reative e repita com a única área de atendimento. Os registros permanecem no banco.
10. Na conta B, tente um PATCH de um id de serviço/área da conta A somente em um teste local autorizado: deve retornar 404 sem alteração. O aplicativo não oferece essa ação; os testes automatizados já cobrem a tentativa.
11. Teste ausência de resultado, falha de conexão, retry, sessão expirada, troca de conta e logout. API/banco indisponível não pode mostrar catálogo fictício como substituição.
12. Confira teclado, rolagem, Dynamic Island/home indicator, fontes ampliadas e VoiceOver, especialmente descrições e seleção de categorias. Repita em Android quando disponível.

Não compartilhe tokens, senhas, `.env` ou capturas com credenciais. Para confirmar os dados no SQL Server, use consultas somente de leitura nas tabelas existentes, com uma ferramenta local; não edite dados de produção para testar.

## Limitações e pendências

Não houve conexão ao SQL Server do Windows, teste físico no iPhone/Android, nem execução da splash nativa nesta nuvem. A SQL com collation/parametrização e as permissões runtime precisam do roteiro local acima para validação definitiva no seu servidor. Não foram gerados nem publicados IPA/APK. Os bundles validam empacotamento JavaScript/Hermes, não a execução em aparelho. Não houve merge na main nem alterações em credenciais locais.
