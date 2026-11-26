# Fase 2.6 — correções após auditoria e resultados para revisão

Branch: `feature/fase-2-6`. Base da revisão: `6e7c043`. Publicação do código autorizada exclusivamente em `feature/fase-2-6`, sem merge; o hash e o resultado efetivo do push devem ser conferidos na entrega. Não foi acessado SQL Server; nenhuma migration, GRANT ou operação de dados foi executada. Nenhum `.env` foi alterado.

## Causa e correção das pendências

| Pendência               | Causa                                                                                                                                       | Correção real                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inferência por retirada | HAVING considerava somente os autores ainda elegíveis e podia devolver remanescentes de uma coorte publicada.                               | SQL compara todas as linhas atribuídas e todas as elegíveis aos contadores imutáveis entryCount/distinctAuthorCount. Qualquer perda oculta o grupo inteiro; nunca recicla sobreviventes. Atribuição parcial causa falha da transação.                   |
| Prazo no mobile         | REVIEW_WINDOW_CLOSED não existia no mapa de erros; caía no fallback do catálogo. O formulário tratava toda rejeição como resultado incerto. | Mensagem exata solicitada; rejeições definitivas 409/426 bloqueiam envio e retry, inclusive com refresh de elegibilidade desatualizado. Erros de rede continuam permitindo repetir o mesmo conteúdo.                                                    |
| Swagger                 | Anotações antigas descreviam somente cliente e comentários públicos.                                                                        | OpenAPI gerado documenta duas direções, completedAt/14 dias, proteção, recibo próprio, coortes, autorização do cliente, 409 e 426. Versão da descrição: 0.2.6.                                                                                          |
| CI                      | A branch não constava de push.branches.                                                                                                     | feature/fase-2-6 incluída, preservando pull_request, verificações e contents: read. O resultado remoto deve ser conferido no GitHub Actions após o push; estes resultados locais não certificam a execução remota.                                      |
| Corte/rollback          | O trigger bloqueia o writer antigo; flag false não devolve a capacidade antiga de gravação e pode reexpor projeções legadas de leitura.     | Plano de manutenção sem leitores/escritores antigos, checks read-only, preservação de dados e recuperação para frente. Guard de capability recusa escritores mobile antigos antes do repositório com flag ativa. Não há rollback funcional certificado. |

O cabeçalho `X-Omini-Review-Policy: protected-14d-v1` é novo no envio protegido e automático no mobile atualizado. É uma declaração pública de compatibilidade, não autenticação/attestation. Antes da migration e com flag false, contratos legados continuam funcionando. A declaração não permite ativar a política no banco principal.

## Resultados executados

| Verificação                      | Resultado                                                                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` — API                 | **275 testes aprovados, zero falhas.** HTTP local com repositórios em memória; runner remove credenciais e desabilita persistência.                |
| `npm test` — mobile              | **212 testes aprovados, 20 suítes, zero falhas.** React Native/Expo e fetch simulados.                                                             |
| Identificação r4                 | Após alterar apenas a identificação, 12 testes de mobile-runtime reexecutados e aprovados.                                                         |
| Typecheck de todos os workspaces | Aprovado.                                                                                                                                          |
| ESLint                           | Aprovado.                                                                                                                                          |
| Build NestJS                     | Aprovado, sem iniciar a API.                                                                                                                       |
| Prisma validate JS/WASM          | Aprovado, 15 modelos; sem SQL.                                                                                                                     |
| Migrations estáticas             | Aprovadas. Seis históricas idênticas ao HEAD; providers sqlserver/mssql preservados. Sétima migration preparada e scripts de permissões incluídos. |
| Rotas                            | 39 arquivos verificados; Stacks profissionais preservadas.                                                                                         |
| Revisão mobile                   | **2.6-mobile-r4**, diagnóstico apenas em rota interna de desenvolvimento.                                                                          |
| Bundles Hermes iOS/Android       | Exportados localmente, offline, URL fictícia e `.env` desabilitado. Não equivalem a teste físico.                                                  |
| Segredos / diff                  | `check:secrets` e `git diff --check` aprovados; nenhuma credencial identificada na revisão das alterações.                                         |

Nenhuma dependência ou lockfile foi alterado pelas correções. Expo SDK 58 e Prisma 6.19.3 foram preservados.

## Cobertura adicional

- Coortes de 5, 6 e 9 autores em ambas as direções: retirada de linha em memória, mudança para CANCELLED, ausência de completedAt, evidência ausente, versão de conclusão divergente, participante canônico alterado e publicação removida.
- Ocultação integral mesmo quando restariam cinco ou mais autores; caso de autor repetido em que a contagem distinta nem muda, mas falta uma entrada; coortes saudáveis permanecem consistentes; nenhuma nota isolada entra sozinha.
- Restauração dos mesmos registros/elegibilidade mostra o mesmo grupo original, sem novos IDs de grupo/reagrupamento; contadores inconsistentes falham fechados. Histórico não é apagado.
- SQL real do repositório inspecionado com parâmetros vinculados e testes estáticos dos joins/contadores. Teste de atribuição incompleta impede aceitar quantidade diferente da registrada. Esses testes não executam SQL Server.
- Adaptador HTTP real com fetch mockado mapeia o código 409 para a mensagem exata. Interface cliente/prestador bloqueia POST após 409/426, não apresenta retry e mantém o bloqueio após refresh desatualizado; erro de rede continua idempotente e repetível.
- Gate habilitado/desabilitado, cabeçalho ausente/incorreto/duplicado, rejeição HTTP 426 antes de escrita, autenticação anterior ao gate e OpenAPI gerado com as regras novas.
- SQL de preflight/consistência/permissões verificado estaticamente como read-only, protegido por banco/porta. Nenhum desses scripts foi executado.

A suíte existente de cancelamentos permanece aprovada: motivos, contexto, confirmação, autonomia unilateral, concorrência, idempotência, histórico, contato e proibição de avaliações em estados finais. Sem novas regras de cancelamento, pagamentos, push ou moderação.

## Limites e pendências antes da homologação

O bloqueio de coortes incompletas corrige a inferência por retirada pontual; não promete anonimato matemático contra conluio/conhecimento externo, grupos unânimes, predominância de um autor, acesso privilegiado à base ou dados já publicados no legado. Notas/autoria/membros publicados são imutáveis no fluxo de aplicação; não há endpoint de edição/remoção. Ver a [política completa](avaliacoes-bidirecionais.md).

Ainda é obrigatório, sob autorização separada: ensaiar a migration/GRANTs em OMINI_TEST:15433; verificar T-SQL real, integridade/checksums, permissões e locks/rollback; atualizar o bundle e testar os fluxos no iPhone físico. API em 3001 e runtime omini_app, com flag ativa apenas após o corte aprovado. Não executar contra 1433.

**Desligar a flag não é rollback funcional.** Não deixar backend antigo confirmar conclusões durante o corte: faltariam janelas e a política proíbe criá-las retroativamente. Falha depois de novas notas exige parar leitores/escritores, preservar dados e correção para frente, não reset/restauração sobre dados ativos.

Roteiro completo, matriz flag/schema, comandos PowerShell e checklist real: [ativação segura](fase-2-6-ativacao-segura.md).

## Todos os arquivos da entrega

Total: **69 arquivos** (conjunto revisado de implementação, testes e documentação da Fase 2.6).

- `.github/workflows/quality.yml`
- `README.md`
- `apps/api/prisma/history/phase26-cancellation.prisma.snapshot`
- `apps/api/prisma/history/phase26-migration-hashes.json`
- `apps/api/prisma/migrations/20261124000000_bidirectional_reviews/migration.sql`
- `apps/api/prisma/schema.prisma`
- `apps/api/scripts/check-migrations.ts`
- `apps/api/scripts/protected-reviews-migration-validation.ts`
- `apps/api/scripts/test.ts`
- `apps/api/src/config.ts`
- `apps/api/src/configure-app.ts`
- `apps/api/src/requests/prisma-requests.repository.ts`
- `apps/api/src/requests/requests.repository.ts`
- `apps/api/src/requests/requests.service.ts`
- `apps/api/src/reviews/client-reputation.controller.ts`
- `apps/api/src/reviews/participant-review.ts`
- `apps/api/src/reviews/prisma-protected-reviews.repository.ts`
- `apps/api/src/reviews/prisma-reviews.repository.ts`
- `apps/api/src/reviews/protected-reviews.repository.ts`
- `apps/api/src/reviews/protected-reviews.service.ts`
- `apps/api/src/reviews/review-policy.guard.ts`
- `apps/api/src/reviews/review-publisher.ts`
- `apps/api/src/reviews/reviews.controller.ts`
- `apps/api/src/reviews/reviews.module.ts`
- `apps/api/src/reviews/reviews.openapi.ts`
- `apps/api/src/reviews/reviews.service.ts`
- `apps/api/test/cancellation-sql.test.ts`
- `apps/api/test/contact-reviews-sql.test.ts`
- `apps/api/test/participant-review.test.ts`
- `apps/api/test/persistence.test.ts`
- `apps/api/test/protected-reviews-http.test.ts`
- `apps/api/test/protected-reviews-sql.test.ts`
- `apps/api/test/quality-workflow.test.ts`
- `apps/api/test/reputation-cohorts.test.ts`
- `apps/api/test/reviews-openapi-cutover.test.ts`
- `apps/api/test/support/memory-contact-reviews.repository.ts`
- `apps/api/test/support/memory-protected-reviews.repository.ts`
- `apps/api/test/support/phase25.fixture.ts`
- `apps/mobile/app/internal/diagnostics.tsx`
- `apps/mobile/src/components/Profile.tsx`
- `apps/mobile/src/components/ReputationSummary.tsx`
- `apps/mobile/src/components/ReviewsSection.tsx`
- `apps/mobile/src/dev/DiagnosticsScreen.tsx`
- `apps/mobile/src/dev/runtime.ts`
- `apps/mobile/src/marketplace/api.ts`
- `apps/mobile/src/requests/screens.tsx`
- `apps/mobile/src/reviews/ClientReputation.tsx`
- `apps/mobile/src/reviews/ProviderReviews.tsx`
- `apps/mobile/src/reviews/RequestReviewPanel.tsx`
- `apps/mobile/src/reviews/ReviewScreen.tsx`
- `apps/mobile/src/reviews/api.ts`
- `apps/mobile/test/contact-reviews-api.test.ts`
- `apps/mobile/test/contact-reviews-navigation.test.tsx`
- `apps/mobile/test/marketplace-api.test.ts`
- `apps/mobile/test/mobile-runtime.test.tsx`
- `apps/mobile/test/reviews-section.test.tsx`
- `apps/mobile/test/support/routes.ts`
- `docs/avaliacoes-bidirecionais.md`
- `docs/fase-2-6-ativacao-segura.md`
- `docs/fase-2-6-avaliacoes-protegidas.md`
- `docs/fase-2-6-validacao.md`
- `docs/sql/protected-reviews-consistency.sql`
- `docs/sql/protected-reviews-preflight.sql`
- `docs/sql/protected-reviews-runtime-check.sql`
- `docs/sql/protected-reviews-runtime-permissions.sql`
- `packages/shared/src/index.ts`
- `packages/shared/src/reputation.ts`
- `scripts/check-mobile-runtime.mjs`
- `scripts/check-routes.mjs`
