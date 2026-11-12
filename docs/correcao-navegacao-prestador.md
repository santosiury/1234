# Correção da navegação do prestador

Branch `feature/fase-2-3-ux-prestador`, continuação de `8dba1bd`. Esta correção substitui as abas do prestador por Stacks do Expo Router SDK 58. A experiência cliente continua usando suas abas existentes. Nenhuma dependência, endpoint, regra de publicação, autenticação, configuração de SecureStore, Prisma ou banco foi alterada. Nenhuma migration foi executada.

A [entrega posterior de navegação inferior](navegacao-inferior-avaliacoes-visuais.md) acrescenta uma barra de UI junto à Stack, conta em `/provider/account` e avaliações vazias. Ela mantém a correção descrita aqui; os resultados ao final deste documento registram o commit `c7f94a4`.

## Hierarquia atual

O painel é a raiz profissional. Cada seção tem uma Stack com sua página inicial e seu formulário:

```text
Stack raiz do aplicativo (existente)
├── /account                         Minha conta
└── /provider                        Stack; anchor: index
    ├── index                        Meu espaço profissional
    ├── account                      Minha conta no espaço profissional
    ├── services/                    Stack; anchor: index
    │   ├── index                    Meus serviços
    │   └── edit                     Adicionar/editar serviço (?id=...)
    ├── profile/                     Stack; anchor: index
    │   ├── index                    Meu perfil
    │   └── edit                     Editar perfil
    ├── areas/                       Stack; anchor: index
    │   ├── index                    Onde atendo
    │   └── edit                     Adicionar/editar área (?id=...)
    └── requests                     Área recebida já existente, ainda indisponível
```

As URLs das listas continuam `/provider/services` e `/provider/profile`; áreas ficam em `/provider/areas`. Os antigos caminhos `/provider-setup/{service,profile,area,areas}` continuam aceitos como redirecionamentos para os novos caminhos, mantendo `id` quando informado. O antigo layout usa `Slot` e a mesma proteção de interface; não contém outra Stack ou formulários paralelos.

`unstable_settings.anchor = "index"` define a origem no painel e em cada seção. Aberturas de formulários diretamente pelo painel usam `withAnchor: true` para incluir a seção intermediária. Links diretos com sessão restaurada também constroem essa hierarquia. O layout aguarda a restauração antes de decidir a navegação, evitando perder o destino durante o carregamento inicial.

Fluxos esperados tanto pelos botões quanto pelas ações de retorno da Stack:

- Painel → Meus serviços → Adicionar/editar → Salvar → Meus serviços → Voltar → Painel.
- Painel → Meu perfil → Editar → Salvar → Meu perfil → Voltar → Painel.
- Painel → Onde atendo → Adicionar/editar → Salvar → Onde atendo → Voltar → Painel.

A seção é a origem explícita de salvar/cancelar no formulário. Voltar nas listas usa o painel como destino. O caminho de continuação do primeiro serviço para atendimento e o acesso a atendimento pelo perfil **substituem a seção atual**, preservando o painel abaixo dela; por isso o retorno de Onde atendo não cai em outra seção.

O acesso a Minha conta fica na barra inferior profissional, sem duplicação no conteúdo. Solicitações recebidas continua acessível pelo painel, preservando apenas a tela já existente e sem implementar solicitações reais. A demonstração mantém seus serviços, perfil, disponibilidade e solicitações, com retorno explícito nas páginas internas.

## Acesso direto e modos

Para contas cujo perfil prestador está habilitado na sessão, **Meu espaço profissional** fica disponível na conta global (`/account`), inclusive quando o modo atual já é prestador. Na nova conta profissional (`/provider/account`), a ação Painel da barra oferece o retorno direto sem duplicar esse botão. A home autenticada também oferece esse CTA, com Minha conta como ação secundária.

Somente tocar nesse botão seleciona explicitamente o modo prestador e o catálogo real, e volta ao índice profissional existente ou abre esse índice. Não é preciso alternar para cliente e voltar. Navegar para Minha conta, restaurar uma sessão ou abrir uma URL não ativa um modo por conta própria. O guard existente continua respeitando a seleção de modo: uma conta em modo cliente deve usar o acesso explícito para entrar na área profissional. Usuários sem perfil prestador continuam usando o cadastro de perfil já existente.

## Rascunhos e confirmações

Ajuda, menus, pré-preenchimento, validação, confirmações de desativação/reativação e feedback de salvamento permanecem. A API continua sendo a fonte dos dados ao retornar às seções; apenas navegar não faz gravações.

`usePreventRemove` continua protegendo alterações e envios em andamento. O retorno ao painel ou à seção passa pela confirmação quando há rascunho. **Continuar editando** conserva os campos; **Descartar alterações** libera somente a navegação confirmada. O salvamento bem-sucedido libera a remoção e retorna à seção correspondente. A expiração de sessão mantém o encaminhamento existente para login.

Foi corrigido também o replay de uma ação de remoção que aponta para uma Stack ancestral. No SDK 58 instalado, `repeat()` injeta o identificador da tela atual como `source`; esse identificador não pertence à Stack pai e pode tornar um `POP_TO` inoperante. Para esse caso, após a confirmação, o helper desativa a prevenção e usa o `navigation.dispatch` público preservando o `source` original da ação. Retornos locais continuam usando `repeat()`. Não há temporizadores, reset global ou remoção da proteção de rascunhos.

## Arquivos alterados

- `apps/mobile/app/provider/_layout.tsx`: Stack profissional, espera de restauração, âncora e gestos habilitados.
- `apps/mobile/app/provider/services/{_layout,index,edit}.tsx` e `profile/{_layout,index,edit}.tsx`: seções aninhadas; antigos `services.tsx` e `profile.tsx` movidos para `index.tsx`.
- `apps/mobile/app/provider/areas/{_layout,index,edit}.tsx`: seção de atendimento na hierarquia profissional.
- `apps/mobile/app/provider/requests.tsx` e `src/demo/screens/Services.tsx`: retorno para o painel nas telas existentes.
- `apps/mobile/app/provider-setup/*`: compatibilidade dos endereços antigos sem Stack paralela.
- `apps/mobile/src/marketplace/ProviderScreens.tsx`: cabeçalhos de retorno, destinos canônicos e navegação entre seções.
- `apps/mobile/src/marketplace/provider/{FlowUI,Forms}.tsx`: saída do formulário, replay da navegação e destino de áreas.
- `apps/mobile/src/marketplace/provider/PrivateScreen.tsx`: proteção de interface reaproveitada pelas novas páginas e aliases.
- `apps/mobile/src/marketplace/provider/navigation.ts`: entrada explícita e compartilhada no espaço profissional.
- `apps/mobile/src/components/Profile.tsx` e `apps/mobile/app/index.tsx`: CTA direto e separação da conta.
- `apps/mobile/test/marketplace-navigation.test.tsx`, `test/support/routes.ts`, `scripts/check-routes.mjs`: testes e registro das Stacks/âncoras.
- `README.md`, `docs/fase-2-3-ux-prestador.md` e este documento: hierarquia e roteiros atualizados.

`app/_layout.tsx`, `app/account.tsx`, `app/provider/index.tsx`, `src/mode.tsx`, cliente, autenticação, contratos compartilhados, backend, `.env` e lockfile foram inspecionados/preservados.

## Atualizar em C:\projetos\omini

No PowerShell, pare o Metro antigo e confira o checkout. Preserve mudanças locais antes de trocar/atualizar a branch; não use reset ou limpeza forçada.

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

Mantenha os `.env` locais da Fase 2.3. Nenhuma migration, seed ou alteração de permissões é necessária. Em um terminal:

```powershell
npm run dev:api
```

Em outro terminal, na raiz:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
npm run dev:mobile -- --clear
```

No iPhone, mantenha `EXPO_PUBLIC_API_URL` com o IP do Windows na mesma rede Wi-Fi, nunca localhost. Use Expo Go compatível com SDK 58 e o QR exibido pelo Metro.

## Roteiro obrigatório no iPhone

1. Entre como prestador real. No painel, abra Meus serviços. Volte pelo botão e repita usando o gesto lateral do iPhone. Ambos devem retornar ao painel, sem passar por Minha conta.
2. Repita com Meu perfil e Onde atendo. Abra Onde atendo pelo perfil e confirme que o próximo retorno também chega ao painel.
3. Adicione/edite um serviço, salve e confira a lista atualizada. O próximo gesto deve voltar ao painel. Repita com perfil e área, sem perder os dados.
4. Pelo fluxo do primeiro serviço, use **Continuar: onde atendo**, salve a área e volte por gesto. O destino deve ser o painel.
5. Abra Minha conta a partir do painel e do perfil. Use **Painel** na barra sem mudar para cliente; confira o painel. Na conta global, o acesso continua chamado **Meu espaço profissional**. Repita pela home e depois de alternar para cliente, voltando pelo CTA explícito.
6. Modifique um formulário. Tente sair pelo botão e pelo gesto nativo: **Continuar editando** deve conservar o rascunho; **Descartar alterações** deve respeitar o destino confirmado. Durante um envio, tente voltar e confira o bloqueio. Não encerre o processo para testar rascunhos: sua persistência continua somente em memória.
7. Com o modo prestador selecionado, reabra links das listas e dos formulários, inclusive após restaurar a sessão. Confira formulário → seção → painel. Links não devem ativar outro modo silenciosamente.
8. Confira Ajuda, teclado, safe areas, tamanho de fonte ampliado, VoiceOver e alvos de toque. Repita os testes de desativação/reativação com registros de teste e confira o catálogo real com outra conta cliente. A demonstração deve permanecer separada.

## Resultados desta correção (`c7f94a4`)

| Verificação                 | Resultado                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `npm run typecheck`         | Aprovado em API, mobile e shared.                                                             |
| `npm run lint`              | Aprovado.                                                                                     |
| `npm test`                  | 101 testes aprovados: 41 API + 60 mobile; os 81 anteriores preservados e 20 novas regressões. |
| `npm run check:routes`      | 30 arquivos, abas do cliente e âncoras das Stacks profissionais aprovados.                    |
| `npm run check:brand`       | Aprovado, assets preservados.                                                                 |
| `npm run check:secrets`     | Aprovado após registrar as movimentações de arquivos no índice do Git.                        |
| Metro / Expo SDK 58         | Startup aprovado; rotas tipadas geradas pelo CLI.                                             |
| Export iOS                  | Bundle Hermes e assets gerados com sucesso em `/tmp/omini-provider-stack-ios`.                |
| Export Android              | Bundle Hermes e assets gerados com sucesso em `/tmp/omini-provider-stack-android`.            |
| Chromium / React Native Web | Nove fluxos com sessão/API fictícias aprovados, sem erros JavaScript registrados.             |

Os 20 novos testes abrangem ida/volta das três seções com dados preservados, salvar e retornar em cada formulário, acesso direto pela conta no mesmo modo, home e alternância explícita de modos, saída da demonstração pelo CTA profissional, seis links canônicos abertos após restauração sem histórico, quatro aliases antigos (incluindo IDs pré-preenchidos), rascunho protegido por `GO_BACK` e remoção da seção, continuação serviço → área e atendimento aberto a partir do perfil. Os cenários anteriores de catálogo, sessão expirada, cadastro, edição e desativação/reativação continuam aprovados. Apenas uma expectativa de endereço mudou de `/provider-setup/areas` para `/provider/areas`, acompanhando a nova rota canônica.

A revisão Chromium usou uma cópia temporária fora do repositório, com a mesma UI e navegação, um `SessionManager` de teste e respostas HTTP controladas. Exercitou os três fluxos de salvar → seção → painel, reentrada pela conta e home, rascunho com tentativa de retorno e descarte confirmado, além de abertura direta dos três formulários → seção → painel. As três gravações nessa revisão foram apenas mutações em fixtures: um serviço, um perfil e uma área, sem conexão real com a API ou SQL Server. Nenhuma dependência web ou fixture de sessão foi adicionada à branch.

**Pendente: validação física no iPhone.** Nem Jest, nem as ações `GO_BACK` simuladas, nem Chromium comprovam o reconhecedor do gesto lateral do iOS, suas animações, VoiceOver ou comportamento do teclado nativo. Os exports validam empacotamento, não são builds IPA/APK e não executam em aparelho. Não houve teste em iPhone, simulador iOS ou SQL Server real nesta correção. Siga o roteiro físico acima antes de considerar esses pontos aprovados.

Os testes HTTP e a revisão Chromium precisaram executar fora do sandbox para abrir portas locais. Nenhuma verificação de segurança foi retirada. O scanner de segredos foi repetido após registrar as renomeações no índice, pois sua listagem do Git ainda incluía os nomes antigos removidos enquanto essas movimentações não estavam staged.
