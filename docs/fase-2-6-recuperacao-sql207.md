# Fase 2.6 — correção SQL 207 e recuperação proposta

## Escopo e diagnóstico

Branch: `feature/fase-2-6`. Somente a sexta migration, `20261123000000_unilateral_cancellation`, foi corrigida. As cinco anteriores permanecem intactas. Nenhuma conexão, consulta ou escrita SQL foi feita nesta correção; nenhum comando de deploy, resolve, reset ou db push foi executado. O procedimento abaixo **não está autorizado para execução agora** e exige revisão e autorização expressa antes de qualquer acesso ao banco ou alteração do histórico.

O responsável informou uma tentativa falha em `OMINI_TEST`, banco `OminiDB`, TCP `15433`, com erro 207 citando `reasonCode`, `applied_steps_count = 0`, ambas as colunas novas ausentes, constraint original ativa/confiável e preservação de 4 solicitações e 19 eventos. As cinco migrations anteriores estão aplicadas. Esses são relatos do ambiente Windows; não foram verificados pela nuvem.

A versão anterior adicionava `reasonCode` e `executionContext` e criava a constraint que os referencia no mesmo lote T-SQL. O SQL Server pode resolver os nomes das colunas dessa constraint durante a compilação do lote, antes de executar o `ALTER TABLE ADD`. Isso explica o erro 207 e é compatível com a ausência de alterações observada. Um erro de compilação no mesmo nível pode ocorrer antes da execução e não ser capturado pelo próprio TRY/CATCH. `applied_steps_count = 0`, isoladamente, não comprova rollback ou ausência de artefatos. A ausência de `executionContext` no trecho pesquisado do log não demonstra que sua referência estivesse válida: ela estava sujeita ao mesmo problema.

## Correção

O ADD permanece no lote externo. Apenas o DDL de `ServiceRequestEvent_cancellation_metadata_check` passa a ser uma constante Unicode executada por `EXEC sys.sp_executesql N'…'`, com aspas internas duplicadas. O lote interno é compilado quando a execução chega a ele, depois do ADD, na mesma sessão e transação.

São preservados XACT_ABORT, BEGIN/COMMIT TRANSACTION, TRY/CATCH, rollback condicional e THROW; as validações iniciais, nulabilidade/tipos, WITH CHECK e a ampliação da constraint de transições também são preservados. Não há GO, segunda conexão, interpolação de valores ou SQL fornecido pelo usuário. Erros do lote interno chegam ao CATCH externo e a falha desfaz a operação completa. Não há DML nem backfill.

O teste fixa o SHA-256 da expressão/DDL de metadados original com espaços normalizados (`ceff00d6a6d3a4c952cabfcfa51c87d9ad23de0414c0d8a0102dc56eb4ae0e3d`) e compara o conteúdo decodificado. Assim, a correção de compilação não altera a regra de cancelamento, motivos, contextos ou aceitação do histórico legado. O verificador estático inspeciona o SQL decodificado, exige o lote único e a ordem transacional e rejeita referências externas às colunas novas, GO, constraints não confiáveis e escrita escondida no literal.

## Recuperação futura — somente após autorização

### 1. Preparar e confirmar o destino

Depois da revisão, publicação e autorização específicas, atualizar o checkout Windows para a versão aprovada, sem sobrescrever arquivos `.env` locais. Trabalhar em `C:\projetos\omini\apps\api`. Pausar somente os escritores da instância de testes e obter backup/registro de auditoria de `OMINI_TEST` com o responsável autorizado. Não conceder privilégios administrativos ao migrator para fazer backup.

Usar exclusivamente TCP `127.0.0.1:15433`, banco `OminiDB`, login `omini_migrator`. No SSMS, a notação TCP equivalente é `tcp:127.0.0.1,15433`. Antes de autorizar a recuperação, confirmar que essa porta realmente corresponde à instância `OMINI_TEST`. O guard offline valida o endereço configurado, mas não identifica a instância por trás da porta.

O arquivo local ignorado `.env.migrations` deve conter a credencial separada em `MIGRATION_DATABASE_URL`; a proteção existente rejeita qualquer outro servidor/porta/banco/login e não faz fallback para `DATABASE_URL`. Não usar `localhost`, porta `1433`, instância principal, credencial runtime, URL na linha de comando ou conexão Prisma direta sem a proteção. Não desabilitar a proteção para resolver o incidente.

### 2. Inventário de leitura antes de escrever

Somente após autorização para acessar a instância de testes, conferir em sessão local controlada:

- Instância, porta TCP, banco e login efetivos.
- Histórico das cinco migrations anteriores com `finished_at` preenchido e sem alteração de seus checksums.
- A sexta tentativa com `finished_at` e `rolled_back_at` nulos, seu ID, timestamps, checksum e contagem de passos. Se houver várias tentativas, revisar cada uma antes de continuar.
- `reasonCode` e `executionContext` ausentes; constraint de metadados ausente; constraint original de transições com definição esperada, `is_disabled = 0` e `is_not_trusted = 0`.
- As 4 solicitações e 19 eventos, além da preservação do conteúdo e histórico; contagens sozinhas não provam integridade. Os escritores de teste devem permanecer pausados durante a comparação.

Guardar evidências privadamente, sem publicar logs brutos, conexões ou dados pessoais. Se qualquer artefato parcial, dado alterado, constraint diferente ou divergência de histórico for encontrado, parar: este roteiro não inclui limpeza, exclusão de colunas, reaplicação manual de SQL ou reparo de dados. Se a sexta migration já tiver sido concluída com sucesso em outro ambiente, parar também e revisar a estratégia de histórico antes de distribuir um arquivo diferente com o mesmo nome.

### 3. Checksums e marcação da tentativa como revertida

Arquivar a versão antiga do SQL e seu checksum antes da recuperação. A versão no commit `d7d3ce9` tem SHA-256 com LF `42ad98130c3ec307b22fef1e5256090de9b4046cd10b618b4e35d618cdf5c950`. Comparar com o arquivo realmente usado na tentativa e considerar diferenças CRLF/LF; não presumir que o checksum informado pelo banco será esse sem verificar o artefato local. Calcular também o checksum do arquivo corrigido e preservar ambos na auditoria.

O novo conteúdo terá checksum diferente, o que é esperado para uma migration que falhou e nunca foi concluída. **Não substituir o checksum antigo, apagar a tentativa ou fazer UPDATE/DELETE manual em `_prisma_migrations`.** O histórico da tentativa deve permanecer preservado.

Depois de comprovar a ausência de artefatos e receber autorização expressa para a escrita no histórico, a operação Prisma proposta é `migrate resolve --rolled-back 20261123000000_unilateral_cancellation`. Ela marca a tentativa como revertida; não desfaz DDL e não comprova rollback por si só. Não usar `--applied`, pois as colunas e a constraint nova ainda não existem.

O runner permanente continua aceitando somente status/deploy. Abaixo está um executor **documental**, para uma futura operação manual aprovada. Ele reutiliza o mesmo guard, captura a saída bruta e contém exatamente a operação de resolve proposta; não foi executado nesta entrega. Não executar `npx prisma migrate resolve` diretamente, pois isso pode carregar a credencial runtime e contornar a proteção do projeto.

```powershell
# SOMENTE APOS NOVA AUTORIZACAO, INVENTARIO E BACKUP DA INSTANCIA DE TESTES.
Set-Location C:\projetos\omini\apps\api

$ominiResolveFailedMigration = @'
try {
  require("dotenv").config({ path: ".env.migrations", quiet: true });
  const { migrationEnvironment } = require("./scripts/migration-env.ts");
  const env = migrationEnvironment(process.env);
  const result = require("node:child_process").spawnSync(
    process.execPath,
    [require.resolve("prisma/build/index.js"), "migrate", "resolve",
     "--rolled-back", "20261123000000_unilateral_cancellation",
     "--schema", "prisma/schema.prisma"],
    { env, encoding: "utf8" }
  );
  if (result.error || result.signal || result.status !== 0) {
    console.error("[recovery:failed] Resolve nao concluido. Pare; detalhes suprimidos.");
    process.exitCode = 1;
  } else {
    console.log("[recovery:resolved] Operacao concluida; confira o historico autorizado antes do deploy.");
  }
} catch {
  console.error("[recovery:blocked] Configuracao ou inicializacao rejeitada; detalhes suprimidos.");
  process.exitCode = 1;
}
'@
node --import tsx -e $ominiResolveFailedMigration
if ($LASTEXITCODE -ne 0) { throw "Pare; nao prossiga ao deploy." }
```

Essa operação implica uma escrita no histórico feita pelo próprio Prisma, por isso depende de nova autorização. Depois dela, verificar localmente que a tentativa antiga recebeu `rolled_back_at`, conservando seu checksum e registro de falha. Se o resolve falhar ou o inventário não corresponder, parar; não repetir cegamente nem editar o histórico manualmente.

### 4. Reaplicar o arquivo corrigido, somente em testes

Ainda sob autorização explícita e com as evidências revisadas, executar status pelo runner protegido. A sexta migration deve estar pendente. Exit code 1 sozinho não comprova essa condição: exigir o diagnóstico `pending`; erros de histórico, conexão, credenciais, permissões ou engine devem interromper o roteiro.

Só então aplicar pelo runner protegido, se a autorização também cobrir o deploy, e conferir o status final:

```powershell
# PROPOSTA FUTURA; nao executada nesta correcao.
# CWD: C:\projetos\omini\apps\api
npm.cmd run db:migrate:status
```

Parar para revisar esse resultado. O bloco seguinte é uma etapa separada: não colar junto com o status, nem prosseguir com erro desconhecido. Exigir diagnóstico `pending`, inventário preservado e autorização de deploy antes de executá-lo:

```powershell
# SOMENTE APOS A REVISAO MANUAL DO STATUS E AUTORIZACAO DO DEPLOY EM TESTES.
npm.cmd run db:migrate:deploy
if ($LASTEXITCODE -ne 0) { throw "Deploy falhou; pare e preserve evidencias." }
npm.cmd run db:migrate:status
if ($LASTEXITCODE -ne 0) { throw "Status final nao aprovado; pare." }
```

O Prisma deve criar uma nova tentativa com o checksum do arquivo corrigido e `finished_at` preenchido; a tentativa revertida continua no histórico com seu checksum antigo. Conferir que as cinco anteriores não mudaram e que não há tentativa incompleta ativa. Se houver divergência, parar em vez de alterar checksums ou executar reset/db push.

### 5. Aceitação real posterior

Conferir as duas colunas nullable, ambas as constraints ativas e confiáveis, preservação das datas e do conteúdo anterior, metadados antigos nulos, 4 solicitações e 19 eventos antes de novos testes funcionais. Só depois habilitar escritores de teste e validar cancelamentos, concorrência/rollback, bloqueio de contato e avaliações; a contagem naturalmente poderá mudar ao criar novos dados de teste. Nunca aproveitar esta recuperação para migrar a instância principal.

## Validação desta correção sem conexão

Foram preparados testes de regressão para a fronteira de compilação, invariância da expressão de metadados, preservação das cinco migrations anteriores e rejeição de alterações inseguras. `check:migrations` usa somente leitura de arquivos/DMMF, sem executar T-SQL. Testes estáticos e mocks não comprovam compilação/execução real no SQL Server; essa validação permanece pendente no ambiente de testes, após autorização. Não houve commit ou push nesta tarefa.

Resultados executados nesta correção:

| Verificação                                                                | Resultado                                                      |
| -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| API, `npm run test -w @omini/api`                                          | 204 aprovados, zero falhas                                     |
| Mobile, executado por `npm test`                                           | 142 aprovados, 18 suítes                                       |
| Arquivo de testes estáticos de cancelamento                                | 6 aprovados; inclui hashes das cinco migrations anteriores     |
| `npm run typecheck`                                                        | Aprovado em todos os workspaces                                |
| `npm run lint`                                                             | Aprovado                                                       |
| `npm run check:migrations -w @omini/api`                                   | Aprovado, sem execução de SQL                                  |
| Comparação offline do SQL lógico completo, após decodificar o lote interno | Igual à versão anterior, desconsiderando comentários e espaços |
| `git diff --check`                                                         | Aprovado                                                       |

A primeira execução detectou que o novo verificador confundia a palavra “execute” de um comentário com uma instrução EXEC. A inspeção foi corrigida para ignorar comentários de linha e mensagens entre aspas nessa checagem. Os seis testes estáticos, o verificador de migrations e a suíte API completa foram repetidos com sucesso; os testes mobile já haviam passado e não houve alteração mobile. A suíte utiliza mocks/memória e seus testes HTTP/IPC locais foram executados com permissão do sandbox, sem credenciais de banco.
