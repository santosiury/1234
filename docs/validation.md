# Evidências de validação — Fase 1

Validação na máquina Linux da nuvem, Node 24.22.1 / npm 11.9.0. Não equivale a validação em Windows ou aparelho físico.

| Verificação                                                  | Resultado                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `npm ci` com lockfile                                        | Passou; instalação limpa com 1.033 pacotes antes de adicionar apenas o formatador                                        |
| `npm run typecheck`                                          | Passou nos três workspaces                                                                                               |
| `npm run lint`                                               | Passou                                                                                                                   |
| `npm test`                                                   | 5 testes passaram: 2 da API, 3 mobile, nenhum ignorado                                                                   |
| `npm run build:api`                                          | Passou; API compilada também iniciou sem DATABASE_URL                                                                    |
| HTTP da API compilada                                        | `/api/health`, `/docs` e `/docs-json` retornaram 200                                                                     |
| `npm run check:routes`                                       | Passou; 15 arquivos e layouts de ambas as experiências                                                                   |
| `npm run check:secrets` e `git check-ignore`                 | Passaram; templates permitidos, `.env` ignorados                                                                         |
| `EXPO_OFFLINE=1 npm run check:dependencies -w @omini/mobile` | Passou com matriz local do SDK; serviço remoto Expo não validado                                                         |
| `export:android` e `export:ios`                              | Passaram; bundles nativos Hermes, sem APK/IPA                                                                            |
| `EXPO_OFFLINE=1 CI=1 npm run dev:mobile -- --port 8081`      | Metro iniciou; `/status` e manifesto Android verificados, runtime `exposdk:55.0.0`                                       |
| `prisma:validate` com URL fictícia                           | Bloqueado por 403 no download do checksum em `binaries.prisma.sh`; verificação de integridade preservada                 |
| SQL Server / conexão real                                    | Não executado: instância Windows não fornecida; não é requisito para iniciar API nesta fase                              |
| Expo Go, Android/iOS físico e Windows                        | Não executados: nenhum dispositivo, SDK Android/emulador ou Xcode disponível; instruções fornecidas para validação local |
| Workflow GitHub Actions                                      | Criado; execução remota ainda não confirmada                                                                             |

Os testes de navegação usam componentes e Expo Router reais sob Jest/renderer, com os mocks nativos do preset oficial. Cobrem categoria, busca sem resultado, perfil, voltar, ações futuras desabilitadas, ambas as experiências, disponibilidade local e bloqueio de entrada direta sem selecionar modo. Não substituem testes de interação nativa, acessibilidade ou inspeção visual.

Correções verificadas: versão React Native alinhada à matriz do SDK e uma única instância React 19.2.0 para impedir incompatibilidade com renderer/Expo Go. Tentativas iniciais que falharam foram corrigidas antes da rodada final. A consulta Expo online retornou Forbidden; o modo offline é explicitado nos resultados, sem afirmar validação remota.

Pendências para aceitar a fase integralmente: executar em Expo Go/development build compatível no Android e iPhone, conferir layout/áreas seguras/teclado, testar API pela LAN no Windows e validar schema quando a política permitir `binaries.prisma.sh`. A autenticação, tabelas de negócio e contratação permanecem fora do escopo.
