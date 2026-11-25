# Fase 2.6 — diagnóstico da versão no iPhone e atualização pelo GitHub

## Receber a publicação autorizada no Windows

O responsável autorizou commit e push exclusivamente para `feature/fase-2-6`. A publicação inclui os 19 arquivos listados neste relatório, sem merge, force push, alteração de dependências, backend ou banco. O procedimento recomendado agora é receber a correção pelo GitHub; o patch abaixo é apenas o registro da alternativa preparada antes dessa autorização.

Com o checkout Windows na branch `feature/fase-2-6` e working tree limpa, executar:

```powershell
Set-Location C:\projetos\omini
git branch --show-current
git status --short
git pull --ff-only origin feature/fase-2-6
if ($LASTEXITCODE -ne 0) { throw "Pare: atualizacao nao concluida. Preserve suas alteracoes; nao use reset ou force." }
npm.cmd run check:mobile-runtime
if ($LASTEXITCODE -ne 0) { throw "Pare: revisao mobile nao conferida." }
npm.cmd run dev:mobile -- --clear --port 8082
```

Abrir o QR recém-gerado no Expo Go e conferir `Revisão mobile: 2.6-mobile-r2` em Minha conta → Conexão com a API. O fingerprint esperado das fontes é `56ac3a5d4ef458af`. Depois do pull, não aplicar novamente o patch antigo. Se houver alterações locais, divergência remota ou conflito, parar antes de substituir arquivos. Os testes físicos e a eventual investigação de HTTP 503 continuam pendentes no ambiente de testes.

## Evidências e causas

O responsável confirmou no Windows `feature/fase-2-6`, HEAD `b4439bc`. Esse commit contém literalmente o aviso “O cancelamento após o início não está disponível nesta etapa”, o formulário legado de motivo opcional e as avaliações no formato “nota de 5”. As melhorias mobile anteriores estavam somente no working tree deste chat, incluindo arquivos novos não rastreados; nenhum commit/push delas havia sido autorizado ou realizado.

A causa comprovada da entrega divergente era a ausência dessas alterações na versão publicada. Estar na branch correta não transfere alterações não publicadas da nuvem para o Windows; `git pull` não resolveria isso antes da publicação. Com a autorização atual, o envio desses arquivos para a mesma branch permite recebê-los pelo pull acima. Não há evidência de outra implementação ativa escondida pelas rotas nem de que o cache do Metro seja a causa primária. O processo/QR concreto aberto no iPhone só poderá ser confirmado pelo responsável, após atualizar os arquivos e conferir o identificador do bundle.

Cancelamento tem duas questões distintas: a versão antiga envia o body legado, incompatível com novos cancelamentos pós-aceite; a mensagem de indisponibilidade não identifica, sozinha, a causa técnica nem comprova HTTP 503. `MarketplaceHttp` usa esse texto como fallback para erros HTTP sem código reconhecido. No backend, `RequestsService.run` também traduz exceções inesperadas de persistência para 503 `REQUESTS_UNAVAILABLE`. Assim, não é possível afirmar que um erro real seja senha, JWT, migration, permissão, client Prisma ou conexão sem evidência do servidor. Nada disso foi alterado ou testado em SQL nesta tarefa.

Não há `.env` mobile local neste checkout na nuvem. Portanto, ele não informa o valor efetivamente carregado no Windows. Auth, catálogo e solicitações usam `EXPO_PUBLIC_API_URL`; o novo diagnóstico de desenvolvimento mostra a origem pública válida com `/api`, sem userinfo, query, fragmento, tokens ou caminhos arbitrários. Loopback é sinalizado porque no iPhone ele aponta para o próprio aparelho. O sucesso de `/health` agora esclarece que não valida banco ou cancelamento.

## Componentes realmente usados

| Rota/fluxo                                          | Componentes ativos                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/client/requests/[id]` e `/provider/requests/[id]` | `RequestDetailScreen` em `src/requests/screens.tsx` → `CancellationDialog` → `RequestsApi.cancel` |
| `/professional/[id]`, catálogo real                 | `CatalogDetail` → `ProviderReviews` → `ReviewsSection`                                            |
| `/provider/profile`, perfil real autenticado        | `ProviderProfileOverview` → `ProviderReviews` → `ReviewsSection`                                  |
| Solicitação concluída                               | `RequestDetailScreen` → `RequestReviewPanel`                                                      |
| `/service-review/[id]`                              | `ReviewScreen`                                                                                    |
| `/account` e `/provider/account`                    | `Profile`, com diagnóstico de revisão somente em desenvolvimento                                  |

A demonstração continua separada do catálogo real; nenhuma nota demonstrativa foi introduzida nos dados reais. Não há rota alternativa de avaliações reais com o formato antigo. A pesquisa de “de 5” deve considerar palavra/frase completa: “Limite de 50 registros” não é uma nota de avaliação.

## Correções e identificação

As correções anteriores foram preservadas: nota dinâmica com ⭐, contagem e média do backend, comentários/datas/autor, estado vazio sem estrelas; cancelamento por motivos compartilhados, participante original da API, `allowedActions`, contexto de execução obrigatório, revisão e confirmação explícita, versão/chave/payload estáveis nos retries, histórico e estado CANCELLED após resposta válida. Não há segunda matriz de transições no mobile.

O formulário distingue indisponibilidade 503 de resposta incerta genérica e mantém a intenção sem retry automático. Em desenvolvimento, uma falha recebida da API mostra somente o status HTTP numérico. Erros 403/404/409 fecham o formulário antigo e atualizam os dados. Se a sessão não puder ser renovada, o fluxo existente volta ao login; depois de entrar, o usuário pode reabrir Solicitações para consultar o estado atual. Não se promete retorno automático ao detalhe nem reenvio da ação antiga.

Em Minha conta → Conexão com a API, Expo Go deve mostrar **`Revisão mobile: 2.6-mobile-r2`**. Esse identificador confirma presença dessa fonte no bundle aberto; não é hash Git, publicação, prova de teste físico ou prova de que a API cancelou uma operação. A informação é exclusiva de desenvolvimento e não aparece na interface de produção.

O comando offline `npm.cmd run check:mobile-runtime` confere fontes/rotas, imprime branch, HEAD, revisão esperada e fingerprint dos componentes. Não lê `.env`, não chama a API e não conecta a SQL Server. Ele não verifica remotamente o bundle que está aberto no telefone.

`ScreenContainer` mantém safe area superior/lateral e padding inferior com insets. `FlowDialog` mantém modal full screen com safe area, rolagem e ajuste de teclado. As escolhas têm altura mínima de 48 pontos, sem limitar linhas; textos e CTAs continuam escaláveis. Não foram feitas alterações arbitrárias de layout sem evidência de corte na nova revisão. Dynamic Island, glifo da estrela, texto ampliado e teclado ainda exigem observação física.

## Registro histórico — alternativa por patch antes da autorização de publicação

Esta seção documenta a tentativa anterior de transferência sem publicar. Após atualizar pelo GitHub, não executar estes comandos de aplicação do patch. O patch original e seu manifesto foram produzidos antes das atualizações editoriais deste relatório; não substituem a versão publicada.

Foi preparado um patch fora do repositório: `omini-mobile-2.6-r2.patch`, baseado em `b4439bc`, com as alterações mobile, os testes, o comando de diagnóstico e a documentação. Não contém `.env`, credenciais reais, alterações de backend ou migrations. O patch inclui também os arquivos novos; um `git diff` só de arquivos rastreados seria incompleto.

Salvar o patch disponibilizado na entrega como `C:\projetos\omini-mobile-2.6-r2.patch`. Não basta executar pull nem apenas limpar cache. O patch precisa ser copiado para o Windows e aplicado no checkout que inicia o Expo.

No PowerShell:

```powershell
Set-Location C:\projetos\omini
git branch --show-current
git rev-parse --short HEAD
git status --short
git apply --check C:\projetos\omini-mobile-2.6-r2.patch
if ($LASTEXITCODE -ne 0) { throw "Pare: o patch conflita ou ja foi aplicado. Preserve os arquivos locais e revise antes de continuar." }
git apply C:\projetos\omini-mobile-2.6-r2.patch
if ($LASTEXITCODE -ne 0) { throw "Pare: patch nao aplicado." }
npm.cmd run check:mobile-runtime
if ($LASTEXITCODE -ne 0) { throw "Pare: fontes ou rotas nao conferem." }
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { throw "Pare: typecheck falhou." }
npm.cmd run test -w @omini/mobile
if ($LASTEXITCODE -ne 0) { throw "Pare: testes falharam." }
```

Se a checagem falhar, não usar reset, clean, force, `--reject` ou sobrescrita em massa. Não apagar alterações locais. `git apply --reverse --check C:\projetos\omini-mobile-2.6-r2.patch` é uma checagem de leitura que pode identificar um patch já aplicado integralmente; não executar a aplicação reversa. Em caso de aplicação parcial ou edição prévia, comparar os arquivos antes de decidir. O apply normal é atômico e não escreve quando um trecho conflita.

Não houve mudança de dependências; a nova chave em package.json é somente um script offline. Não é necessário reinstalar dependências, recriar `.env`, apagar sessão ou reinstalar Expo Go. Sem commit, HEAD pode continuar sendo `b4439bc` mesmo depois de aplicar o patch; a revisão das fontes, o fingerprint e o marcador no app são as verificações desta entrega.

## Reiniciar o projeto correto no Expo Go

1. Usar a API de testes já configurada para `OminiDB`/15433. Esta tarefa não inicia a API, não aponta para a instância principal e não aplica migrations. Conferir o endereço de rede local existente do aplicativo; não usar localhost no iPhone.
2. Nos terminais que estejam servindo **este Omini**, encerrar o Metro antigo com Ctrl+C. Não finalizar indiscriminadamente todos os processos Node de outros projetos.
3. No terminal de `C:\projetos\omini`, iniciar uma sessão identificável em outra porta:

```powershell
npm.cmd run dev:mobile -- --clear --port 8082
```

4. Conferir no terminal que o projeto servido é `C:\projetos\omini\apps\mobile`. Se a porta estiver ocupada, revisar qual processo a utiliza ou escolher outra porta livre; não reutilizar um QR de sessão antiga.
5. No iPhone, voltar à tela inicial do Expo Go. Fechar/reabrir o Expo Go se ele continuar no projeto anterior e escanear **o QR recém-gerado**, sem selecionar um projeto recente antigo. Manter iPhone e computador na mesma rede.
6. Em Minha conta → Conexão com a API, confirmar `Revisão mobile: 2.6-mobile-r2` e o destino público esperado. Se o marcador não aparecer, parar a validação funcional: o telefone ainda não abriu essa revisão. Não apagar Keychain, conta, dados ou Expo Go para corrigir uma diferença de código.
7. Só então testar avaliações e cancelamentos. “Testar conexão” confirma somente `/health`; não conclui que o schema, as permissões ou o endpoint de cancelamento estão corretos.

## Checklist físico pendente

- Perfil público e profissional: `5 ⭐`, `4 ⭐`, `3,5 ⭐`, contagens reais, autor, comentários e datas; estado vazio sem reputação inventada.
- Detalhe da solicitação e avaliação já publicada: formato ⭐ em todas as notas exibidas.
- REQUESTED: cliente consegue revisar/confirmar cancelamento e prestador não recebe a ação quando a API não a oferece.
- ACCEPTED: ambos os participantes autorizados veem seus motivos válidos e cancelam somente após confirmar.
- IN_PROGRESS/AWAITING_CONFIRMATION: contexto obrigatório, incluindo declarações de trabalho parcial/integral alegado/contestado, sem confirmação bilateral adicional.
- Depois do sucesso: CANCELLED, histórico, ator/motivo/data/contexto, contato bloqueado e sem avaliação/ações incompatíveis. Conferir também com a outra conta.
- Erros: renovação/expiração de JWT, falha de rede, resposta perdida, conflito 409 e eventual 503. Repetição mantém a mesma intenção e não há envio automático após login.
- Layout: larguras lógicas 375/390 e próximas, texto ampliado, VoiceOver, Dynamic Island, home indicator, teclado, rolagem e comentários longos.

Se persistir indisponibilidade com o marcador correto, registrar apenas status HTTP, revisão, etapa/estado e código público da API quando disponível, sem tokens, conexões ou log SQL bruto. A causa interna exige investigação autorizada no servidor de testes; não é motivo para migrar/reinicializar o banco principal ou marcar migrations como aplicadas artificialmente.

## Verificações executadas e limites

| Verificação                          | Resultado                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| Suíte mobile completa                | 193 aprovados, 20 suítes, sem alteração de timeout                                            |
| Regressão da API antes da publicação | 204 aprovados com mocks/memória; `npm test` totalizou 397 testes aprovados                    |
| Typecheck de todos os workspaces     | Aprovado                                                                                      |
| Lint e `git diff --check`            | Aprovados                                                                                     |
| `check:routes`                       | 38 rotas verificadas                                                                          |
| `check:mobile-runtime`               | Revisão `2.6-mobile-r2`, fingerprint `56ac3a5d4ef458af`                                       |
| `check:secrets`                      | Aprovado                                                                                      |
| Bundle iOS gerado pelo Metro         | Exportado offline; componentes novos, ⭐ e marcador presentes, textos antigos removidos       |
| Patch original anterior à publicação | 19 arquivos; aplicação e conteúdo verificados antes das atualizações editoriais de publicação |
| SQL Server/API real/iPhone           | Não acessados ou testados nesta entrega                                                       |

A exportação iOS usa Metro offline, com dotenv desativado e JS de desenvolvimento sem bytecode apenas para inspeção; nenhuma configuração de produção do app é alterada por isso. Gerar um bundle não testa renderização/execução em um iPhone nem a integração real com a API/SQL Server. Na primeira rodada, foram ajustadas as premissas de entrada autenticada e retorno após sessão expirada nos testes de navegação; houve também um timeout sob execução simultânea do Metro. A suíte foi repetida sem a compilação concorrente e passou, mantendo os limites originais.

## Inventário dos arquivos modificados ou novos

```text
apps/mobile/src/components/Profile.tsx
apps/mobile/src/components/ReviewsSection.tsx
apps/mobile/src/dev/runtime.ts
apps/mobile/src/marketplace/provider/FlowUI.tsx
apps/mobile/src/requests/api.ts
apps/mobile/src/requests/CancellationDialog.tsx
apps/mobile/src/requests/screens.tsx
apps/mobile/src/reviews/RequestReviewPanel.tsx
apps/mobile/src/reviews/ReviewScreen.tsx
apps/mobile/test/contact-reviews-navigation.test.tsx
apps/mobile/test/marketplace-navigation.test.tsx
apps/mobile/test/mobile-runtime.test.tsx
apps/mobile/test/request-cancellation.test.tsx
apps/mobile/test/requests-navigation.test.tsx
apps/mobile/test/reviews-section.test.tsx
docs/fase-2-6-mobile-avaliacoes-cancelamento.md
docs/fase-2-6-mobile-validacao-iphone.md
scripts/check-mobile-runtime.mjs
package.json
```

A implementação e a validação iniciais ocorreram sem commit/push. A publicação posterior foi expressamente autorizada, restrita à branch `feature/fase-2-6`. Não há autorização ou execução de consulta SQL, migration ou alteração de banco nesta entrega.
