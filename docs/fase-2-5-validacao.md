# Fase 2.5 — Relatório técnico e validação

Branch: `feature/fase-2-5-contato-avaliacoes`. Base obrigatória conferida e carregada: `df75d0f6253b062200565ce39aa5a9c78ec39a98`. Sem merge e sem execução de SQL no banco real.

## Implementado

- Cadastro de cliente e ativação posterior exigem contato válido/autorizado; Minha conta permite editar e retirar autorização sem alterar autenticação.
- Contato privado somente para o prestador original após aceite, durante atendimento aberto. Revalidação antes do linking, descarte ao sair/segundo plano, proteção contra respostas tardias e adaptadores vinculados à conta que os criou.
- WhatsApp/telefone por linking validado; mensagem genérica, alternativa de ligação e sem envio automático.
- Avaliação imutável por solicitação realmente concluída, pelo cliente original, com evidência no histórico. Nota 1..5, comentário opcional até 1.000, unicidade, validação e transação.
- Média decimal, quantidade e comentários paginados reais no catálogo e Meu perfil; autoria pública anônima e estado vazio sem nota fictícia.
- Avaliação opcional após conclusão e posteriormente pelo histórico; convite integrado ao monitor, sem push/timer adicional; formulário com proteção de saída.
- Documentação comercial de assinatura mensal futura, sem comissão, orçamento, chat ou pagamentos implementados.

Detalhes dos contratos, políticas e roteiro: [guia de implantação e testes nos aparelhos](fase-2-5-contato-avaliacoes.md).

## Validações executadas

| Verificação                                         | Resultado                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| API — suíte Node/Nest HTTP, domínio e contratos SQL | **82/82 aprovados**                                                                             |
| Mobile — Jest/Expo Router                           | **137/137 aprovados**, 17 suítes                                                                |
| Total                                               | **219 aprovados**; 186 anteriores preservados + 33 novos                                        |
| `npm run typecheck`                                 | Aprovado nos três workspaces                                                                    |
| `npm run lint`                                      | Aprovado                                                                                        |
| `npm run build:api`                                 | Aprovado                                                                                        |
| `npm run prisma:generate`                           | Cliente SQL Server gerado sem conectar ao banco                                                 |
| `npm run prisma:validate -w @omini/api`             | Aprovado por WASM; 12 modelos                                                                   |
| `npm run check:migrations -w @omini/api`            | Aprovado; somente análise estática de tipos, defaults, índices, FKs e guards                    |
| `npm run check:routes`                              | Aprovado; 38 rotas, Tabs cliente e Stacks profissionais ancoradas                               |
| Bundles Expo iOS/Android, `--max-workers 2`         | Gerados com Hermes; compilação não equivale a teste físico                                      |
| Metro `expo start --offline --port 8083`            | Inicializou; tipos da rota nova gerados                                                         |
| `npm run check:secrets` e revisão de projeções      | Aprovado; nenhum .env/chave/token real publicado                                                |
| Dependências / lockfile / migrations históricas     | Nenhuma alteração em dependências, package-lock ou migrations históricas; providers preservados |

Os testes usam repositórios em memória e doubles dos adaptadores Prisma para exercitar HTTP, autorização, concorrência e consultas parametrizadas. Eles **não executam T-SQL** e não comprovam conectividade/implantação em OminiDB. O runner da API desabilita persistência, ignora dotenv e remove variáveis de conexão/chave dos testes; novos testes seguem esse isolamento.

### Limitações registradas

- **SQL Server isolado não executado:** Docker estava operacional, mas o pull de `mcr.microsoft.com/mssql/server:2022-latest` falhou com Forbidden. Nenhum container SQL foi criado. Validar as duas migrations/GRANTs numa cópia isolada com dados representativos continua obrigatório antes da implantação real. Nenhum script foi apontado ao SQL Server Windows.
- **SQL Server real não testado:** sem conexão com a instalação do responsável. Não houve migration, GRANT, reset, db push, backfill ou alteração de dados reais.
- **iPhone e Samsung não testados fisicamente nesta entrega:** linking e navegação foram automatizados com mocks. Confirmar abertura de WhatsApp/discador, fallback, legibilidade, fonte ampliada, safe areas, teclado e fluxo completo nos aparelhos conforme o roteiro.
- **Expo remoto:** `expo install --check` foi bloqueado por HTTP Proxy Forbidden. Em `EXPO_OFFLINE=1`, terminou com “Dependencies are up to date”, mas o próprio Expo alerta que a validação offline é limitada. `expo-doctor` concluiu **18/20** verificações; schema remoto e React Native Directory ficaram pendentes por falhas de rede (incluindo EAI_AGAIN em exp.host). As verificações não foram desabilitadas no CI; repetir com rede disponível no Windows.
- Para produção, manter HTTPS e logs sem dados pessoais; a validação de formato de celular não é uma verificação de titularidade. Limites atuais são por processo, como a arquitetura existente.

Versões preservadas: Expo **58.0.23**, Expo Router **58.0.30**, React Native **0.88.1**, React **19.3.0**, Prisma **6.19.3**. Nenhuma instalação com `--force`/`--legacy-peer-deps`.

## Cobertura nova de regressão

`contact.test.ts`: formato/DDD/E.164, cadastro/consentimento, identidade/status do contato, legado e links genéricos.

`contact-reviews-http.test.ts`: autenticação, IDOR, projeções sem telefone, conta antiga e recuperação idempotente, consentimento, dois perfis, rate limit, elegibilidade/evidência, notas/comentários inválidos, publicações concorrentes, imutabilidade, média/paginação pública e do dono, avaliação posterior e preservação dos dados diante de falha.

`contact-reviews-sql.test.ts`: migration alinhada ao Prisma, CHECKs/unicidade/NoAction, GRANT mínimo, preservação histórica, AVG decimal parametrizado, mesma base válida na página/agregado e consulta privada transacional.

`contact-reviews-navigation.test.tsx`: atualização do contato no fluxo legado, publicação/retorno/histórico, rascunho protegido, WhatsApp/telefone simulados, fallback/erros sem conteúdo interno, revogação, ocultação em pedido concluído, reputação pública e do dono e descarte de resposta após blur.

`contact-reviews-api.test.ts`: adaptadores privados não executam com uma conta diferente e reputação pública não envia bearer/não aceita resumo fictício.

`request-monitor.test.ts`: convite opcional não se repete ao visualizar/atualizar/retomar, legado não gera backlog e publicação encerra convite; testes anteriores de sessão, ledger seguro, cancelamento, histórico, cidade/UF e formulários permanecem.

## Migrations e permissões para revisão

- `apps/api/prisma/migrations/20261115000000_customer_contact/migration.sql` — duas colunas opt-in em User; phone antigo intocado.
- `apps/api/prisma/migrations/20261115010000_service_reviews/migration.sql` — tabela nova ServiceReview, única por requestId, CHECKs e relações.
- `docs/sql/contact-runtime-permissions.sql` — colunas de contato para a role runtime existente.
- `docs/sql/reviews-runtime-permissions.sql` — SELECT/INSERT na tabela de avaliações, sem UPDATE/DELETE/DDL/administração.

O responsável deve revisar SQL, executar a validação isolada e somente então aplicar no Windows com a identidade de migration separada, manter as credenciais runtime existentes e executar os dois GRANTs como administrador de implantação. [Comandos completos e checklist iPhone/Samsung](fase-2-5-contato-avaliacoes.md#atualizar-cprojetosomini).

## Arquivos criados ou modificados

Lista relativa à base validada; artefatos dist e arquivos locais ignorados não são versionados.

- `.github/workflows/quality.yml`
- `README.md`
- `apps/api/prisma/migrations/20261115000000_customer_contact/migration.sql`
- `apps/api/prisma/migrations/20261115010000_service_reviews/migration.sql`
- `apps/api/prisma/schema.prisma`
- `apps/api/scripts/check-migrations.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/auth.validation.ts`
- `apps/api/src/auth/prisma-auth.repository.ts`
- `apps/api/src/configure-app.ts`
- `apps/api/src/contact/contact-rate.guard.ts`
- `apps/api/src/contact/contact.controller.ts`
- `apps/api/src/contact/contact.module.ts`
- `apps/api/src/contact/contact.repository.ts`
- `apps/api/src/contact/contact.service.ts`
- `apps/api/src/contact/prisma-contact.repository.ts`
- `apps/api/src/requests/prisma-requests.repository.ts`
- `apps/api/src/requests/requests.controller.ts`
- `apps/api/src/requests/requests.repository.ts`
- `apps/api/src/requests/requests.service.ts`
- `apps/api/src/reviews/prisma-reviews.repository.ts`
- `apps/api/src/reviews/reviews-rate.guard.ts`
- `apps/api/src/reviews/reviews.controller.ts`
- `apps/api/src/reviews/reviews.module.ts`
- `apps/api/src/reviews/reviews.repository.ts`
- `apps/api/src/reviews/reviews.service.ts`
- `apps/api/src/reviews/validation.ts`
- `apps/api/test/auth-sql.test.ts`
- `apps/api/test/auth.test.ts`
- `apps/api/test/contact-reviews-http.test.ts`
- `apps/api/test/contact-reviews-sql.test.ts`
- `apps/api/test/contact.test.ts`
- `apps/api/test/marketplace.test.ts`
- `apps/api/test/persistence.test.ts`
- `apps/api/test/requests.test.ts`
- `apps/api/test/support/memory-auth.repository.ts`
- `apps/api/test/support/memory-contact-reviews.repository.ts`
- `apps/api/test/support/memory-requests.repository.ts`
- `apps/api/test/support/phase25.fixture.ts`
- `apps/mobile/app/service-review/[id].tsx`
- `apps/mobile/src/auth/AuthForm.tsx`
- `apps/mobile/src/auth/api.ts`
- `apps/mobile/src/components/Profile.tsx`
- `apps/mobile/src/components/ReviewsSection.tsx`
- `apps/mobile/src/components/ui.tsx`
- `apps/mobile/src/contact/ContactForm.tsx`
- `apps/mobile/src/contact/RequestContactPanel.tsx`
- `apps/mobile/src/contact/api.ts`
- `apps/mobile/src/marketplace/CatalogScreens.tsx`
- `apps/mobile/src/marketplace/ProviderScreens.tsx`
- `apps/mobile/src/marketplace/api.ts`
- `apps/mobile/src/requests/NewRequest.tsx`
- `apps/mobile/src/requests/access.tsx`
- `apps/mobile/src/requests/api.ts`
- `apps/mobile/src/requests/notifications/monitor.ts`
- `apps/mobile/src/requests/notifications/provider.tsx`
- `apps/mobile/src/requests/notifications/storage.ts`
- `apps/mobile/src/requests/screens.tsx`
- `apps/mobile/src/requests/useMonitorRefresh.ts`
- `apps/mobile/src/reviews/ProviderReviews.tsx`
- `apps/mobile/src/reviews/RequestReviewPanel.tsx`
- `apps/mobile/src/reviews/ReviewScreen.tsx`
- `apps/mobile/src/reviews/api.ts`
- `apps/mobile/test/auth-navigation.test.tsx`
- `apps/mobile/test/contact-reviews-api.test.ts`
- `apps/mobile/test/contact-reviews-navigation.test.tsx`
- `apps/mobile/test/marketplace-navigation.test.tsx`
- `apps/mobile/test/request-monitor.test.ts`
- `apps/mobile/test/support/auth-fakes.ts`
- `apps/mobile/test/support/routes.ts`
- `docs/architecture.md`
- `docs/avaliacoes-bidirecionais.md`
- `docs/fase-2-5-contato-avaliacoes.md`
- `docs/fase-2-5-validacao.md`
- `docs/notificacoes-omini.md`
- `docs/sql/contact-runtime-permissions.sql`
- `docs/sql/reviews-runtime-permissions.sql`
- `packages/shared/src/contact.ts`
- `packages/shared/src/index.ts`
- `scripts/check-routes.mjs`
