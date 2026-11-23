# Fase 2.6 — proteção e diagnóstico do migration runner

Os comandos npm existentes `db:migrate:status` e `db:migrate:deploy` continuam usando `apps/api/scripts/migrate.ts`. **Ambos são comandos de conexão real**; não foram executados nesta correção. Deploy continua dependendo de autorização para aplicar SQL na instância de testes. Nenhuma migration, schema, permissão ou registro foi alterado.

## Destino exclusivo desta fase

O runner aceita apenas esta combinação completa:

| Campo        | Valor obrigatório |
| ------------ | ----------------- |
| Servidor TCP | `127.0.0.1`       |
| Porta        | `15433`           |
| Banco        | `OminiDB`         |
| Login        | `omini_migrator`  |

A comparação de servidor, banco e login é exata. `localhost`, instâncias nomeadas, outros IPs, outros bancos, outros usuários e a porta `1433` são rejeitados antes de carregar a CLI Prisma. A identidade runtime `omini_app` nunca serve como fallback. Não há flag para desabilitar a proteção, nem exceção para `status` ou para produção. Uma implantação futura em produção exigirá nova autorização e configuração explicitamente revisada.

O arquivo local ignorado `apps/api/.env.migrations` continua sendo a fonte separada de configuração, por meio de `MIGRATION_DATABASE_URL`. O template versionado foi corrigido para a porta `15433`; arquivos locais existentes **não são sobrescritos**. Uma variável já definida no processo tem precedência sobre o arquivo e também passa pela mesma proteção. Ausência, URL inválida, parâmetros duplicados/desconhecidos, senha ausente, criptografia desabilitada ou conexão idêntica a `DATABASE_URL` interrompem a execução.

O filho recebe `DATABASE_URL` exclusivamente da URL de migrations já validada; `MIGRATION_DATABASE_URL` é removida do ambiente do filho. Não se tenta outra conexão se houver erro. A verificação limita o endereço configurado, mas não pode comprovar offline qual instância foi associada à porta no Windows. Antes de qualquer futura conexão autorizada, o responsável deve conferir que `15433` pertence à instância isolada `OMINI_TEST`.

## Mensagens seguras

Toda saída do Prisma é capturada, inclusive em caso de sucesso. O console recebe somente mensagens predefinidas; nunca recebe stdout/stderr, exceções, stack traces, SQL, nomes de migrations, URLs, senhas, tokens ou valores de variáveis de ambiente. Não há arquivo de log bruto, modo verbose ou retry automático.

| Prefixo           | Interpretação                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `configuration:*` | Configuração ausente, inválida ou destino/identidade bloqueado; Prisma não foi iniciado                                      |
| `action`          | Ação diferente de `status`/`deploy` recusada                                                                                 |
| `pending`         | Saída reconhecida de migrations pendentes no `status`, com exit code 1 e sem outro erro identificado                         |
| `connection`      | Indícios de falha de rede, timeout ou conexão encerrada; por exemplo P1001/P1002                                             |
| `credentials`     | Autenticação recusada; por exemplo P1000 ou erro SQL 18456                                                                   |
| `permissions`     | Acesso negado; por exemplo P1010 ou erro SQL 229 dentro de P3018                                                             |
| `tls`             | Falha de certificado ou negociação criptografada                                                                             |
| `database`        | Banco indisponível/inexistente ou falha de criação reportada pelo Prisma; não há fallback nem reparo automático após a falha |
| `history`         | Migration falhou ou histórico inconsistente; não há reset/resolve/reparo automático                                          |
| `schema`          | Prisma rejeitou schema/configuração                                                                                          |
| `engine`          | CLI/engine ausente, bloqueada ou sem download disponível                                                                     |
| `process`         | Processo não iniciou, foi interrompido ou falhou sem detalhe seguro                                                          |
| `unknown`         | Falha sem classificação confiável; não presumir migrations pendentes                                                         |

Os prefixos são emitidos como `[migration:connection]`, por exemplo. Erros de credenciais, permissões, conexão ou histórico têm precedência sobre a lista de migrations pendentes. P3018 pode conter uma causa SQL mais específica; sem ela, é tratado como falha de migration. Um deploy malsucedido nunca é classificado apenas como pendência.

A classificação é heurística, baseada em códigos e mensagens conhecidos; não comprova a causa de um problema real sem validação local autorizada. Exit codes não zero de 1 a 255 são preservados. Falhas de inicialização, sinais e status inválido/nulo retornam 1, inclusive quando um mock/processo relata status zero junto com erro. Nenhuma saída de diagnóstico inclui os detalhes de conexão.

## Validação sem SQL Server

Na raiz do projeto, os comandos de validação desta correção são:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
```

`apps/api/test/migration-runner.test.ts` injeta doubles para resolução e execução da CLI: testa destino permitido, bloqueios para as duas ações, ausência de fallback, isolamento do ambiente, códigos de saída, diagnósticos e sigilo. Importar o entrypoint não carrega dotenv nem inicia Prisma. Os testes existentes usam repositórios em memória/doubles, sem SQL Server. A execução real de `status`, deploy e a conexão com `OMINI_TEST` permanecem pendentes de revisão/autorização; esta correção não solicita nem executa essas operações.

Resultados nesta correção:

| Verificação                                 | Resultado                                          |
| ------------------------------------------- | -------------------------------------------------- |
| API, mocks/memória e verificações estáticas | 201 aprovados, incluindo 85 novos testes do runner |
| Mobile, mocks/contratos                     | 142 aprovados, 18 suítes                           |
| Typecheck de todos os workspaces            | Aprovado                                           |
| Lint                                        | Aprovado                                           |

A primeira execução de `npm test` não conseguiu iniciar a suíte API porque o sandbox bloqueou o IPC local do `tsx`; os testes mobile passaram nessa execução. A repetição de `npm run test -w @omini/api`, com permissão para IPC/HTTP local dos testes e o mesmo isolamento de credenciais, aprovou os 201 testes. Nenhum comando Prisma de status/deploy, conexão SQL Server ou teste de banco real foi executado. Não houve commit nem push nesta correção.
