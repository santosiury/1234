# Omini · Prestadores e catálogo (Fase 2.3)

Marketplace mobile de serviços para Araranguá, SC. Um aplicativo Android/iOS, duas experiências, cadastro/login e sessão segura. Esta fase integra perfil profissional, serviços, áreas de atendimento e catálogo público ao SQL Server existente. Contratação, pagamentos e avaliações continuam indisponíveis. A demonstração está separada do catálogo real.

Atualização e testes locais: [Fase 2.3 — prestadores, catálogo, Windows e iPhone](docs/fase-2-3-prestadores.md). **Nenhuma nova migration, seed ou alteração de credenciais é necessária nesta fase.**

Redesign visual em `feature/fase-2-2-visual`, baseado em `21ad687`: marca vetorial, preto/branco/verde-lima, Inter local e splash Expo SDK 58. Consulte [o guia visual e o roteiro de validação no iPhone](docs/fase-2-2-visual.md). Autenticação, SecureStore e banco permanecem preservados; esta etapa não requer migrations.

## Estrutura

```text
omini/                         # raiz do checkout (pasta 1234 na nuvem)
  apps/mobile/                 # Expo SDK 58, Router, React Native, TypeScript
    app/client/                # abas de cliente
    app/provider/              # abas de prestador
    app/professional/[id].tsx   # detalhes com retorno
    src/components/            # componentes e identidade visual
    src/demo/                  # catálogo fictício, somente no modo demonstrativo
    src/marketplace/           # catálogo real, API e formulários do prestador
    test/                      # testes de navegação e busca
  apps/api/                    # NestJS 11, REST e Swagger
    src/health/                # módulo de liveness
    src/marketplace/            # perfil, serviços, áreas e busca pública SQL Server
    prisma/                    # schema sqlserver, migration inicial e seed
    test/                      # HTTP, Swagger, erros, CORS e configuração
  packages/shared/             # contratos TypeScript, sem dependências de runtime
  scripts/                     # verificações de rotas e arquivos sensíveis
  docs/                        # arquitetura, SQL Server e validação
```

## Windows / PowerShell

Para atualizar a instalação existente em `C:\projetos\omini`, siga [Fase 2.3 — atualização sem migration e teste de prestadores no iPhone](docs/fase-2-3-prestadores.md). Preserve as credenciais locais. Se ainda não configurou a autenticação anterior, consulte [o guia da Fase 2.2](docs/fase-2-2-autenticacao.md). As instruções abaixo para clone novo permitem explorar o modo demonstrativo; o catálogo real exige persistência habilitada.

Para atualizar um clone existente da Fase 1, siga [atualização para SDK 58 e validação no iPhone](docs/expo-sdk-58.md). Os comandos abaixo também permitem uma instalação nova.

Instale Git e Node.js **22 LTS >=22.13** (ou Node 24 LTS >=24.3). Use npm; não misture gerenciadores. No iPhone, o desenvolvimento com Expo Go funciona no Windows; builds nativos iOS locais exigem macOS/Xcode.

```powershell
git clone https://github.com/santosiury/1234.git omini
cd omini
git switch feature/fase-2-3-prestadores
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

Atualize o **Expo Go da App Store com suporte ao SDK 58**. Abra a Câmera do iPhone, escaneie o QR e escolha abrir no Expo Go. Permita acesso à rede local em Ajustes → Apps → Expo Go → Rede Local. O iPhone e o Windows precisam estar na mesma rede Wi-Fi. Esta branch alinha o projeto ao SDK 58; a execução em iPhone físico ainda precisa ser validada no aparelho. Não use o comando de web para substituir o aplicativo nativo.

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
7. No perfil profissional, alterne de volta a cliente. Sem login, reiniciar volta à entrada demonstrativa. Contas autenticadas restauram a sessão com Expo SecureStore; veja o roteiro da Fase 2.2.

A disponibilidade é apenas estado local do painel e reinicia quando o modo prestador é encerrado. Não altera nenhum profissional real.

## Comandos de qualidade

Execute a partir da raiz. Cada comando deve terminar com sucesso; não trate o sucesso de um comando posterior como sucesso dos anteriores.

```powershell
npm run typecheck
npm run lint
npm test
npm run build:api
npm run prisma:validate -w @omini/api
npm run check:migrations -w @omini/api
npm run check:routes
npm run check:brand
npm run check:secrets
npm run check:dependencies -w @omini/mobile
npm run doctor -w @omini/mobile
npm run export:android -w @omini/mobile -- --max-workers 2
npm run export:ios -w @omini/mobile -- --max-workers 2
```

Os exports verificam bundles Hermes, **não geram APK/IPA nem comprovam execução em dispositivo**. As dependências nativas seguem a matriz do SDK 58; React/React DOM são fixados em 19.3.0 no monorepo. Os testes usam `test-renderer` 1.3.0 com Testing Library 14 e Jest 30; o pin antigo de `react-test-renderer` foi removido. O mobile usa TypeScript 6, enquanto o backend e shared mantêm TypeScript 5.9.

API compilada: `npm run build:api` e `npm start -w @omini/api`. Não exige `DATABASE_URL`. Endpoints: `/api/health`, `/docs`, `/docs-json`. CORS aceita por padrão `http://localhost:8081`; configure `CORS_ORIGINS` com origens HTTP exatas separadas por vírgula. Aplicativos nativos não dependem de CORS. O health informa somente vida do processo, sem indicar disponibilidade de banco.

Persistência opcional: consulte [Fase 2.1 — configuração, permissões e migrations no Windows](docs/fase-2-1-persistencia.md). O banco existente é OminiDB; migrations só são aplicadas localmente após revisão, nunca no startup. A credencial runtime omini_app é separada de omini_migrator.

## Diagnóstico

- **Metro não encontra módulos:** rode `npm ci` na raiz e `npm run dev:mobile -- --clear`. Não instale pacotes separadamente dentro de cada workspace.
- **Invalid hook call / renderer incompatível:** `npm ls react react-dom test-renderer`; deve resolver React 19.3.0. Não remova os pins/overrides sem atualizar todo o SDK.
- **Celular sem acesso à API:** confira IP, sufixo `/api`, porta, Wi-Fi, VPN, firewall e isolamento da rede. A nuvem deste ambiente não é a rede local do seu celular.
- **Expo Go incompatível:** confirme suporte ao SDK 58. Não force dependências nativas de outro SDK.
- **API não inicia:** `PORT` deve ser inteiro entre 1 e 65535; remova origens inválidas em `CORS_ORIGINS`. Porta ocupada: escolha outra e atualize o mobile.
- **Proxy bloqueia Expo:** `EXPO_OFFLINE=1` no ambiente permite Metro e verificação pela matriz local do SDK; não valida serviços remotos. No PowerShell: `$env:EXPO_OFFLINE='1'`; para desfazer: `Remove-Item Env:EXPO_OFFLINE`.
- **Prisma 403/checksum:** libere `binaries.prisma.sh` na política de rede. Nunca desative TLS ou checksums. Não é necessário para executar o health check.

## Limites e segurança

Nenhuma variável `EXPO_PUBLIC_*` deve conter segredos: seu valor é embutido no app. `.env` e saídas de build estão ignorados. Somente os templates são versionados. Há uma migration inicial versionada para seis entidades, ainda não aplicada por este ambiente; não há credenciais reais no repositório. A API implementa autenticação e rate limiting por processo, sem contratação. Antes de implantação, valide SQL/iPhone e configure HTTPS; múltiplas instâncias exigem limite compartilhado. Veja [arquitetura](docs/architecture.md) e [validação](docs/validation.md). A validação da atualização está em [SDK 58](docs/expo-sdk-58.md).
