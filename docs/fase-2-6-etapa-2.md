# Fase 2.6 — Etapa 2: backend do cancelamento unilateral

Branch de trabalho: `feature/fase-2-6`, base `eec683c`. Alterações locais para revisão, sem commit/push. Nenhuma migration, consulta SQL, escrita ou conexão foi executada em banco principal ou de testes. A API e o Expo de desenvolvimento não foram iniciados; apenas aplicações HTTP temporárias dos testes com mocks.

## Operação e autorização

Mantido `POST /api/requests/:id/cancel`, prefixo `/api`, guard de sessão e rate limiting. A tabela compartilhada agora representa `cancel` com dois participantes; a elegibilidade distingue REQUESTED dos demais estados:

| Estado                         | Cliente original                            | Prestador original                             |
| ------------------------------ | ------------------------------------------- | ---------------------------------------------- |
| REQUESTED                      | Cancela, com compatibilidade do body antigo | Não cancela; pode recusar pelo fluxo existente |
| ACCEPTED                       | Cancela unilateralmente                     | Cancela unilateralmente                        |
| IN_PROGRESS                    | Cancela unilateralmente                     | Cancela unilateralmente                        |
| AWAITING_CONFIRMATION          | Cancela unilateralmente                     | Cancela unilateralmente                        |
| COMPLETED, CANCELLED, REJECTED | Não admite nova transição                   | Não admite nova transição                      |

Ator, participação, perfil ativo, estado e início registrado vêm do servidor e do registro persistido. Escolher outro modo no app ou possuir dois perfis não concede acesso à solicitação de outra conta. Não há confirmação bilateral nem exigência de ausência de execução.

Cancelamentos estruturados exigem `reasonCode` único e `confirmed: true` do próprio usuário. O primeiro motivo continua “Não chegamos a um acordo sobre o valor”; os motivos específicos são validados pelo participante original. `OTHER` exige `reason` de 10 a 500 caracteres, após trim/NFC e validação de dados privados óbvios, HTML e controles. Motivo predefinido não aceita texto livre adicional: o servidor gera seu rótulo.

Com início registrado (`startedAt`), ou nos estados IN_PROGRESS/AWAITING_CONFIRMATION, `executionContext` é obrigatório: NONE, PARTIAL, FULL_CLAIMED ou DISPUTED. Todos permitem cancelar. Trata-se de **declaração do participante**, sem comprovar execução ou conclusão. Ausência do contexto nos pedidos não iniciados permanece não informada; não é preenchida como NONE.

Exemplo de novo body, sem dados reais:

```json
{
  "version": 4,
  "idempotencyKey": "10000000-0000-4000-8000-000000000001",
  "reasonCode": "PRICE_DISAGREEMENT",
  "confirmed": true,
  "executionContext": "PARTIAL"
}
```

As outras ações continuam aceitando o schema anterior, sem os campos de cancelamento. Campos extras de ator, estado, datas, conta ou suposta aprovação da outra parte são recusados. Swagger documenta o body, as restrições condicionais e os campos opcionais do histórico.

## Transação, histórico e idempotência

Mantidas transações Serializable, compare-and-set por ID/estado/versão, timeout/maxWait e até duas repetições para conflitos Prisma de serialização/unicidade. Atualização do pedido e evento permanecem atômicos; uma falha na inserção do evento desfaz estado, versão e datas.

Ao cancelar, são alterados somente status=CANCELLED, cancelledAt, updatedAt e versão. O instante vem de SYSUTCDATETIME. acceptedAt, startedAt e completionProposedAt são preservados, inclusive a alegação anterior de conclusão em AWAITING_CONFIRMATION. Não se apagam eventos e completedAt não é preenchido. Pedidos concluídos não podem ser cancelados retroativamente, preservando suas avaliações.

O evento guarda ator real, origem/destino, motivo legível, reasonCode, executionContext, instante UTC e recibo idempotente. O repositório Prisma existente encaminha os novos campos por seu create de evento na mesma transação; isso foi testado com driver mockado, sem SQL. O histórico público aos participantes continua omitindo IDs de conta, hash e chave idempotente. Metadados nulos de eventos antigos não são inventados nem expostos como classificações novas.

O hash antigo permanece exatamente `{id, action, version, reason}` para ações existentes e corpos legados. Para o cancelamento estruturado, são acrescentados reasonCode, executionContext normalizado (null quando ausente) e confirmed. A descrição OTHER é normalizada antes do hash; o rótulo gerado do motivo predefinido não é usado como parte variável do recibo.

Recibos existentes são verificados **antes** de exigir novos campos ou aplicar elegibilidade atual. Assim, um cancelamento antigo confirmado pode ser recuperado sem novo motivo, mesmo que hoje esteja CANCELLED. A sessão/conta ainda precisa ser válida e a identidade ainda precisa ser participante. Reutilizar a chave com conteúdo ou operação diferentes retorna 409.

## Compatibilidade e impacto antes de produção

- Novo cancelamento com body legado em REQUESTED continua funcionando. Não precisa de classificação retroativa.
- Novo cancelamento após aceite sem os campos estruturados retorna 400 `CANCELLATION_DETAILS_REQUIRED`, sem escrita. Apenas informar um motivo textual antigo não contorna a regra.
- Aplicativos da Fase 2.5 continuam lendo estados e ações conhecidos, mas não têm o formulário novo. Podem receber a ação `cancel` no payload e não conseguir executá-la com seu body antigo. O cliente também utiliza uma lista de mensagens seguras, podendo mostrar erro genérico até a futura integração mobile.
- **Não implantar este backend na instalação existente antes de validar/aplicar a migration autorizada e coordenar a atualização mobile.** O Prisma novo espera as colunas novas também nas leituras dos eventos.
- Nenhuma tela mobile foi implementada nesta etapa. Foram ajustados apenas testes para refletir a autorização real e o tipo de ator ampliado.
- A identificação de informações pessoais no texto continua heurística, não uma garantia de detectar toda ofuscação ou dado pessoal. Não registrar body, motivo livre, telefone, JWT ou refresh token em logs/analytics.

Ao atingir CANCELLED, os endpoints de contato existentes deixam de autorizar novas consultas. A abertura de WhatsApp/telefone no app já reconsulta a autorização; dados obtidos fora do Omini anteriormente não podem ser apagados retroativamente. Avaliações continuam exigindo COMPLETED e evento legítimo de confirmação. FULL_CLAIMED no cancelamento não dá direito a avaliar nem muda médias de serviços anteriores.

## Migration preparada — NÃO EXECUTADA

Arquivo: `apps/api/prisma/migrations/20261123000000_unilateral_cancellation/migration.sql`.

1. Confere banco OminiDB, existência da tabela/constraint e ausência das novas colunas, recusando estados parciais inesperados.
2. Adiciona somente `ServiceRequestEvent.reasonCode NVARCHAR(40) NULL` e `executionContext NVARCHAR(32) NULL`, sem default/backfill.
3. Substitui pontualmente `ServiceRequestEvent_transition_check`, dentro de uma transação com XACT_ABORT e TRY/CATCH/ROLLBACK. Conserva todas as regras antigas e amplia somente a origem da ação cancel para IN_PROGRESS e AWAITING_CONFIRMATION.
4. Usa `WITH CHECK ADD` para validar os registros existentes e manter a constraint confiável. O DROP/ADD está protegido pela mesma transação e pelos locks de esquema; falha reverte a operação completa. O tempo de bloqueio precisa ser medido em testes.
5. Adiciona CHECK dos metadados: combinações válidas de código, descrição e contexto, com contexto obrigatório nos novos cancelamentos de estados iniciados. Nulos continuam válidos para históricos anteriores, sem abrir essa exceção às duas transições recém-admitidas.

A evolução preserva dados, mas inclui a substituição controlada de uma constraint, expressamente solicitada nesta etapa. Não é apenas ADD COLUMN. Nenhuma migration histórica foi editada. Os testes fixam os hashes das cinco migrations anteriores. `schema.prisma` permanece provider `sqlserver`; migration_lock permanece `mssql`. Não há nova tabela, estado, índice, avaliação ou dependência.

Foi criado `prisma/history/phase25.prisma.snapshot` para verificar a migration histórica de solicitações contra seu contrato original. O checker novo compara schema anterior/atual e a expansão exata da constraint. Esses testes são **estáticos**, não executam T-SQL e não comprovam funcionamento do DDL no SQL Server.

### Privilégios

Não é necessário GRANT adicional para o runtime na configuração versionada: `requests-runtime-permissions.sql` já concede SELECT/INSERT no objeto ServiceRequestEvent, abrangendo as colunas novas, e UPDATE somente de status, versão e datas do pedido. Nenhuma permissão de UPDATE/DELETE em eventos, db_owner, db_datawriter, DDL ou administração foi adicionada. A alteração de schema continua sendo responsabilidade da identidade de migration, separada de `omini_app`. Permissões efetivas locais ainda precisarão ser conferidas na instância de testes autorizada.

## Validação e limites

As suítes usam repositórios em memória, JWT/guards reais nos testes HTTP e doubles do cliente Prisma, com PERSISTENCE_ENABLED=false e conexões removidas do ambiente do runner. Não foi feita conexão a localhost:1433 ou localhost:15433.

Os testes novos cobrem: atores e estados, quatro contextos, ausência/invalidade de motivos, limites de descrição, invasão de conta/estado pelo body, sessão inválida, normalização/idempotência, recibos antigos, versões, cancelamentos simultâneos, corridas com início/conclusão, rollback, histórico paginado, contato, avaliações e Swagger. Fixtures da matriz são separadas para respeitar as janelas dos limitadores sem enfraquecer a segurança de produção.

Além da regressão, foram executados typecheck, lint, build da API, Prisma generate/validate locais, verificação estática de migrations, secrets e diff. Não houve testes físicos, implantação SQL ou inicialização de API/Expo de desenvolvimento. Resultados desta etapa:

| Verificação                       | Resultado                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------- |
| API (mocks/memória)               | 116 testes aprovados                                                            |
| Mobile / contratos compartilhados | 142 testes aprovados, 18 suítes                                                 |
| Total                             | 258 aprovados: 241 da Etapa 1 preservados e 17 novos; inclui os 219 da Fase 2.5 |
| Typecheck / lint / build da API   | Aprovados                                                                       |
| Prisma generate / validate        | Aprovados localmente, 12 modelos, sem conectar                                  |
| Migrations estáticas              | Aprovadas, inclusive expansão da constraint e hashes históricos                 |
| Rotas                             | 38 arquivos/Stacks verificados                                                  |
| Secrets / git diff --check        | Aprovados                                                                       |
| SQL Server / dispositivos físicos | Não executados nesta etapa                                                      |

## Próximo passo — somente após nova autorização

1. Revisar código, compatibilidade do app e o SQL preparado.
2. Preparar configuração exclusiva de testes, sem fallback para DATABASE_URL/arquivo de migrations principal. A [correção do migration runner](fase-2-6-migration-runner.md) restringe status e deploy exclusivamente a `127.0.0.1:15433`, banco `OminiDB`, login `omini_migrator`, antes de iniciar Prisma.
3. Após autorização, confirmar explicitamente que o destino TCP `127.0.0.1:15433` corresponde à instância `OMINI_TEST`, banco OminiDB, antes de qualquer migration. Nunca usar `localhost\\OMINI:1433` nesta validação. Não alterar credenciais locais existentes.
4. Na instância de testes, comparar contagens e histórico, aplicar a migration com identidade separada, verificar constraints confiáveis, metadados antigos nulos, transições novas, rollback e privilégios mínimos. Usar somente dados de teste, inclusive cenários de trabalho parcial e conclusão alegada.
5. Somente depois da validação SQL e aprovação seguinte, implementar as telas de cancelamento e testar no iPhone/Android. Não ativar produção automaticamente.

Continuam pendentes no escopo total da Fase 2.6: reputação visual, avaliações bidirecionais (janela de publicação depende de aprovação), push com builds/APNs/FCM apropriados, ocultação do diagnóstico público e homologação/revisão controlada das dependências Expo. Nada disso foi antecipado.

## Arquivos da entrega para revisão

Inclui arquivos da Etapa 1 que ainda estavam não rastreados e foram reaproveitados/atualizados:

- `packages/shared/src/index.ts`
- `packages/shared/src/request-cancellation.ts`
- `apps/api/src/requests/cancellation.validation.ts`
- `apps/api/src/requests/requests.controller.ts`
- `apps/api/src/requests/requests.service.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/history/phase25.prisma.snapshot`
- `apps/api/prisma/migrations/20261123000000_unilateral_cancellation/migration.sql`
- `apps/api/scripts/check-migrations.ts`
- `apps/api/scripts/cancellation-migration-validation.ts`
- `apps/api/test/cancellation.validation.test.ts`
- `apps/api/test/cancellation-http.test.ts`
- `apps/api/test/cancellation-sql.test.ts`
- `apps/api/test/requests.test.ts`
- `apps/api/test/requests-prisma.test.ts`
- `apps/api/test/requests-sql.test.ts`
- `apps/api/test/contact-reviews-http.test.ts`
- `apps/mobile/test/cancellation-policy.test.ts`
- `apps/mobile/test/requests-navigation.test.tsx`
- `docs/fase-2-6-etapa-2.md`
