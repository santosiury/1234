# Fase 2.6 — nome TLS local na fábrica Prisma

Branch: `feature/fase-2-6`. Base: `d21649696c16d0609cbede3cf7d7febfe6e0c990`.
Estado: ajuste de configuração implementado; conexão real Prisma no Windows **pendente de homologação**. Nenhum SQL Server foi acessado, nenhuma migration ou seed foi executada. A publicação do código não substitui a homologação real nem autoriza operações no banco.

## Diagnóstico e alcance

O responsável reproduziu no Windows, com Node `26.13.0`, Prisma/adapter `6.19.3`, mssql `11.0.2` e tedious `18.6.2`, um `ESOCKET` cujo erro interno era `ERR_INVALID_ARG_VALUE`: um endereço IP era usado como nome TLS. A conexão direta mssql passou ao receber `options.serverName = "localhost"`, retornando oito categorias. Esse resultado foi informado pelo responsável e **não comprova ainda a conexão pela fábrica Prisma modificada**.

`createDatabaseClient` agora entrega ao `PrismaMssql` uma configuração derivada do mesmo parser estrito, acrescentando `options.serverName` somente quando o destino TCP configurado é exatamente `127.0.0.1:15433`.

| Propriedade                      | Comportamento                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server` / `port`                | Permanecem `127.0.0.1` / `15433`; sem resolução DNS de localhost para escolher o destino TCP.                                                                 |
| `options.serverName`             | `localhost` apenas nesse destino isolado; não é aplicado a outros hosts ou portas.                                                                            |
| `options.encrypt`                | Continua `true`; o parser continua rejeitando `encrypt=false`.                                                                                                |
| `options.trustServerCertificate` | Valor configurado preservado; padrão `false`, sem afrouxamento automático. Com `false`, o certificado também precisa ser confiável e válido para `localhost`. |
| Credenciais, banco e timeouts    | Preservados pelo parser, inclusive senhas delimitadas por chaves.                                                                                             |
| Logs                             | `log: []` preservado; nenhuma URL, senha ou configuração é impressa pela fábrica.                                                                             |

`serverName` identifica o servidor na negociação/verificação TLS; não substitui `server`, `port`, banco ou usuário. Falhas não geram nova tentativa para outro destino. Não foi acrescentado parâmetro de URL para escolher arbitrariamente um nome TLS.

## Isolamento e segurança da homologação

A validação existente em `validateEnvironment`, **quando `REVIEWS_V2_ENABLED=true`**, continua exigindo autenticação e persistência ativas, ambiente não produção, API em `3001` e runtime `omini_app` em `127.0.0.1:15433/OminiDB`. `1433`, outros hosts, bancos e usuários são recusados antes da inicialização da API protegida. O nome TLS `localhost` não muda o host validado para `localhost`.

A fábrica não cria uma nova política global de destinos para os fluxos legados: respeita a configuração recebida. O bloqueio estrito da homologação permanece no guard de configuração acima; não desligar a flag nem trocar a URL para contornar falhas. O runner de migrations e seu destino separado `omini_migrator` continuam inalterados. Este ajuste do adapter JavaScript não constitui correção ou validação da CLI nativa de migrations.

Não foram modificados `.env`, credenciais, dependências/lockfile, schema, migrations, permissões SQL, autenticação, avaliações, cancelamentos, persistência da sessão ou código mobile. Identificar qual instância realmente escuta em `15433` continua sendo uma verificação local do responsável, não comprovável pelos testes offline.

## Regressões e verificações sem banco

O novo arquivo `apps/api/test/prisma-factory-tls.test.ts` exercita a fábrica, o Prisma Client e o adapter reais. Intercepta `ConnectionPool.prototype.connect` da mesma instância mssql carregada pelo adapter e interrompe a execução antes de abrir o pool. Assim observa a configuração efetivamente entregue ao driver **sem handshake TLS, resolução de host, consulta ou conexão SQL**, inclusive nos cenários negativos que mencionam `1433`.

Os dez testes cobrem:

- Nome TLS DNS e destino TCP preservado, com certificado confiável exigido ou confiança local explicitamente configurada.
- Preservação de usuário, senha fictícia com delimitadores, banco e timeouts; cliente preguiçoso e ausência de fallback.
- Certificado validado por padrão; override limitado ao IP e porta exatos, sem afetar outros destinos.
- Guard de homologação preservado para host, porta principal, banco, usuário, criptografia, ambiente e porta HTTP.
- URLs inválidas, opções arbitrárias/duplicadas e tentativa de desligar criptografia recusadas.

| Verificação                                       | Resultado nesta entrega                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Dez regressões da fábrica em Node `24.22.1` Linux | Aprovadas, com pool interceptado.                                                                 |
| Dez regressões da fábrica em Node `26.13.0` Linux | Aprovadas, com pool interceptado. Node obtido temporariamente, sem mudar dependências do projeto. |
| API completa em Node `24.22.1`                    | 285 testes aprovados, incluindo as dez regressões novas.                                          |
| Mobile em Node `24.22.1`                          | 212 testes aprovados, em vinte suítes.                                                            |
| Typecheck, lint e build da API                    | Aprovados em Node `24.22.1`.                                                                      |
| Prisma validate e verificações de migrations      | Aprovados: quinze modelos e contratos SQL verificados estaticamente; sem executar SQL.            |
| Rotas, runtime mobile, marca, segredos e diff     | Aprovados: 39 rotas; revisão mobile `2.6-mobile-r4` e fingerprint `03db7f71aeec867c` preservados. |
| Prisma + SQL Server real / Windows / iPhone       | Não executado; validação real pendente.                                                           |

## Reproduzir os testes no Windows sem banco

Com as dependências instaladas e os arquivos desta correção já recebidos, sem substituir os arquivos locais de ambiente:

```powershell
Set-Location C:\projetos\omini
git branch --show-current
node --version
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build:api
npm.cmd run prisma:validate -w @omini/api
npm.cmd run check:migrations -w @omini/api
npm.cmd run check:routes
npm.cmd run check:secrets
```

Para repetir somente os dez testes com o Node `26.13.0` instalado no Windows:

```powershell
Set-Location C:\projetos\omini\apps\api
node --import tsx --test test/prisma-factory-tls.test.ts
```

Os comandos acima não iniciam a API nem executam migrations/seed. O runner da suíte remove as URLs de banco herdadas e usa doubles/repositórios em memória.

## Homologação real posterior, sob autorização

1. Confirmar `feature/fase-2-6`, recebimento dos três arquivos desta correção, Node `26.13.0` e dependências já fixadas. Não usar `git pull` como prova de recebimento enquanto esta correção não estiver publicada.
2. Confirmar localmente que `127.0.0.1:15433` pertence a `OMINI_TEST`, com `OminiDB` e runtime `omini_app`, sem imprimir a URL/segredos. Não tocar na instância principal/1433.
3. Após autorização de acesso ao banco de testes, usar a configuração isolada e o procedimento de início da API já descritos em [ativação segura](fase-2-6-ativacao-segura.md#powershell-iniciar-api-e-expo-após-o-corte-aprovado), mantendo `REVIEWS_V2_ENABLED=true` e os demais controles. Não executar as seções de migrations ou permissões para testar este ajuste TLS.
4. Confirmar uma leitura real pelo caminho Prisma, como catálogo/categorias retornando as oito categorias existentes. `/api/health` sozinho não comprova conexão ao banco; o sucesso anterior com mssql direto também não substitui essa verificação.
5. Registrar ausência de `ESOCKET`/`ERR_INVALID_ARG_VALUE` e erros sanitizados; não copiar tokens, senhas, URLs completas ou dados pessoais para o relatório.
6. Com acesso de testes autorizado, repetir autenticação/sessão, catálogo, cancelamentos e avaliações protegidas com contas de testes autorizadas. Não apagar registros nem executar seeds/migrations para resolver eventual falha. A homologação no iPhone continua separada.

Se falhar, preservar a configuração e coletar somente o código de erro sanitizado. Não desligar `encrypt`, relaxar a validação de certificados, trocar para `1433` ou alterar o SQL Server como fallback. A conexão Prisma só poderá ser considerada validada depois do teste real no Windows.
