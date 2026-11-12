# Fase 2.3 — Experiência do prestador

Branch: `feature/fase-2-3-ux-prestador`, baseada em `ddf36970abbd9e09059565c51ccedcd251a7d258`.

Esta entrega reorganiza o mobile. Reutiliza os endpoints e contratos da Fase 2.3, sem novas dependências, migrations, seed, permissões SQL ou mudanças de autenticação. O backend, Prisma, JWT, SecureStore e as regras de publicação permanecem iguais à base validada pelo responsável no SQL Server e no iPhone. Nenhuma migration ou conexão real ao banco foi executada nesta revisão.

A [correção posterior da navegação](correcao-navegacao-prestador.md), baseada em `8dba1bd`, organiza o prestador em Stacks e acrescenta acessos diretos pela conta e home. Consulte esse documento para os testes e o roteiro atuais. Os resultados de verificação no final deste guia registram a entrega visual original.

## Organização e primeiro cadastro

| Tela                    | Acesso e função                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Meu espaço profissional | Raiz da Stack profissional: três etapas, estado real e uma próxima ação em destaque.                               |
| Meu perfil              | Seção Perfil: resumo profissional, **Editar meu perfil profissional**, **Onde atendo** e **Minha conta**.          |
| Meus serviços           | Seção Serviços: **Adicionar serviço**, lista compacta e **Gerenciar** em cada item.                                |
| Onde atendo             | Pelo painel ou perfil: lista das cidades/bairros e **Adicionar área**.                                             |
| Formulários             | Rotas `/provider/profile/edit`, `/provider/services/edit` e `/provider/areas/edit`, dentro das respectivas Stacks. |
| Minha conta             | Rota `/account`: dados da conta, modos disponíveis, saída e teste de conexão.                                      |

1. Entre na conta e selecione o modo prestador. Se necessário, adicione esse perfil pela área da conta, usando o fluxo já existente.
2. Confira **Meu perfil**. O nome profissional inicialmente aproveita o nome da conta. A apresentação é opcional: não há uma nova exigência de preenchê-la para publicar.
3. **Adicionar serviço** abre apenas categoria, nome do serviço e descrição opcional. Exemplo: Instalação de tomadas. **Salvar serviço** volta à lista, consulta os dados e mostra **Serviço salvo.**
4. Quando ainda não há área ativa, o link **Continuar: onde atendo** conduz ao formulário ou à lista de áreas existentes. Preencha cidade/UF e, se desejar, bairro. A instrução é: **Se você atende toda a cidade, deixe o bairro em branco.**
5. Ao salvar a área, o app volta à lista com confirmação. **Ver meu painel** permite conferir as etapas e a publicação.

As etapas são calculadas a partir de `GET /api/provider/me`, sem um indicador fictício de onboarding. **Meu perfil** está concluído quando existe um nome válido; **Meus serviços**, quando há serviço ativo em categoria ativa; **Onde atendo**, quando existe área ativa. A mensagem **Seu cadastro está visível para clientes** respeita perfil ativo + serviço/categoria ativos + área ativa. A API existente também exige conta ativa e aplica sua proteção de acesso. Se tudo estiver pronto, não é exibido outro CTA de configuração em destaque.

## Gerenciamento, retorno e ajuda

Cada serviço mostra nome, categoria, texto **Ativo/Inativo** e uma única ação **Gerenciar**. O menu oferece **Editar serviço**, **Desativar/Reativar serviço** e **Cancelar**. Áreas usam a mesma interação; o bairro identifica locais na mesma cidade. As mudanças de visibilidade, inclusive reativação, exigem confirmação. Apenas confirmar envia o PATCH existente; cancelar não altera dados. Desativar mantém o registro salvo.

A edição abre um formulário preenchido. Voltar, cancelar ou sair pela navegação com alterações abre **Sair sem salvar?**, com **Continuar editando** e **Descartar alterações**. O guard usa a API `usePreventRemove` do Expo Router SDK 58, abrangendo ações de navegação, retorno e gestos compatíveis. Durante o envio, bloqueia saída e submissões duplicadas. Falhas mantêm o formulário e apresentam mensagem de erro; sessão expirada continua seguindo o tratamento existente de autenticação.

O rascunho fica somente em memória. Encerrar o processo do aplicativo ou recarregar o JavaScript pode perdê-lo; esta entrega não cria persistência adicional nem altera SecureStore. Os avisos de sucesso também são transitórios e isolados por usuário, sem reaparecer após troca de conta.

**Ajuda** permanece no cabeçalho do painel, listas, resumo profissional e formulários, mesmo após completar o cadastro. O ícone de interrogação tem rótulo acessível. O conteúdo depende da tela: cadastro, edição, desativação, reativação ou preenchimento de cidade/bairro. O modal permite rolagem e fechamento por **Entendi**, sem tutorial obrigatório. Modais direcionam o foco nativo ao título e devolvem-no ao acionador quando aplicável.

## Interface e acessibilidade

Mantidos preto/branco/verde-lima, Inter e assets existentes. Botões e ações têm alvos mínimos de 44 pontos, textos sem limite de linhas e altura flexível. Cabeçalhos permitem quebra do conjunto marca/ajuda; categorias permitem múltiplas linhas. Na experiência cliente, os rótulos das abas usam um componente sem a truncagem de uma linha do rótulo padrão do SDK, preservando ampliação de fonte e a altura adaptativa da barra.

As telas reutilizam safe areas, rolagem e ajuste de teclado do `ScreenContainer`. Status incluem texto e símbolo; campos têm rótulos acessíveis e instruções. Confirmações usam modal de tela inteira com safe area e rolagem para fontes ampliadas. Verifique foco, leitura, teclado e gestos no aparelho conforme o roteiro abaixo.

## Arquivos importantes

- `apps/mobile/src/marketplace/ProviderScreens.tsx`: painel, perfil, serviços e áreas.
- `apps/mobile/src/marketplace/provider/Forms.tsx`: formulários dedicados e pré-preenchimento.
- `apps/mobile/src/marketplace/provider/FlowUI.tsx`: etapas, ajuda, modal e proteção ao sair.
- `apps/mobile/src/marketplace/provider/ManagedItem.tsx`: item compacto, menu e confirmação.
- `apps/mobile/src/marketplace/provider/feedback.tsx`: avisos transitórios por usuário.
- `apps/mobile/app/provider/{services,profile,areas}/*`: Stacks, formulários e listas. `app/provider-setup/*` mantém os endereços antigos como aliases.
- `apps/mobile/app/_layout.tsx`, `app/provider/profile/index.tsx`, `app/account.tsx`: integração das novas telas e avisos.
- `apps/mobile/src/components/{Profile,ui,TabIcon}.tsx`: separação da conta, cabeçalho, ação desabilitada e rótulos de abas.
- `apps/mobile/test/{marketplace-navigation,auth-navigation}.test.tsx`, `test/support/routes.ts`: navegação e regressões.
- `scripts/check-routes.mjs`, `.github/workflows/quality.yml`, `README.md`: novas rotas, branch no CI e documentação.

## Atualizar no Windows

No PowerShell, pare o Metro antigo com Ctrl+C e confira `git status` antes de trocar de branch. Preserve mudanças locais e os `.env` existentes; não use reset ou limpeza forçada.

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
npm run check:brand
```

Se a branch ainda não existir localmente, `git switch` normalmente a cria rastreando o remoto. Caso não consiga inferir o remoto, use `git switch --track -c feature/fase-2-3-ux-prestador origin/feature/fase-2-3-ux-prestador`. Não execute esse segundo comando se a branch local já existir.

Nenhum comando de migration, seed ou concessão de permissões é necessário nesta entrega. Mantenha `apps/api/.env` e `apps/mobile/.env` já configurados na Fase 2.3. No mobile, `EXPO_PUBLIC_API_URL` deve apontar para `http://IP_DO_WINDOWS:3000/api` em desenvolvimento, nunca para localhost no iPhone.

Terminal 1, na raiz:

```powershell
npm run dev:api
```

Terminal 2, na raiz:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
npm run dev:mobile -- --clear
```

Abra o QR pela Câmera no Expo Go compatível com SDK 58. Use a mesma rede Wi-Fi e permita rede local. Se a API não responder no Safari do iPhone em `http://IP_DO_WINDOWS:3000/api/health`, confira IP/firewall antes de testar os formulários.

## Roteiro no iPhone físico

1. Entre com uma conta de teste e abra o modo prestador real. Confira título, três etapas e próxima ação. Abra **Ajuda**, feche e verifique o retorno do foco com VoiceOver.
2. Abra **Meu perfil** → **Editar meu perfil profissional**. Confira pré-preenchimento; altere nome/apresentação, volte e escolha **Continuar editando**. Salve e confirme a atualização. Entre em **Minha conta**: e-mail/saída ficam separados do cadastro profissional.
3. Em **Meus serviços**, confira que nenhum formulário aparece na listagem. Adicione um serviço em categoria disponível, teste validação sem título e depois salve. Confira confirmação, lista e ação para continuar para atendimento quando aplicável.
4. Informe uma cidade/UF sem bairro: deve aparecer **Toda a cidade**. Adicione outra área com bairro. Edite uma delas via **Gerenciar** e confira pré-preenchimento e confirmação de sucesso.
5. Volte ao painel: com as condições ativas, confira **Seu cadastro está visível para clientes**. Use outra conta cliente para consultar o profissional no catálogo real; confira que a demonstração continua separada.
6. Em um serviço, **Gerenciar** → **Desativar serviço**. Cancele: nada deve mudar. Repita e confirme: o registro permanece na lista como inativo. Reative com confirmação e confira o catálogo novamente. Repita o gerenciamento em uma área.
7. Modifique um formulário e use o gesto de voltar: não deve descartar silenciosamente. Verifique **Descartar alterações**, cancelamento sem edição e ajuda sem perder o rascunho.
8. Desligue temporariamente a rede: confira erro/repetição e preservação do rascunho ao falhar um envio. Reconecte e salve uma única vez. Saia da conta e entre novamente para conferir sessão, isolamento dos dados e alterações persistidas pela API existente.
9. Em Ajustes → Acessibilidade, aumente o tamanho do texto. Confira telas estreitas e todas as ações, ajuda, menus e confirmações com rolagem. Com VoiceOver, percorra título, rótulos dos campos, status, categorias, salvar/cancelar e retorno de foco. Abra o teclado no último campo e confirme que salvar permanece alcançável.

Use registros de teste ao confirmar alterações de visibilidade: essas operações continuam reais no seu banco. Esta revisão não executou essas operações no SQL Server de produção.

## Verificação da entrega visual original (`bed62c7` / `8dba1bd`)

Validação em 11/11/2026, Node 24.22.1 / npm 11.9.0:

| Verificação                             | Resultado                                                                                                                                                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                     | Aprovado nos workspaces API, mobile e shared.                                                                                                                                                               |
| `npm run lint`                          | Aprovado.                                                                                                                                                                                                   |
| `npm test`                              | 81 testes aprovados: 41 API + 40 mobile, preservando os 72 anteriores e adicionando 9 cenários de UX.                                                                                                       |
| `npm run build:api`                     | Aprovado; fontes do backend não alteradas.                                                                                                                                                                  |
| `npm run check:routes`                  | 23 arquivos de rota e os dois layouts de abas aprovados.                                                                                                                                                    |
| `npm run check:brand`                   | Assets e configuração de marca aprovados.                                                                                                                                                                   |
| `npm run check:secrets`                 | Aprovado; sem `.env` ou segredos detectados nos arquivos analisados.                                                                                                                                        |
| `EXPO_OFFLINE=1 ... check:dependencies` | Matriz instalada do SDK 58 alinhada; o CLI ressalva que a verificação offline não consulta a matriz remota.                                                                                                 |
| Exports iOS/Android                     | Bundles Hermes e assets gerados com sucesso, sem ler `.env` (`EXPO_NO_DOTENV=1`). Não são APK/IPA nem teste em dispositivo.                                                                                 |
| Layout Chromium / React Native Web      | 80 combinações: 10 telas × 4 larguras (320, 375, 390, 430 px) × fontes 100%/200%, sem estouro horizontal detectado nos textos/controles verificados. Alvos das ações verificadas têm pelo menos 44 × 44 px. |

Os testes novos exercitam: checklist e categorias inativas; ajuda antes/depois do cadastro; abertura/cancelamento/descarte de rascunho; cancelamento de confirmação sem PATCH; edição de área/cidade inteira e separação da conta; carregamento/erro/repetição com rascunho mantido; bloqueio de submissão duplicada/saída durante envio; proteção das novas rotas; primeiro serviço → atendimento → painel concluído. Os cenários anteriores de edição, desativação/reativação, catálogo real/demonstrativo, sessão expirada e isolamento entre contas continuam aprovados.

A revisão de layout utilizou **uma cópia temporária fora do Git**, com a mesma UI, sessão e respostas HTTP fictícias, React Native Web apenas nessa cópia e resolução única de React. Fontes e line heights foram ampliados via DOM; a escala informada às dimensões também foi simulada para exercitar a altura adaptativa das abas. Foram medidas caixas dos controles, glifos de textos e alvos de toque, com inspeção visual de capturas. Telas verificadas: painel, serviços, gerenciamento, confirmação, ajuda, formulário de serviço, perfil, formulário de perfil, áreas e formulário de área. Nenhuma dependência web, fixture de sessão ou mudança de autenticação dessa cópia faz parte da branch.

As medições web não reproduzem Dynamic Type, layout Yoga, teclado, safe areas, gestos ou VoiceOver nativos. **Não houve execução desta revisão em iPhone, simulador iOS ou SQL Server real.** A validação física dessa nova UI continua pendente conforme o roteiro acima. Os testes da API utilizam repositórios controlados, validações estáticas de SQL e mocks de Prisma, sem aplicar migrations. A aprovação anterior do ambiente real da Fase 2.3 foi informada pelo responsável; não é apresentada como teste executado por esta revisão.

O sandbox bloqueou inicialmente a criação de subprocessos usada pelo scanner de segredos e a abertura de portas dos testes HTTP. Essas verificações foram repetidas com a permissão de execução apropriada e aprovadas. Nenhuma verificação de segurança foi removida ou enfraquecida.
