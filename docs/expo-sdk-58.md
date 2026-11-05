# Atualização para Expo SDK 58 / Expo Go no iPhone

Branch: `fix/expo-sdk-58-ios`, derivada de `feature/fase-1-fundacao-mobile` (`0eaf49d`). Escopo: corrigir a incompatibilidade SDK 55 × Expo Go 58, preservando Fase 1. Não inclui Fase 2.

## Matriz e fontes oficiais

A documentação recomenda alinhar pacotes com `expo install --fix`, executar Expo Doctor e revisar as mudanças entre SDKs. Foram consultados o guia oficial e o changelog do Router para os SDKs 56, 57 e 58. O site `docs.expo.dev` retornou 403 nesta rede; os mesmos documentos foram lidos no repositório oficial do Expo. A matriz exata vem de `expo@58.0.23/bundledNativeModules.json`, distribuída pelo npm, e foi conferida com o template TypeScript oficial `expo-template-blank-typescript@58.0.32`.

- [Guia oficial de atualização](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/), [fonte oficial consultada](https://github.com/expo/expo/blob/main/docs/pages/workflow/upgrading-expo-sdk-walkthrough.mdx).
- [Matriz distribuída com SDK 58.0.23](https://www.npmjs.com/package/expo/v/58.0.23?activeTab=code).
- [Changelog oficial do Expo Router](https://github.com/expo/expo/blob/main/packages/expo-router/CHANGELOG.md).
- [Referência SDK 58](https://docs.expo.dev/versions/v58.0.0/).

Versões efetivamente instaladas no lockfile:

| Pacote                                        | Versão                         |
| --------------------------------------------- | ------------------------------ |
| expo                                          | 58.0.23                        |
| react / react-dom                             | 19.3.0                         |
| react-native                                  | 0.88.1                         |
| expo-router                                   | 58.0.30                        |
| expo-constants                                | 58.0.15                        |
| expo-font                                     | 58.0.11                        |
| expo-linking                                  | 58.0.16                        |
| expo-status-bar                               | 58.0.4                         |
| react-native-safe-area-context                | 5.11.1                         |
| react-native-screens                          | 4.30.1                         |
| @expo/vector-icons                            | 15.1.1 (matriz aceita ^15.0.2) |
| jest / jest-expo                              | 30.5.2 / 58.0.14               |
| @testing-library/react-native / test-renderer | 14.1.0 / 1.3.0                 |
| TypeScript mobile                             | 6.0.3                          |
| expo-doctor                                   | 1.21.6                         |

Node suportado pelo Expo 58: `^22.13.0 || ^24.3.0 || ^26.0.0 || >=27.0.0`. Para reproduzir no Windows, prefira Node 24 LTS >=24.3 ou Node 22 LTS >=22.13.

## Alterações necessárias

- Atualizados manifestos e lockfile, incluindo overrides React/React DOM 19.3.0 na raiz para manter uma única instância. Removido o antigo pin/uso de `react-test-renderer` 19.2; Jest Expo 58 usa `test-renderer`.
- Testing Library 14 e Expo Router testing-library passaram a usar operações assíncronas: renderização, eventos e navegação agora são aguardados. As mesmas verificações de busca, detalhes, retorno e troca de modos foram mantidas.
- Abas usam o entry point recomendado `expo-router/js-tabs`. Os ícones usam as mesmas cores do tema conforme `focused`, evitando a incompatibilidade entre `ColorValue` ampliado do Router e os tipos da biblioteca de ícones, sem casts.
- TypeScript 6 requer os tipos de ambiente explícitos no mobile. O compilador do backend/shared continua em 5.9, sem alterar seus arquivos ou a configuração SQL Server.
- A CLI Expo hoisted busca `expo-router/internal/testing` a partir da raiz. O Router 58.0.30 também foi declarado como ferramenta na raiz, compartilhando a mesma instalação do mobile. Isso corrige o erro de geração de rotas tipadas sem desativar `typedRoutes`.
- Não foi necessário criar Metro/Babel customizados: os padrões do Expo tratam os workspaces. `app.json` permanece igual; não há diretórios nativos versionados para regenerar. Não foram adicionadas bibliotecas de funcionalidades nativas. Safe Area, Screens e módulos Expo instalados seguem a matriz do Expo Go 58; peers opcionais de drawer/animações não foram adicionados sem uso.
- Workflow de qualidade mantém todas as verificações existentes e inclui Expo Doctor e a branch de correção.

## Atualizar no Windows / PowerShell

Feche o Metro anterior com Ctrl+C. Execute na raiz do clone. Antes de trocar de branch, preserve quaisquer alterações indicadas por `git status`; não use reset ou checkout forçado.

```powershell
git status --short
git fetch origin
git switch fix/expo-sdk-58-ios
git pull --ff-only
node --version
npm ci
```

Não execute `npm update`, `--force` ou `--legacy-peer-deps`. `npm ci` substitui as dependências geradas de acordo com o lockfile; não precisa apagar o lockfile.

Preserve configurações locais já existentes. Crie templates somente se ainda não houver `.env`:

```powershell
if (!(Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
if (!(Test-Path apps/mobile/.env)) { Copy-Item apps/mobile/.env.example apps/mobile/.env }
ipconfig
```

Em `apps/mobile/.env`, configure `EXPO_PUBLIC_API_URL=http://IPV4_DO_WINDOWS:3000/api`. Use o IPv4 da rede Wi-Fi, sem localhost para o iPhone. Não inclua senhas em variáveis `EXPO_PUBLIC_*`.

Terminal 1, raiz do monorepo:

```powershell
npm run dev:api
```

Terminal 2, mesma raiz:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
npm run dev:mobile -- --go --clear
```

Atualize o Expo Go na App Store para a versão com suporte ao SDK 58. Windows e iPhone devem estar na mesma rede Wi-Fi, com acesso à rede local permitido para Expo Go em Ajustes. Escaneie o QR usando a Câmera do iPhone e abra no Expo Go. Se o telefone perguntar sobre rede local, permita. Não use um QR de uma instância antiga do Metro. Se o erro ainda mencionar SDK 55, confirme `git branch --show-current` e `npm ls expo -w @omini/mobile`, encerre o servidor antigo e gere um QR novo.

O firewall precisa permitir Node/Metro na porta 8081 e API na porta 3000 para a rede privada. Teste `http://IPV4_DO_WINDOWS:3000/api/health` no Safari do iPhone. Redes de convidados, isolamento de Wi-Fi e VPN podem impedir o acesso. Não exponha SQL Server ao telefone. O backend continua iniciando sem banco.

### Conferências locais

```powershell
npm run typecheck
npm run lint
npm test
npm run build:api
npm run check:routes
npm run check:secrets
npm run check:dependencies -w @omini/mobile
npm run doctor -w @omini/mobile
npm ls react react-dom test-renderer
```

No iPhone: boas-vindas → cliente → categorias → profissional → voltar → busca → solicitações → perfil → prestador → painel/recebidas/serviços/perfil → voltar ao cliente. Verifique também as abas por toque, áreas seguras, teclado, botão de diagnóstico da API e textos de funcionalidades indisponíveis. Nada deve criar conta ou contratação.

## Validação e limites

Instalação limpa `npm ci` e alinhamento oficial `expo install --fix` foram executados sem flags de conflito. A validação de dependências do Expo usou `EXPO_OFFLINE=1` com a matriz distribuída no pacote SDK 58; esse resultado não comprova acesso aos serviços remotos.

| Verificação executada           | Resultado                                                                |
| ------------------------------- | ------------------------------------------------------------------------ |
| `npm ci` com lockfile final     | Passou; resolução do Router preservada após reinstalação                 |
| `npm run typecheck`             | Passou nos 3 workspaces, inclusive com rotas tipadas geradas             |
| `npm run lint`                  | Passou                                                                   |
| `npm test`                      | 5 testes passaram (2 API, 3 mobile), sem testes ignorados                |
| `npm run build:api`             | Passou; testes HTTP confirmam health/Swagger sem banco                   |
| `npm run check:routes`          | Passou; 15 arquivos e ambas as experiências                              |
| `npm run check:secrets`         | Passou                                                                   |
| `npm ls --all`                  | Passou, sem peers inválidos                                              |
| `expo install --check` offline  | Passou contra a matriz local SDK 58                                      |
| `export:ios` e `export:android` | Bundles Hermes gerados; não são builds IPA/APK                           |
| Metro `--go --clear`            | Iniciou após instalação limpa; manifesto iOS retornou SDK/runtime 58     |
| Backend e SQL Server            | Arquivos preservados; NestJS 11.2.8 e Prisma 6.19.3 mantidos no lockfile |

O Expo Doctor 1.21.6 executou as 20 verificações: **18 passaram e 2 ficaram pendentes por falhas de rede** (schema remoto da configuração Expo e metadados React Native Directory). Foi tentado também o suporte oficial `NODE_USE_ENV_PROXY=1` do Node; o resultado continuou 18/20. Nenhuma verificação foi desativada. Peers, duplicações, versões do SDK, Metro e compatibilidade dos pacotes de suporte nativo passaram.

Execução real em iPhone/Expo Go não foi realizada neste ambiente Linux, sem aparelho conectado ou Xcode. Os bundles e testes automatizados não substituem essa etapa. A aceitação no aparelho permanece pendente até executar o roteiro acima. O SQL Server local Windows também não foi testado, pois não é parte da correção; nenhum modelo, tabela ou migration foi criado.
