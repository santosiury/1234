# Fase 2.4 — Cobertura por cidade e UF

Branch `feature/fase-2-4-solicitacoes`, base `74d4a6e`. Esta correção substitui as regras de bairro dos guias históricos. O responsável informou que a migration `20261112000000_service_requests` e as permissões já foram aplicadas no SQL Server real. Nesta entrega não houve conexão com esse banco nem execução de SQL, migration, seed ou transformação dos dados.

**Não há nova migration nem GRANT pendente.** Schema, índices, migrations históricas (inclusive a de solicitações), permissões, autenticação, sessão, dependências e `.env` foram preservados. Manter `provider = "sqlserver"` no schema e `provider = "mssql"` no lock.

## Regra atual

A disponibilidade é municipal: cidade + UF, sem restrição de bairro. Uma área legada de Araranguá/SC com bairro Centro cobre a cidade inteira, incluindo Polícia rodoviária. A mesma cidade com UF diferente não é equivalente. Cidade fora da cobertura permanece bloqueada.

A API continua verificando conta/perfil prestador ativos, serviço ativo pertencente ao prestador, categoria ativa, área ativa da mesma cidade/UF e perfil cliente ativo. Autocontratação e consulta/alteração de solicitações de terceiros continuam proibidas. Estados, participantes imutáveis, conclusão pelo cliente, auditoria, versão e idempotência não mudaram.

Busca usa cidade/UF, nome, categoria e especialidade. Os predicados SQL usam valores parametrizados e `Latin1_General_100_CI_AI` nas comparações de cidade e UF. O `EXISTS` de área ativa evita multiplicar prestadores quando há várias linhas legadas. Paginação e ordenação existentes foram preservadas. O campo legado `neighborhood` de filtros é aceito com limites e descartado, para compatibilidade com chamadas antigas; não afeta resultados nem é anunciado como filtro no Swagger ou enviado pelo mobile atualizado.

## Compatibilidade das áreas antigas

`ProviderServiceArea.neighborhood` e a chave física `(providerId, city, state, neighborhood)` continuam no SQL Server. Não criar unicidade física por município sobre dados legados sem planejamento de migração. A unicidade municipal é validada na aplicação, dentro de transação Serializable.

- A apresentação agrupa cidade/UF, ignorando diferenças de caixa/acentos e espaços nas pontas. `packages/shared/src/location.ts` centraliza normalização e agrupamento; não é um cadastro oficial IBGE nem geocodificação. Variações ortográficas além de acentos/caixa continuam dependendo de cadastro correto.
- Um município fica **ativo se qualquer linha legada desse município estiver ativa**. Uma linha inativa não oculta uma ativa. A lista própria mostra um município e seu estado agregado; o catálogo público mostra cidades ativas uma única vez, sem projetar bairro.
- O representante é escolhido de forma estável pelo menor UUID em ordem lexical; a ordem de apresentação é UF/cidade/id. A ação aceita qualquer ID legado pertencente ao grupo e à conta. O ID é uma referência para gerenciar o grupo, não um novo registro ou ID geográfico.
- Criar cidade já existente retorna 409, mesmo se estiver inativa: editar/reativar o cadastro existente. UF diferente constitui outra cobertura. O limite de 50 passa a contar **cidades distintas**, não linhas antigas de bairros.
- Cadastro novo grava bairro vazio na coluna legada. Campo de bairro recebido por cliente antigo no cadastro é limitado e descartado; PATCH contendo somente bairro retorna 400, sem mudança de cobertura.
- Desativar/ativar a cidade atualiza todas as linhas legadas do grupo na transação; não apaga nenhuma linha e não altera seus bairros. As outras cidades e prestadores não são afetados.
- Editar para outra cidade/UF move o grupo completo e preserva os bairros legados e respectivos IDs. Editar para município já existente retorna 409, evitando fusão silenciosa e colisão do índice antigo. Nomes logicamente equivalentes (somente caixa/acentos) não são renomeados fisicamente; isso evita colisão entre aliases legados sem alterar cobertura.
- Casos incomuns em que aliases antigos resultem em colisão da unicidade física ao mover um grupo serão revertidos transacionalmente e retornarão erro seguro; não há apagamento/consolidação automática. Exigem revisão futura dos dados, se encontrados.

Essas escritas ocorrem apenas quando o usuário executa a ação correspondente pelo aplicativo. Não há rotina de limpeza no startup, no deploy ou na leitura. As permissões existentes de SELECT/INSERT/UPDATE em `ProviderServiceArea` atendem às operações; a trilha de solicitações continua append-only para runtime.

Implantar todas as instâncias do backend atualizado antes do mobile atualizado e evitar manter escritores antigos com a antiga regra de bairro. A transação Serializable trata corrida de cadastro/edição; comportamento real de locking, collation e permissões ainda precisa ser conferido no SQL Server pelo responsável.

## Contexto de contratação

O caminho é: busca aplicada → card do profissional → perfil → Solicitar serviço → login/cadastro, se necessário → formulário/revisão.

O card transporta **a cidade/UF dos filtros aplicados**, e não valores digitados que ainda não foram pesquisados. O perfil preserva esse contexto; a autenticação mantém somente parâmetros internos limitados e estruturados. Não há URL arbitrária de retorno.

O formulário compara o contexto com as cidades ativas retornadas pelo catálogo:

1. Contexto corresponde a uma cidade atendida: mostrar **“Atendimento em Criciúma, SC”**, sem campos de cidade, UF ou bairro.
2. Sem contexto e uma única cidade: usar essa cidade atendida, sem pedir preenchimento.
3. Sem contexto e várias cidades: apresentar seleção simples entre as cidades ativas deduplicadas. O cliente não pode digitar uma localização arbitrária.
4. Contexto antigo/adulterado fora da cobertura: avisar e exigir escolha explícita de uma cidade atendida, mesmo se só houver uma opção. Nenhuma solicitação é enviada automaticamente.
5. Nenhuma cidade ativa: estado indisponível; não permitir revisar/enviar.

O cliente escolhe serviço e escreve descrição; depois revisa a cidade informativa e confirma. A home piloto continua buscando explicitamente Araranguá/SC; isso é contexto daquela consulta, **não um fallback universal do formulário**. Busca alterada ou acesso direto pode resultar em qualquer município atendido.

A cidade/UF recebida no POST não constitui autorização. O backend revalida uma área ativa da mesma cidade/UF na transação, com conta/perfil/serviço/categoria ativos. Contexto que perdeu validade entre pesquisa e envio é rejeitado. A seleção não promete reserva nem disponibilidade de agenda.

Novas telas próprias, públicas, de listas, detalhes, revisão e recuperação não exibem bairros. A seção Onde atendo contém somente cidade/UF, com cobertura integral; edição, ativação, desativação, Ajuda, footer e Stacks continuam funcionando.

## Contratos e envios pendentes

Para novos clientes, o POST contém `providerId`, `providerServiceId`, `description`, `city`, `state` e `idempotencyKey`; **não contém bairro**. A API mantém a propriedade opcional legada no parser de solicitações para conseguir conferir recibos antigos. O Swagger a marca como depreciada.

- Solicitação nova persiste `ServiceRequest.neighborhood = ''`, mesmo se uma versão antiga enviar bairro. Cobertura nunca usa esse valor. A descrição continua limitada e protegida contra padrões evidentes de dados privados.
- Solicitações antigas não são regravadas: bairro, snapshots, eventos e hashes existentes permanecem intactos. O DTO privado mantém o campo histórico por compatibilidade; a nova UI não o apresenta.
- O hash do recibo mantém o formato/ordem do payload normalizado da versão `74d4a6e`, incluindo eventual bairro antigo. Não remover esse campo de um envio pendente ou recalcular seus recibos: isso causaria 409 por intenção diferente.
- SecureStore mantém namespace **`omini.requests.pending.v1.<userId>`**, blocos e manifesto anteriores. O leitor aceita tanto o formato antigo com bairro quanto o novo sem bairro. Ler não muda bytes, chave ou payload e não dispara POST.
- Recuperar continua sendo ação explícita: consultar `by-key`, e somente em 404 reenviar **o payload e a chave originais**. O servidor retorna o pedido anterior ou cria um único pedido com cobertura municipal. Não gerar chave nova para resolver resposta incerta.
- Confirmação do envio limpa o registro conforme o mecanismo existente. Falha de rede/armazenamento, sessão expirada, isolamento por conta, retry e proteção de formulários permanecem. Não foi implementada migração automática de dados locais.

## Arquivos principais

- `packages/shared/src/location.ts`, `index.ts`: contexto municipal, normalização, agrupamento e campos legados explicitamente depreciados.
- `apps/api/src/marketplace/catalog-query.ts`, `validation.ts`, `marketplace.controller.ts`, `prisma-marketplace.repository.ts`: filtros, Swagger, projeção e operações municipais.
- `apps/api/src/requests/prisma-requests.repository.ts`, `validation.ts`, `requests.controller.ts`, `requests.service.ts`: validação de cobertura, compatibilidade de payload/recibo e bairro vazio em novos registros.
- `apps/mobile/src/marketplace/{CatalogScreens,ProviderScreens,components}.tsx`, `api.ts`, `provider/{Forms,FlowUI}.tsx`: busca, contexto, perfis e Onde atendo.
- `apps/mobile/src/requests/{NewRequest,screens,components}.tsx`, `intent.ts`, `pending.ts`: formulário simplificado, retomada autenticada, revisão e compatibilidade local.
- `apps/api/test/city-coverage.test.ts`, cenários adicionais em `marketplace.test.ts`/`requests.test.ts`, asserts SQL em `marketplace-sql.test.ts`/`requests-prisma.test.ts`, repositórios de teste.
- Testes mobile `marketplace-navigation.test.tsx`, `requests-navigation.test.tsx`, `requests-storage.test.ts`, README e guias.

## Validação executada

A suíte conserva os 138 testes anteriores, com atualização dos asserts que exigiam bairro. Foram acrescentados 17 cenários: **155 testes aprovados, 63 API + 92 mobile**. Cobrem cobertura de área Centro para a cidade inteira, ausência de bairro no POST, bloqueio de outra cidade/UF, agrupamento/OR de áreas ativas, várias cidades, duplicidades e edição, ativação/desativação do grupo, autorização, recibos legados, SecureStore antigo/novo, contexto após login, contexto inválido e fluxo completo.

Também aprovados: `npm run typecheck`, `npm run lint`, `npm run build:api`, `npm run prisma:validate -w @omini/api`, `npm run check:migrations -w @omini/api`, rotas (37), marca, scanner de segredos e bundles Hermes iOS/Android com Expo SDK 58. Schema com 11 modelos, sem alteração de dependencies ou lockfile. Os testes do adaptador Prisma usam mocks; a suíte HTTP usa repositórios em memória e não conecta ao SQL Server.

Inspeção adicional: cópia temporária React Native Web/Chromium com API HTTP NestJS e repositórios descartáveis em memória. Busca em Criciúma → contratação sem repetir localização → aceite/início/proposta → reabertura → confirmação final aprovados. Acesso sem contexto apresentou Araranguá, Criciúma e Sombrio, sem duplicar Araranguá apesar de linha legada inativa; seleção de Sombrio funcionou. Dezesseis combinações de tela/largura (320/375/390/430 px) sem overflow horizontal ou botões cortados detectados nas telas examinadas, sem erro JavaScript. A revisão também foi inspecionada em 390 px. Esse harness substitui SecureStore por memória e não é um teste de Keychain/VoiceOver/safe area nativos. Nenhuma dependência web foi adicionada ao aplicativo.

**Não houve validação física no iPhone nem teste real de SQL Server nesta correção.** O responsável já validou a implantação anterior, mas deve executar o roteiro abaixo para esta versão. Não há operação de banco a autorizar nesta entrega. Eventual remoção física de colunas, saneamento excepcional ou nova unicidade por município seria uma entrega futura incremental, sujeita a revisão; nenhum desses scripts foi criado ou executado agora.

## Atualizar no Windows

Parar API e Expo antes de trocar a versão. Preservar credenciais e configurações locais. Se `git status` mostrar alterações próprias, salvá-las/revisá-las antes de atualizar; não usar reset/clean.

```powershell
Set-Location C:\projetos\omini
git status --short
git fetch origin
git switch feature/fase-2-4-solicitacoes
git pull --ff-only origin feature/fase-2-4-solicitacoes
npm ci
npm run typecheck
npm run lint
npm test
npm run build:api
npm run prisma:validate -w @omini/api
npm run check:migrations -w @omini/api
```

**Não executar migration, seed, db push, reset ou GRANT para esta correção.** `npm ci` gera o client existente sem aplicar migrations. Em terminais separados:

```powershell
Set-Location C:\projetos\omini
npm run dev:api
```

```powershell
Set-Location C:\projetos\omini
Invoke-RestMethod http://localhost:3000/api/health
npm run dev:mobile -- --clear
```

Continuar usando o IPv4 do Windows já configurado em `EXPO_PUBLIC_API_URL`, mesma rede Wi-Fi privada, Expo Go SDK 58 e acesso à rede local liberado. No celular, não usar localhost como endereço da API. Não compartilhar credenciais, tokens ou cópia de `.env` no chat/Git.

## Roteiro no iPhone

1. Prestador com área legada Araranguá/SC — Centro: abrir Onde atendo. Ver uma cidade, nenhum campo/bairro antigo; conferir Meu perfil e perfil público sem bairro.
2. Se houver várias linhas legadas da mesma cidade (ativas e inativas), a cidade deve aparecer uma vez, ativa quando qualquer linha estiver ativa. Desativar a cidade deve retirá-la da busca nessa cidade; reativar deve restaurá-la. Não deve afetar outras cidades.
3. Adicionar Criciúma/SC e Sombrio/SC, editar uma cidade e conferir que duplicata por caixa/acentos recebe mensagem para editar/reativar o cadastro existente. Não é necessário editar diretamente o SQL Server.
4. Cliente: buscar em Araranguá/SC → selecionar prestador → Solicitar serviço. Ver “Atendimento em Araranguá, SC”. Escolher serviço, descrever a necessidade e revisar/enviar, sem informar Polícia rodoviária, Centro ou qualquer bairro e sem repetir cidade/UF.
5. Repetir a busca em Criciúma/SC; o formulário e a revisão devem indicar Criciúma, não Araranguá. Buscar cidade fora da cobertura deve excluir o profissional. Uma chamada POST fora da cidade/UF deve continuar rejeitada pelo backend.
6. Entrar no perfil por caminho sem contexto, com várias cidades, e conferir seleção entre cidades atendidas. Com única cidade, o contexto deve ser preenchido automaticamente. Nunca mostrar campo livre de localização no formulário de contratação.
7. Como visitante, iniciar solicitação em outra cidade e fazer login/cadastro. Conferir que a intenção/cidade é retomada sem envio automático. Cancelar formulário alterado deve pedir confirmação; autenticação e logout continuam funcionando.
8. Se já existir envio pendente da versão anterior, conferir recuperação sem bairro na tela. Retomar explicitamente e verificar um único pedido. Não apagar o registro local nem gerar outro pedido para contornar resposta incerta. Sessão expirada deve permitir login e retomada com a mesma conta.
9. Prestador recebe → aceita → inicia → informa conclusão. Cliente reabre com motivo, prestador informa novamente e cliente confirma. Conferir histórico, finais, recusa e cancelamento permitido antes do início. Pedidos antigos continuam visíveis e seus dados históricos não são regravados.
10. Revalidar conta com ambos os perfis, proibição de autocontratação/IDOR, três cards aprovados, footer, retorno ao painel, Ajuda, proteção de formulários, catálogo/categorias, texto ampliado, VoiceOver, teclado e home indicator. Registrar modelo/iOS/Expo Go/resultados físicos.
