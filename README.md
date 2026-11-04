# Omini · Fase 1

Marketplace mobile de serviços para Araranguá, SC. **Um aplicativo Android/iOS, duas experiências demonstrativas.** Não há login, contas, contratação, avaliações ou profissionais reais. Não é PWA. O backend não depende do SQL Server para iniciar.

## Estrutura

```text
omini/                         # raiz do checkout (pasta 1234 na nuvem)
  apps/mobile/                 # Expo SDK 55, Router, React Native, TypeScript
    app/client/                # abas de cliente
    app/provider/              # abas de prestador
    app/professional/[id].tsx   # detalhes com retorno
    src/components/            # componentes e identidade visual
    src/demo/                  # catálogo fictício
    test/                      # testes de navegação e busca
  apps/api/                    # NestJS 11, REST e Swagger
    src/health/                # módulo de liveness
    prisma/schema.prisma       # provider sqlserver, sem modelos
    test/                      # HTTP, Swagger, erros, CORS e configuração
  packages/shared/             # contratos TypeScript, sem dependências de runtime
  scripts/                     # verificações de rotas e arquivos sensíveis
  docs/                        # arquitetura, SQL Server e validação
```

## Windows / PowerShell

Instale Git e Node.js **22 LTS >=22.13** (ou Node 24 LTS). Use npm; não misture gerenciadores. No iPhone, o desenvolvimento com Expo Go funciona no Windows; builds nativos iOS locais exigem macOS/Xcode.

```powershell
git clone https://github.com/santosiury/1234.git omini
cd omini
git switch feature/fase-1-fundacao-mobile
npm ci
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/mobile/.env.example apps/mobile/.env
npm run dev:api
```

O nome remoto continua `1234`; a criação de `OMINI` na conta GitHub não foi confirmada. A raiz deste checkout é o monorepo, sem uma segunda pasta `omini/` aninhada.

Em outro terminal PowerShell, na raiz:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Start-Process http://localhost:3000/docs
ipconfig
```

Edite `apps/mobile/.env`, substituindo o IP pelo IPv4 do computador na mesma rede Wi-Fi do celular:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.100:3000/api
```

**Não use localhost/127.0.0.1 no celular físico:** esses endereços apontam para o próprio telefone. O backend escuta em `0.0.0.0`. Confira no navegador do telefone `http://IP_DO_PC:3000/api/health` antes de testar o app. Use rede privada confiável e permita Node/porta 3000 e Metro/8081 no Firewall do Windows somente para essa rede. Redes de convidados podem isolar dispositivos. Emulador Android pode usar `10.0.2.2` para acessar o host Windows.

```powershell
npm run dev:mobile
```

Escaneie o QR com um **Expo Go compatível com SDK 55**. No Android, versões compatíveis podem ser obtidas em https://expo.dev/go; o Expo Go da loja pode suportar apenas um SDK mais recente. No iPhone físico, caso o Expo Go da App Store já não suporte SDK 55, será necessário um development build compatível ou atualização planejada do SDK; isso não foi validado nesta entrega. Não use o comando de web para substituir o aplicativo nativo.

Reinicie o Expo com cache limpo após mudar variáveis:

```powershell
npm run dev:mobile -- --clear
```

### Roteiro de navegação

1. Boas-vindas → **Explorar como cliente**.
2. Categorias → Eletricista → Ana Martins → voltar.
3. Busca aceita nome, especialidade e bairro, sem diferenciar acentos. Termo inexistente mostra estado vazio. Remova o filtro para voltar ao catálogo completo.
4. Solicitações mostra indisponibilidade, sem criar registros.
5. Perfil → Testar conexão (health check real da sua API).
6. Perfil → **Mudar para prestador** → painel, disponibilidade demonstrativa, recebidas, serviços e perfil.
7. No perfil profissional, alterne de volta a cliente. Reiniciar o app volta à entrada demonstrativa; nenhuma sessão de autenticação é persistida.

A disponibilidade é apenas estado local do painel e reinicia quando o modo prestador é encerrado. Não altera nenhum profissional real.

## Comandos de qualidade

Execute a partir da raiz. Cada comando deve terminar com sucesso; não trate o sucesso de um comando posterior como sucesso dos anteriores.

```powershell
npm run typecheck
npm run lint
npm test
npm run build:api
npm run check:routes
npm run check:secrets
npm run check:dependencies -w @omini/mobile
npm run export:android -w @omini/mobile -- --max-workers 2
npm run export:ios -w @omini/mobile -- --max-workers 2
```

Os exports verificam bundles Hermes, **não geram APK/IPA nem comprovam execução em dispositivo**. As dependências nativas seguem a matriz do SDK 55; React e seu renderer são fixados em 19.2.0 no monorepo para impedir múltiplas instâncias incompatíveis.

API compilada: `npm run build:api` e `npm start -w @omini/api`. Não exige `DATABASE_URL`. Endpoints: `/api/health`, `/docs`, `/docs-json`. CORS aceita por padrão `http://localhost:8081`; configure `CORS_ORIGINS` com origens HTTP exatas separadas por vírgula. Aplicativos nativos não dependem de CORS. O health informa somente vida do processo, sem indicar disponibilidade de banco.

SQL Server opcional: consulte [configuração Windows](docs/sql-server-windows.md). Não execute migrations nesta fase.

## Diagnóstico

- **Metro não encontra módulos:** rode `npm ci` na raiz e `npm run dev:mobile -- --clear`. Não instale pacotes separadamente dentro de cada workspace.
- **Invalid hook call / renderer incompatível:** `npm ls react react-dom react-test-renderer`; deve resolver React 19.2.0. Não remova os pins/overrides sem atualizar todo o SDK.
- **Celular sem acesso à API:** confira IP, sufixo `/api`, porta, Wi-Fi, VPN, firewall e isolamento da rede. A nuvem deste ambiente não é a rede local do seu celular.
- **Expo Go incompatível:** confirme suporte ao SDK 55. Não force dependências nativas de outro SDK.
- **API não inicia:** `PORT` deve ser inteiro entre 1 e 65535; remova origens inválidas em `CORS_ORIGINS`. Porta ocupada: escolha outra e atualize o mobile.
- **Proxy bloqueia Expo:** `EXPO_OFFLINE=1` no ambiente permite Metro e verificação pela matriz local do SDK; não valida serviços remotos. No PowerShell: `$env:EXPO_OFFLINE='1'`; para desfazer: `Remove-Item Env:EXPO_OFFLINE`.
- **Prisma 403/checksum:** libere `binaries.prisma.sh` na política de rede. Nunca desative TLS ou checksums. Não é necessário para executar o health check.

## Limites e segurança

Nenhuma variável `EXPO_PUBLIC_*` deve conter segredos: seu valor é embutido no app. `.env` e saídas de build estão ignorados. Somente os templates são versionados. Não há migrations, tabelas de negócio ou credenciais reais. A API não implementa autenticação, rate limit de produção ou endpoints de contratação; não a publique como produto final. Veja [arquitetura](docs/architecture.md) e [validação](docs/validation.md).
