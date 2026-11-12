# Barra profissional e preparação visual das avaliações

Branch `feature/fase-2-3-ux-prestador`, baseada em `c7f94a4`. O painel e seus três cards aprovados — Meu perfil, Meus serviços e Onde atendo — mantêm conteúdo, dados, status e ações. Esta entrega acrescenta navegação inferior e apresentação vazia de avaliações, sem avançar solicitações ou avaliações funcionais.

## Barra e hierarquia

`ProviderNavigation` é um componente reutilizável de UI, irmão da Stack no layout profissional. Não é um navegador Tabs e não cria outra árvore de navegação. A área da Stack ocupa o espaço restante; a barra usa sua própria altura no fluxo do layout, sem posição absoluta ou sobreposição sobre o conteúdo rolável.

| Destino      | Rota                 | Seleção e retorno                                                                                                |
| ------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Painel       | `/provider`          | Selecionado também nas seções de configuração: serviços, perfil e áreas. Tocar nele retorna à raiz profissional. |
| Solicitações | `/provider/requests` | Abre a tela já existente, ainda sem solicitações reais. Voltar chega ao painel.                                  |
| Minha conta  | `/provider/account`  | Reutiliza a interface da conta dentro da Stack profissional. Voltar ou tocar Painel chega à raiz profissional.   |

A Stack conserva `anchor: "index"`, seções aninhadas e os caminhos canônicos/aliases da correção anterior. Pelo painel, solicitações/conta são empilhadas. Ao trocar de uma seção para outra pela barra, a seção atual é substituída, mantendo o painel abaixo dela. Repetir o destino já aberto não empilha duplicatas. Assim, conta → solicitações → voltar e solicitações → conta → voltar terminam no painel, sem usar Minha conta como origem de uma página profissional.

A rota global `/account` permanece para entrada pela home/experiência cliente, com seu acesso direto **Meu espaço profissional**. A conta dentro do espaço profissional não repete esse botão: o acesso já está na barra. Na demonstração autenticada, **Abrir meu cadastro real** mantém explícita a mudança de catálogo; tocar Painel na barra conserva a demonstração. Nenhuma navegação da barra muda o modo ou a origem do catálogo automaticamente.

Os antigos links Minha conta/Solicitações no final do painel, o acesso duplicado à conta no perfil e os links **Ver meu painel** após salvamentos foram removidos do conteúdo. **Continuar: onde atendo** permanece no primeiro cadastro, pois orienta o próximo passo. O retorno ao painel passa pela barra. A demonstração também usa a barra para conta e solicitações, preservando disponibilidade, serviços e os acessos de sessão existentes.

## Acessibilidade e espaço de tela

- Ícones Ionicons, rótulos sempre visíveis e seleção com fundo verde claro, contorno e tipografia, além de estado acessível `selected`. Ícones não são anunciados separadamente.
- Alvos de pelo menos 44 pontos; as ações da barra têm altura mínima de 64 pontos e crescem com o texto.
- Safe area inferior/lateral aplicada com `react-native-safe-area-context`, deixando o home indicator abaixo das ações.
- Sem altura fixa, limite de linhas ou redução forçada da escala do texto. A partir de `fontScale >= 1.6`, os destinos passam a linhas inteiras com ícone e rótulo, continuando fixos na parte inferior, para preservar legibilidade em telas estreitas.
- Barra oculta nas três rotas de formulário terminadas em `/edit`. O formulário usa a tela disponível e conserva a proteção de rascunhos/envios já existente. A barra retorna após salvar ou cancelar.
- Botões de retorno, Ajuda, confirmações e gestos da Stack permanecem. A barra não substitui nem desativa `usePreventRemove`.

## Avaliações: somente apresentação

`ReviewsSection` é usado no perfil profissional próprio e no detalhe do catálogo real. Ambos exibem **Ainda não há avaliações.**, sem média, quantidade, estrelas preenchidas ou comentários de demonstração. No perfil próprio, a explicação é **Depois de realizar serviços pelo Omini, seus clientes poderão avaliar seu atendimento.** No público, a frase é ajustada à perspectiva de quem consulta o profissional.

O componente aceita estados indisponível/vazio, carregamento, erro e um contrato visual futuro com média, quantidade e comentários recebidos/enviados. Não calcula reputação, não faz fetch e não persiste nada. Comentários enviados só são apresentados na variante do proprietário; isso não substitui o futuro controle de acesso no servidor. Os dados numéricos usados para testar esse contrato existem apenas em fixtures dos testes. Os pontos de uso reais não fornecem dados de avaliações.

O plano técnico está em [Avaliações bidirecionais](avaliacoes-bidirecionais.md). Ele depende da conclusão real das solicitações na Fase 2.4. Nenhuma tabela, migration, endpoint ou regra de avaliação é implementada agora.

## Arquivos importantes

- `apps/mobile/src/marketplace/provider/ProviderNavigation.tsx`: barra, seleção, layout adaptativo e navegação pelos destinos existentes.
- `apps/mobile/app/provider/_layout.tsx`: integração da barra junto à Stack preservada.
- `apps/mobile/app/provider/account.tsx`: conta dentro da hierarquia profissional.
- `apps/mobile/src/components/Profile.tsx`: retorno explícito ao painel e remoção do CTA redundante na conta profissional real.
- `apps/mobile/src/marketplace/ProviderScreens.tsx`: remoção de navegação duplicada e seção vazia de avaliações.
- `apps/mobile/src/demo/screens/Dashboard.tsx`: conta/solicitações acessíveis pela barra, sem links duplicados.
- `apps/mobile/src/components/ReviewsSection.tsx`: apresentação e contrato visual local, sem integração de dados.
- `apps/mobile/src/marketplace/CatalogScreens.tsx`: avaliações vazias no perfil público real.
- `apps/mobile/test/marketplace-navigation.test.tsx`, `test/reviews-section.test.tsx`, `test/support/routes.ts`: regressões e novas rotas.
- `scripts/check-routes.mjs`: inclusão da conta profissional; verificação de Stacks/âncoras e abas do cliente mantida.
- `README.md`, este guia, `docs/correcao-navegacao-prestador.md` e `docs/avaliacoes-bidirecionais.md`: execução, hierarquia e proposta futura.

Backend, Prisma, migrations, permissões SQL, contratos compartilhados, autenticação, SecureStore, estado de modos, API de catálogo, hooks de dados e dependências/lockfile não foram alterados. Nenhuma migration ou conexão real ao SQL Server foi executada nesta entrega.

## Atualizar e validar no Windows/iPhone

Pare o Metro antigo. Confira alterações locais antes de atualizar; preserve seus `.env` e não use reset/limpeza forçada.

```powershell
Set-Location C:\projetos\omini
git status
git fetch origin
git switch feature/fase-2-3-ux-prestador
git pull --ff-only origin feature/fase-2-3-ux-prestador
npm ci
npm run typecheck
npm run lint
npm test
npm run check:routes
```

Nenhuma migration, seed ou concessão de permissões é necessária. No primeiro terminal, na raiz:

```powershell
npm run dev:api
```

No segundo terminal:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
npm run dev:mobile -- --clear
```

Use Expo Go compatível com SDK 58, o QR do Metro e a mesma rede Wi-Fi. `EXPO_PUBLIC_API_URL` deve usar o IP do Windows com `/api`, nunca localhost no iPhone.

Roteiro físico:

1. Entre como prestador real. Confira os três cards intactos e uma única barra com Painel/Solicitações/Minha conta. Role até o fim: a barra deve continuar fixa sem cobrir os cards.
2. Abra Solicitações e confira a seleção. Vá para Minha conta e volte por botão/gesto: deve chegar ao painel. Repita a sequência no sentido inverso e toque várias vezes no item já selecionado; não deve criar telas duplicadas.
3. Abra cada seção profissional e volte ao painel. Confira seleção Painel dentro de serviços, perfil e áreas. Entre na conta por sua rota profissional e confirme retorno direto ao painel, sem alternar modos.
4. Abra os três formulários. A barra deve desaparecer; teclado, salvar/cancelar e ajuda devem continuar acessíveis. Modifique campos e tente voltar: continuar editando conserva o rascunho e descartar exige confirmação. Após salvar, confira a seção, o feedback e o retorno da barra.
5. Faça o primeiro cadastro completo usando **Continuar: onde atendo**. Salve a área e use Painel na barra. Nenhum link duplicado de retorno deve aparecer junto ao feedback.
6. No perfil próprio e, com outra conta cliente, no perfil público real, confira a seção Avaliações vazia. Não deve existir média, número de avaliações, estrelas preenchidas ou botão de envio.
7. Amplie o texto em Ajustes → Acessibilidade e teste em tela estreita. Confira todos os rótulos, alvos, seleção, rolagem e safe area/home indicator, inclusive a disposição vertical da barra em escala maior. Com VoiceOver, percorra os três botões e seu estado selecionado, Ajuda, campos e retorno de foco dos modais.
8. Confira logout/restauração, alternância cliente/prestador e demonstração separada. No demo autenticado, **Abrir meu cadastro real** deve ser uma ação explícita. Use apenas registros de teste ao confirmar operações reais de ativação/desativação.

## Resultados e limites

| Verificação                 | Resultado                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`         | Aprovado em API, mobile e shared.                                                                                                                                                           |
| `npm run lint`              | Aprovado.                                                                                                                                                                                   |
| `npm test`                  | 111 testes aprovados: 41 API + 70 mobile; preservadas as 101 regressões anteriores e acrescentados 10 cenários.                                                                             |
| `npm run check:routes`      | 31 arquivos, abas do cliente e Stacks/âncoras profissionais aprovados.                                                                                                                      |
| `npm run check:brand`       | Aprovado, sem alteração nos assets/identidade.                                                                                                                                              |
| `npm run check:secrets`     | Sem segredos detectados nos arquivos analisados.                                                                                                                                            |
| Exports iOS/Android         | Bundles Hermes e assets gerados com sucesso em `/tmp/omini-bottom-reviews-ios` e `/tmp/omini-bottom-reviews-android`, com `EXPO_OFFLINE=1` e `EXPO_NO_DOTENV=1`.                            |
| Chromium / React Native Web | 72 casos: 9 telas × larguras 320/375/390/430 px × fontes 100%/200%. Sem estouro horizontal nos textos/controles verificados, alvos de toque abaixo de 44 px ou conteúdo coberto pela barra. |

As novas regressões exercitam barra única/rotulada, seleção, cards aprovados, retorno pelo Painel dentro de uma seção, trocas conta/solicitações e retorno `GO_BACK`, repetição do destino sem duplicar histórico, ocultação/restauração nos três formulários, escala de fonte ampliada, link direto restaurado da conta profissional, avaliações vazias no perfil próprio/público sem chamadas de reviews, estados de carregamento/erro e contrato visual futuro com separação de comentários enviados. Nos cenários anteriores, os acessos redundantes foram substituídos pelos destinos da barra, conservando as mesmas verificações de dados, sessão, navegação e demonstração.

O teste visual foi feito em **cópia temporária fora do repositório**, com sessão/API fictícias, React Native Web e resolução de React configurados apenas nessa cópia. Foram simulados insets de 47 px no topo e 34 px na base; fontes e line heights foram ampliadas via DOM e a escala de dimensões foi informada ao componente para exercitar a disposição adaptativa. Foram medidas caixas/glifos, alvos de toque, separação entre área rolável e barra e posição da barra antes/depois da rolagem; nos formulários, o botão Cancelar permaneceu alcançável por rolagem. Telas verificadas: painel, serviços, perfil, áreas, solicitações, conta e os três formulários. A revisão também exercitou conta a partir de solicitações e retorno ao painel. Nenhuma requisição de escrita foi feita nessa revisão.

**Não houve execução desta entrega em iPhone, simulador iOS ou SQL Server real.** Testes com `GO_BACK` e navegador não comprovam os gestos, teclado, Dynamic Type, VoiceOver ou insets nativos. Os bundles são validação de empacotamento, não builds IPA/APK nem teste em aparelho. O roteiro físico acima permanece pendente. A API foi testada com repositórios controlados/validações estáticas, sem migrations ou conexão ao OminiDB real. Nenhum pacote ou mudança de sessão do harness temporário faz parte da branch.

Os testes HTTP e o navegador utilizaram permissão de execução para abrir portas locais. O scanner de segredos foi executado com acesso ao subprocesso Git; nenhuma verificação foi removida ou enfraquecida.
