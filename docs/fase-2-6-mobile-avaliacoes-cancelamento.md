# Avaliações e cancelamento no mobile — Fase 2.6

Branch: `feature/fase-2-6`. Entrega restrita ao aplicativo, seus testes/documentação e um script de diagnóstico offline. Não modifica API NestJS, contratos compartilhados, autenticação, SecureStore, dependências, schema ou migrations. Não conecta ao SQL Server nem executa migrations. A implementação inicial foi entregue sem publicação; o responsável posteriormente autorizou commit e push dos 19 arquivos exclusivamente nessa branch, sem merge ou force push.

Atualização após o relato no iPhone: as alterações desta entrega estavam somente no rascunho local, enquanto o Windows permanecia em `b4439bc`. Veja o [diagnóstico de distribuição, confirmação de revisão e roteiro de atualização via GitHub](fase-2-6-mobile-validacao-iphone.md). Os resultados abaixo registram a primeira entrega; a revisão r2 amplia a validação e não deve ser considerada teste físico do aparelho.

## Avaliações reais

Notas publicadas e médias passam de “nota de 5” para “nota ⭐”. Exemplos de apresentação: `4,5 ⭐ · 12 avaliações recebidas`, `5 ⭐ · 1 avaliação recebida` e `Cliente Omini · 3 ⭐`.

Os valores e a contagem continuam vindo da API; a média mantém a formatação pt-BR e uma casa decimal no máximo. Não há nota fixa, cálculo a partir da página de comentários ou dados demonstrativos no catálogo real. Autor público, comentário, data e paginação permanecem preservados. Sem avaliações, mostrar “Ainda não há avaliações.” sem nota, estrelas ou contagem inventada; carregamento/erro continuam distintos do estado vazio. O seletor de nota para publicar uma avaliação permanece funcional.

## Cancelamento conforme o contrato existente

Foram inspecionados `cancellation.validation.ts`, `validation.ts`, `requests.controller.ts`, o serviço de solicitações e os contratos de `packages/shared`. O backend já suporta o fluxo; nenhuma alteração nele foi necessária.

O mobile anterior oferecia um motivo opcional no body legado, incompatível com novos cancelamentos após aceite, e tinha mensagens desatualizadas sobre cancelamento após o início. O novo fluxo usa `POST /api/requests/:id/cancel`, consumindo `CancelRequestInput` existente.

- A oferta da ação vem de `allowedActions` da API. Não se habilita cancelamento calculando uma segunda matriz de permissões no app. Estados finais também são protegidos pela lista compartilhada `FINAL_REQUEST_STATUSES`.
- O participante original vem de `request.viewer`, independentemente da aba ou modo ativo. As opções vêm de `cancellationReasons(viewer)`: acordo de valor é a primeira, há seleção única e motivos próprios de cada participante.
- `OTHER` exige descrição de 10 a 500 caracteres após trim/NFC. A pré-validação de privacidade segue o contrato; a API continua sendo a autoridade. Os motivos predefinidos não enviam `reason` livre, mesmo se o usuário tiver preenchido Outro antes de trocar a seleção.
- `executionContext` é exigido pelo helper compartilhado se o estado for IN_PROGRESS/AWAITING_CONFIRMATION ou houver `startedAt` registrado. NONE, PARTIAL, FULL_CLAIMED e DISPUTED continuam disponíveis; não há bloqueio unilateral adicional por trabalho parcial/integral alegado nem confirmação bilateral.
- Primeiro o usuário seleciona os dados; depois toca em “Revisar cancelamento”. Somente “Confirmar cancelamento”, na segunda etapa, envia `confirmed: true`. O aviso explica encerramento irreversível, preservação do histórico e indisponibilidade de contato e avaliação.
- O envio usa a versão do registro aberto e uma UUID por intenção. Bloqueio de clique duplo, saída desabilitada durante envio e estado de carregamento evitam envios concorrentes pelo formulário.
- Resposta incerta congela a intenção completa: repetir utiliza os mesmos campos, versão e chave. Não há retry automático. Voltar fecha o formulário e atualiza a solicitação antes de outra ação. A intenção permanece em memória; ao sair/reabrir o app, consultar o estado atual antes de preparar uma nova tentativa.
- Rejeição de validação permite correção como nova intenção. Erros 403/404/409 encerram o formulário antigo e solicitam atualização; não há reenvio automático com outra versão. Falha no refresh deixa ações de mutação desabilitadas até uma atualização bem-sucedida.
- O retorno do POST precisa ser um detalhe válido com status CANCELLED para ser considerado sucesso. Essa resposta atualiza imediatamente tela/histórico mesmo se o GET seguinte demorar ou falhar. Um resultado remoto posterior com versão mais nova tem precedência.
- O histórico preserva ator, motivo, data e eventos antigos, e exibe a declaração de execução quando presente. Os metadados opcionais são validados sem exigir classificação em eventos legados. Contato e avaliação continuam sujeitos aos estados e às autorizações existentes na API.

O formulário reutiliza o modal com safe area, rolagem e ajuste de teclado, botões Omini e a identidade preto/branco/verde-lima/Inter. Opções têm alvo mínimo de 48 pontos, texto sem truncamento e estado de rádio para acessibilidade. Textos antigos de ajuda foram alinhados ao fluxo já autorizado pela API.

## Arquivos da entrega

Aplicativo:

- `apps/mobile/src/components/ReviewsSection.tsx`
- `apps/mobile/src/reviews/RequestReviewPanel.tsx`
- `apps/mobile/src/reviews/ReviewScreen.tsx`
- `apps/mobile/src/requests/api.ts`
- `apps/mobile/src/requests/CancellationDialog.tsx` (novo)
- `apps/mobile/src/requests/screens.tsx`
- `apps/mobile/src/marketplace/provider/FlowUI.tsx`

Testes:

- `apps/mobile/test/reviews-section.test.tsx`
- `apps/mobile/test/contact-reviews-navigation.test.tsx`
- `apps/mobile/test/marketplace-navigation.test.tsx`
- `apps/mobile/test/request-cancellation.test.tsx` (novo)
- `apps/mobile/test/requests-navigation.test.tsx`

Documentação: este arquivo.

## Validação automatizada

Comandos na raiz do checkout:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test -w @omini/mobile
```

Os testes usam mocks de HTTP, sessão e SecureStore, sem API real ou banco. Cobrem notas de 1 a 5 e médias decimais, contagem singular/plural, comentários/datas, estado vazio, participantes/motivos, execução após início, confirmação, payload/endpoint, chave estável em resposta incerta, clique duplo, validação de Outro, conflitos, sessão expirada, histórico, atualização imediata e bloqueio de estados finais. A regressão de navegação, perfil, serviços e autenticação permanece na suíte mobile.

Resultados executados:

| Verificação                                   | Resultado                                             |
| --------------------------------------------- | ----------------------------------------------------- |
| Suíte mobile completa                         | 176 aprovados, 19 suítes; 34 testes a mais que a base |
| Typecheck                                     | Aprovado em todos os workspaces                       |
| Lint                                          | Aprovado                                              |
| `git diff --check`                            | Aprovado                                              |
| Backend, contratos, dependências e migrations | Sem alterações                                        |
| SQL Server e iPhone físico                    | Não acessados/testados nesta entrega                  |

## Roteiro manual pendente — iPhone físico / Expo Go SDK 58

Nenhum teste físico foi executado na nuvem. Compilação TypeScript e testes com mocks não comprovam renderização nativa nem uma transação no SQL Server real.

1. Com a API de testes já configurada e em execução para `OminiDB`/porta `15433`, iniciar o Expo no Windows com `npm.cmd run dev:mobile -- --clear`. Usar a configuração de rede local existente; celular físico não acessa o PC por localhost. Não apontar a API para a instância principal nem alterar credenciais para esta validação.
2. No Expo Go do iPhone, abrir um profissional com avaliações reais e conferir média, contagem, `Cliente Omini · nota ⭐`, comentários, datas e paginação. Abrir também um profissional sem avaliações. Conferir a nota publicada nos detalhes e na tela de avaliação já enviada.
3. Testar tela estreita e tamanho de texto ampliado, inclusive motivo longo, teclado de Outro, rolagem, safe area e indicador inferior. Com VoiceOver, conferir rótulos, opção selecionada, foco do modal e botão de confirmação. Não deve haver texto cortado.
4. Como cliente, abrir uma solicitação cuja API ofereça cancelamento em REQUESTED e em ACCEPTED. Conferir motivos próprios, seleção única, fechamento sem envio e revisão antes de confirmar. Em Outro, verificar limite mínimo e recusa de dados pessoais óbvios. Fazer esses testes apenas com dados de teste autorizados.
5. Como prestador destinatário, conferir ausência de cancelar em REQUESTED e presença após aceite quando a API oferecer a ação. Validar o motivo específico do prestador. Se a conta tiver os dois perfis, conferir que os motivos seguem o participante original da solicitação.
6. Em IN_PROGRESS/AWAITING_CONFIRMATION e em registro com início gravado, confirmar que não se envia sem contexto. Validar cancelamento com execução parcial e os demais contextos em solicitações de teste separadas. Nenhuma dessas declarações deve transformar o estado em COMPLETED.
7. Depois do sucesso, conferir CANCELLED, histórico com ator/motivo/data/contexto e ausência de ações incompatíveis, contato e avaliação. Reabrir a solicitação com a outra conta e conferir o mesmo estado histórico.
8. Com dados de teste e acesso ao ambiente autorizado, simular falha de rede na resposta: o botão deve repetir a mesma intenção ou permitir voltar e atualizar, sem cancelar duas vezes. Alterar a solicitação na outra conta durante a revisão para verificar conflito de versão, fechamento do formulário antigo e necessidade de revisar novamente.
9. Testar sessão expirada e troca de conta: recuperar autenticação pelo fluxo existente e consultar o estado atual, sem expor contatos de outra conta ou reenviar automaticamente uma ação antiga.

As alterações/consultas reais desse roteiro devem ser feitas pelo responsável somente no ambiente de testes autorizado. Nenhum comando de migration, acesso a SQL Server ou teste real desse roteiro foi executado nesta entrega.
