# Omini — Fase 2.2.V: identidade visual

## Escopo e base

Branch `feature/fase-2-2-visual`, criada a partir de `21ad6870bed14b2b702cf6312b0b34987ccdc550` da autenticação. Redesign exclusivamente visual para Expo SDK 58 / React Native 0.88.1 / React 19.3.0. Sem merge na main ou na Fase 2.3.

A conta, os contratos HTTP, a política de senha, o Argon2id, JWT, refresh/rotação/revogação, SecureStore e as regras de perfil não mudaram. Nenhuma alteração no backend, schema, migrations, grants ou seed. Nenhum comando de migração foi executado. Permanecem `provider = "sqlserver"` no schema e `provider = "mssql"` no lock das migrations.

## Identidade e tokens

A referência foi traduzida para fundos claros, hierarquia tipográfica forte, cards brancos e áreas de destaque pretas. Verde-lima destaca ações e seleção; o texto sobre verde é preto. Não há fotos, avaliações, distância, preços ou serviços reais inventados.

| Token          | Cor       | Aplicação                                 |
| -------------- | --------- | ----------------------------------------- |
| `dark` / `ink` | `#101010` | Abertura, títulos, banners                |
| `darkSurface`  | `#1C1C1C` | Apoio em superfícies escuras              |
| `surface`      | `#FFFFFF` | Cards, formulários                        |
| `background`   | `#F7F7F5` | Telas de navegação                        |
| `accent`       | `#C7FF63` | CTA, seleção de abas                      |
| `pale`         | `#EFF8DF` | Ícones, iniciais, badges                  |
| `muted`        | `#666660` | Texto secundário; ajustado para contraste |
| `onDarkMuted`  | `#BDBDB6` | Texto sobre preto                         |
| `border`       | `#E8E8E5` | Divisão e contorno de cards               |
| `inputBorder`  | `#8C8C83` | Limite visível dos campos                 |
| `focus`        | `#547D20` | Campo com foco                            |
| `danger`       | `#AB2929` | Erros e saída da conta                    |

`apps/mobile/src/theme.ts` centraliza cores semânticas, famílias tipográficas, tamanhos, espaçamentos, raios e sombra disponível. Componentes usam esses tokens. Sem animações próprias ou dependências de animação; o feedback de pressão é discreto e os indicadores são os nativos.

Inter 400, 500, 600 e 700, distribuída por `@expo-google-fonts/inter@0.4.2` (licença OFL no pacote), carregada de arquivos locais com `expo-font`. Os imports apontam somente aos quatro pesos usados. Não há download de fonte na abertura. Um erro de fonte libera a inicialização para o fallback do sistema, em vez de prender a splash.

## Componentes

- `components/Brand.tsx`: marca em imagem de alta resolução, slogan e `OminiLoadingState` de abertura/restauração.
- `components/ui.tsx`: `ScreenContainer`, `Header`, `PrimaryButton`, `OminiInput`, `Badge`, `Feedback`, `EmptyState`, `ActionRow`, `SectionHeading`, categorias, profissionais e avisos demonstrativos.
- `components/TabIcon.tsx`: opções compartilhadas, destaque ativo e altura que considera a safe area e a escala de fonte.
- `components/Profile.tsx`: perfil comum às duas experiências e à rota da conta, distinguindo conta autenticada e visita demonstrativa.

Botões mantêm nome acessível durante carregamento e ficam bloqueados para novas submissões. Campos têm labels, ícones, foco e suporte a erro. Textos continuam escaláveis; cards podem crescer, grids usam quebra de linha e o conteúdo tem largura máxima de 620 pontos. Ações têm altura mínima de 44–56 pontos. ScrollView mantém rolagem, ajuste de teclado no iOS e padding inferior da área segura. A posição absoluta se limita ao indicador inferior da abertura, permitindo centralizar a marca independentemente dele.

## Telas

| Área                                     | Alteração                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Boas-vindas                              | Fundo preto, marca vetorial, slogan, composição abstrata com ícones, cadastro/login e exploração sem login  |
| Login / cadastro                         | Header da marca, campos com labels/ícones, foco, estados de envio, feedback e seleção dos perfis preservada |
| Home cliente                             | Busca destacada, banner escuro, categorias e perfis de exemplo por seção                                    |
| Categorias                               | Grid reutilizável com as mesmas oito especialidades demonstrativas                                          |
| Busca                                    | Campo reutilizável, filtro removível existente, resultados e aviso demonstrativo                            |
| Profissional                             | Card escuro, iniciais, especialidade, localidade, descrição e contratação desabilitada                      |
| Perfil / conta                           | Identidade real somente quando autenticado, perfis autorizados, troca de modo, atualização e logout         |
| Painel prestador                         | Card de disponibilidade local demonstrativa e atalhos para serviços e perfil existentes                     |
| Solicitações / serviços / não encontrada | Novo header, estados vazios e botões via componentes compartilhados                                         |
| Abas                                     | Ícones consistentes, seleção lima, rótulos e área segura                                                    |

A disponibilidade do prestador continua apenas local. Solicitações, serviços e contratação continuam explicitamente indisponíveis. Não foram adicionadas rotas ou funcionalidades da Fase 2.3.

## Marca e assets

Em `apps/mobile/assets/brand/`:

- `wordmark-light.svg` e `wordmark-dark.svg`: símbolo circular com dois cortes diagonais e letras geométricas em paths, sem depender de uma fonte instalada.
- `wordmark-light.png` e `wordmark-dark.png`: 1749 × 444, transparentes, proporção 583:148.
- `splash-lockup.png`: 1749 × 624, transparente, marca branca e slogan cinza “Tudo resolvido. Sem dor de cabeça.”.

A marca foi reconstruída em vetor a partir da imagem fornecida; não se trata de um arquivo vetorial original recebido. Não há recorte do painel de apresentação nem imagens de pessoas. Os PNGs ficam versionados para usar o app sem ferramentas gráficas. Geração reproduzível com Sharp 0.34.5, somente como ferramenta de desenvolvimento:

```powershell
npm run assets:brand
npm run check:brand
```

`check:brand` verifica dimensões, transparência, paths e configuração de abertura. O pipeline de qualidade também executa essa verificação na branch visual, preservando os checks anteriores.

## Abertura Expo

`expo-splash-screen@58.0.13`, conforme `expo/bundledNativeModules.json`, configurado em `apps/mobile/app.json`:

- Preto `#101010` em ambos os modos de aparência e na janela inicial.
- Asset da marca com slogan, `contain`, largura iOS 280 pontos.
- Android com largura 180 para manter o lockup dentro da região circular segura da splash do Android 12+. A composição pode aparecer menor por causa das regras do sistema.
- `preventAutoHideAsync()` em escopo de módulo; liberação quando fontes carregam ou falham.
- Enquanto há restauração, Modal React Native preto com a mesma marca. A Stack continua montada; não existe atraso artificial. A falha de rede libera o app com a mensagem de recuperação existente.

**Expo Go não é prova da splash nativa.** Pode mostrar ícone/tela do Expo Go. A abertura React Native aparece somente durante trabalho de inicialização/restauração e pode ser breve quando tudo está em cache. A tela de boas-vindas mantém a identidade. A apresentação exata da splash nativa e a transição sem flashes precisam de um build instalado e teste de abertura a frio.

Fontes e splash são as duas dependências mobile adicionadas. SecureStore e os pins/overrides de React e Expo permanecem. Sharp é dependência de desenvolvimento na raiz, não código embarcado.

## Verificações nesta entrega

Os resultados finais estão registrados abaixo após execução na nuvem. Nenhum teste aqui acessa o SQL Server do Windows ou um iPhone físico.

| Verificação                                                  | Resultado                                                                                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                     | Aprovado, instalação limpa pelo lockfile                                                                                                     |
| `npm run typecheck`                                          | Aprovado nos três workspaces                                                                                                                 |
| `npm run lint`                                               | Aprovado                                                                                                                                     |
| `npm test`                                                   | 47 aprovados: 27 API/scripts e 20 mobile, sem skips                                                                                          |
| `npm run build:api`                                          | Aprovado                                                                                                                                     |
| `npm run check:routes`                                       | 18 arquivos de rota e duas experiências aprovados                                                                                            |
| `npm run check:brand`                                        | Dimensões, transparência, vetores e configuração aprovados                                                                                   |
| `npm run check:secrets`                                      | Aprovado, inclusive arquivos novos não ignorados                                                                                             |
| `EXPO_OFFLINE=1 npm run check:dependencies -w @omini/mobile` | Matriz local do SDK 58 alinhada; sem consulta remota                                                                                         |
| `npm ls --all`                                               | Árvore completa sem dependências inválidas                                                                                                   |
| `npm run export:ios -w @omini/mobile -- --max-workers 2`     | Aprovado, bundle Hermes ~2,7 MB com os quatro pesos Inter e três PNGs                                                                        |
| `npm run export:android -w @omini/mobile -- --max-workers 2` | Aprovado, bundle Hermes ~2,7 MB                                                                                                              |
| `expo config --type introspect`                              | Aprovado para mods iOS e Android, SDK 58                                                                                                     |
| `npm run prisma:validate -w @omini/api`                      | Validação WASM aprovada, nove modelos                                                                                                        |
| `npm run check:migrations -w @omini/api`                     | Contrato incremental aprovado, nenhum SQL executado                                                                                          |
| Expo Doctor 1.21.6                                           | **18/20**. Schema remoto Expo: `fetch failed`; React Native Directory: resposta externa inesperada. Não foram desativadas essas verificações |

Os exports e a introspecção foram executados com `EXPO_NO_DOTENV=1`; os comandos offline usaram a matriz das dependências instaladas. No sandbox restrito, testes/checagens que criam sockets locais ou subprocessos inicialmente retornaram `EPERM`; foram repetidos com a permissão do ambiente e passaram. A instalação temporária do adaptador web foi removida com o `npm ci` final. Não mudou nenhuma versão já existente no lockfile.

Regressões adicionais: marca/restauração mantendo a navegação montada, liberação após fontes, falha de rede sem bloquear o app, botão em envio preservando nome acessível e impedindo reenvio. O fluxo de logout também verifica ausência de nome/e-mail anteriores, inclusive em elementos ocultos. Os testes anteriores de cadastro/login, perfis, expiração, rotação e revogação continuam aprovados.

A revisão no Chromium usa um adaptador React Native Web temporário fora dos manifests e do lockfile, somente para inspeção dos componentes reais. Não foi criado produto web/PWA. Foram capturados boas-vindas, home, categorias, busca, detalhes, painel e formulários. O formulário foi revisado em 320×568, 375×812, 430×932 e 768×1024, com campos sem overflow horizontal e submit alcançável por rolagem. Não há teclado nativo, Dynamic Island ou VoiceOver nessa revisão. O adaptador web apresentou sobreposição de telas inativas ao usar cliques por coordenadas entre abas; capturas seguintes usaram eventos programáticos. Isso não foi considerado aprovação de navegação por toque: a navegação foi verificada na suíte React Native e precisa ser repetida no aparelho.

## Atualização no Windows

Pare os processos anteriores de API e Expo com Ctrl+C. Em PowerShell:

```powershell
Set-Location C:\projetos\omini
git status --short
```

Se houver trabalho local, salve-o antes de trocar de branch. Não use reset destrutivo. Com o checkout limpo:

```powershell
git fetch origin
git switch feature/fase-2-2-visual
git pull --ff-only origin feature/fase-2-2-visual
npm ci
npm run typecheck
npm run lint
npm test
npm run build:api
npm run check:brand
npm run check:dependencies -w @omini/mobile
```

Preserve os `.env` locais e o banco já validado. **Não é necessário aplicar migrations, seed, grants ou gerar nova chave JWT para este redesign.** O guia de autenticação anterior continua válido. A instalação gera o cliente Prisma localmente sem migrar o banco.

No primeiro terminal:

```powershell
npm run dev:api
```

Em outro:

```powershell
Set-Location C:\projetos\omini
Invoke-RestMethod http://localhost:3000/api/health
ipconfig
npm run dev:mobile -- --clear
```

Mantenha em `apps/mobile/.env` o `EXPO_PUBLIC_API_URL=http://IPV4_DO_WINDOWS:3000/api` correto para sua rede. Não use localhost no iPhone. Não substitua `.env` pela cópia do exemplo. Se o IPv4 mudou, atualize somente o endereço público local e reinicie o Expo. API e Metro precisam estar permitidos na rede privada do Firewall.

## Roteiro no iPhone / Expo Go SDK 58

1. Atualize o Expo Go, use o mesmo Wi-Fi do Windows, habilite Rede Local e abra o QR pela Câmera. Primeiro confirme `http://IP_DO_PC:3000/api/health` no Safari.
2. Verifique marca, slogan, botões e rolagem na entrada. A restauração pode ser rápida; não há pausa forçada para exibir logo.
3. Sem login: explore cliente, oito categorias, busca com/sem resultado, filtro e retorno do perfil fictício. Confirme contratação desabilitada e avisos demonstrativos.
4. Entre no perfil demonstrativo, alterne prestador, veja abas, painel e disponibilidade local; volte ao cliente. Não deve aparecer nome/e-mail de uma conta anterior.
5. Cadastro: nome/e-mail/senha válidos, perfis cliente/prestador. Confirme erros de validação e feedback genérico. Não exponha senhas nas capturas.
6. Login: teste senha incorreta, depois a correta. No perfil, confirme seus dados e apenas os perfis habilitados. Teste alternância com a mesma conta; não crie contas duplicadas.
7. Feche/reabra o app e confirme persistência. Teste retorno do segundo plano. Se desligar a rede antes de abrir, confirme mensagem e possibilidade de explorar; reative a rede e tente restaurar.
8. Use o roteiro anterior de autenticação para expirar/revogar uma sessão de teste e confirme retorno ao login com mensagem, sem alterar políticas ou dados de produção.
9. Saia da conta. Reabra e confirme que ela não voltou. Confira as abas de cliente e prestador e o diagnóstico de conexão.
10. Teste com teclado aberto nos três campos, tela menor, tamanho de fonte aumentado, VoiceOver e redução de movimento. Confira labels, rolagem, rótulos das abas, home indicator e ausência de cortes na Dynamic Island. Repita em Android quando disponível.

## Validação da splash nativa

Para validar a abertura real, instale um build próprio. Alterar o plugin/asset exige reconstruir o binário; atualizar somente o JS não muda o launch screen. Não há build EAS disparado ou publicado nesta tarefa.

No Windows, uma opção é EAS Build (requer conta Expo, provisionamento iOS e, normalmente, Apple Developer). Se o projeto ainda não foi vinculado, faça o vínculo na sua conta e revise os arquivos gerados:

```powershell
npx eas-cli@latest login
npx eas-cli@latest build:configure --platform ios
```

Configure no `eas.json` gerado um perfil interno de validação, preservando quaisquer perfis existentes:

```json
{
  "build": {
    "preview": { "distribution": "internal" }
  }
}
```

Para distribuição interna iOS, registre o iPhone quando solicitado e gere o binário:

```powershell
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile preview
```

Instale pelo link do build. Encerre o processo do app e abra pelo ícone, repetindo com e sem sessão, com/sem rede, em aparência clara/escura. Confira a marca completa, slogan e continuidade sem flash branco; avalie separadamente o Android 12+ por causa da máscara do sistema. Cache de launch screen do iOS pode exigir reinstalação do build (a reinstalação pode afetar dados locais). Um preview standalone exige API HTTPS alcançável e `EXPO_PUBLIC_API_URL` definido no ambiente de build, conforme a política de segurança já existente; o HTTP local é permitido apenas no desenvolvimento. Para testar com Metro/HTTP de desenvolvimento, use um development build com `expo-dev-client` em preparação separada, ou macOS/Xcode. Não foi adicionada essa dependência ao redesign.

## Limitações e integração

Sem execução física em iOS/Android, build IPA/APK, teste de teclado/safe area nativos, conexão SQL Server ou validação real do launch screen nesta nuvem. Os testes HTTP usam a infraestrutura de teste existente, não o OminiDB. Valide a branch no iPhone antes de decidir a integração com a Fase 2.3. Nenhum merge automático foi feito.
