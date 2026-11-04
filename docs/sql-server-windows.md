# SQL Server local no Windows (preparação opcional)

A Fase 1 não exige banco. Não há modelos de negócio, migrations, geração de tabelas ou conexão automática na API. O provider Prisma é exclusivamente `sqlserver`, com Prisma 6.19.3.

1. Instale Microsoft SQL Server Developer (desenvolvimento) ou Express e SQL Server Management Studio. Registre o nome da instância; Express costuma usar `SQLEXPRESS`. Não use SQLite ou outro banco como substituto.
2. No SSMS, em propriedades do servidor → Segurança, habilite **SQL Server e autenticação do Windows (modo misto)**; reinicie o serviço. Crie um login de desenvolvimento específico com senha forte, sem usar `sa` na aplicação. Crie manualmente o banco vazio `omini` e associe um usuário com somente as permissões necessárias. Nenhuma tabela deve ser criada nesta fase.
3. No SQL Server Configuration Manager → Protocolos da instância → TCP/IP, habilite TCP/IP. Em IPAll, limpe portas dinâmicas e defina TCP Port `1433` (ou outra porta fixa). Reinicie a instância. O nome da instância não substitui a porta no URL do Prisma.
4. Para backend e SQL Server no mesmo Windows use `127.0.0.1:1433`; não é preciso expor SQL Server ao telefone ou à Internet. Se estiverem em máquinas diferentes, firewall e roteamento privado precisam permitir a conexão, restrita ao host da API. A nuvem não consegue usar `localhost` para alcançar seu Windows.
5. Copie `apps/api/.env.example` para `apps/api/.env`. Preencha apenas localmente:

```dotenv
DATABASE_URL="sqlserver://127.0.0.1:1433;database=omini;user=omini_dev;password={SUBSTITUA_LOCALMENTE};encrypt=true;trustServerCertificate=true"
```

Os valores acima são placeholders. Valores contendo delimitadores SQL Server (como `;` ou `=`) devem usar escaping com chaves conforme a documentação de URLs SQL Server do Prisma. Não cole senhas em issues, logs ou commits.

**Certificados:** `encrypt=true` mantém transporte criptografado. `trustServerCertificate=true` aceita o certificado autoassinado apenas no desenvolvimento local. Em produção, instale uma cadeia confiável, use hostname correspondente e `trustServerCertificate=false`. Nunca aplique desativação global de TLS no Node ou no instalador.

## Testar posteriormente

Na raiz do monorepo, com SQL Server configurado:

```powershell
Test-NetConnection 127.0.0.1 -Port 1433
npm run prisma:validate -w @omini/api
npm run db:check -w @omini/api
```

`prisma:validate` valida schema e URL sem testar conectividade. `db:check` executa apenas `SELECT 1` via Prisma CLI, sem precisar de modelos ou gerar um cliente. A saída do driver é omitida para proteger credenciais. Se falhar, confira login pelo SSMS, porta fixa, nome do banco e certificado. Não execute `db push`, `migrate dev`, `migrate deploy` ou `db pull` para concluir esta fase. A integração real será feita em fase posterior com requisitos próprios.

Referências: https://www.prisma.io/docs/orm/overview/databases/sql-server e documentação Microsoft SQL Server Configuration Manager.
