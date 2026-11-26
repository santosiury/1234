# Fase 2.6 — implementação preparada e roteiro de homologação

Branch `feature/fase-2-6`, base de trabalho `6e7c043`. A implementação e validação não acessaram SQL Server nem executaram migrations. A publicação posterior do código foi autorizada somente na mesma branch, sem merge; isso não autoriza aplicação no banco. Cancelamentos da base homologada são preservados. Política aprovada: [avaliações protegidas e anonimato](avaliacoes-bidirecionais.md).

## O que foi preparado

- Avaliações cliente → prestador e prestador → cliente, prazo de 14 dias, liberação conjunta ou por vencimento, recibos próprios, imutabilidade e grupos anônimos de no mínimo cinco autores distintos.
- Autorização da reputação do cliente pelo pedido recebido, inclusive antes do aceite. Contagem/média/distribuição calculadas no backend, sem expor comentários de terceiros.
- UI de reputação com nota grande, distribuição por estrelas, barras acessíveis e estado de privacidade. Formulário identifica o alvo e retorna à solicitação correta em ambos os modos.
- Diagnóstico da API removido de `Profile`, inclusive em Expo Go de desenvolvimento. Disponível apenas por acesso deliberado a `/internal/diagnostics`, protegido por `__DEV__`; não há link na navegação normal. A API `/api/health` permanece intacta. Revisão mobile: `2.6-mobile-r4`.
- Nova migration **preparada, não executada**: `apps/api/prisma/migrations/20261124000000_bidirectional_reviews/migration.sql`.
- Permissões incrementais preparadas: `docs/sql/protected-reviews-runtime-permissions.sql`.

## Atualização após auditoria

O [plano revisado de ativação e recuperação](fase-2-6-ativacao-segura.md) prevalece sobre a sequência operacional inicial abaixo. Inclui proteção de coortes completas, recusa de aplicativo antigo (426), checks SQL read-only e risco de conclusões sem janela durante funcionamento com flag desligada. Nenhuma operação SQL foi executada. Não há rollback funcional comprovado.

## Segurança do corte de versão

A migration cria somente as três tabelas novas, seus índices/FKs/checks e um trigger de proteção no INSERT antigo. Copia as avaliações históricas para o ledger com os mesmos IDs, autoria, nota, texto e data; não apaga nem atualiza `ServiceReview`, solicitações, eventos ou categorias. Não cria janelas antigas nem avaliações inversas retroativas.

O SQL usa `XACT_ABORT`, `TRY/CATCH`, transação única e rollback. Referências ao ledger novo e criação do trigger são compiladas em lotes internos `sys.sp_executesql`, sem `GO`. As seis migrations anteriores e seus checksums permanecem inalterados; há manifesto de hashes e teste de regressão.

O destino é protegido por `DB_NAME() = OminiDB` e porta TCP local 15433. O runner existente continua exigindo **127.0.0.1:15433**, banco `OminiDB`, usuário **omini_migrator**, sem fallback para `DATABASE_URL`. A API com política ativa exige **127.0.0.1:15433**, `OminiDB`, **omini_app**, porta HTTP **3001**, persistência/autenticação habilitadas e ambiente não produção. `localhost\\OMINI` / 1433 não é destino permitido para esta ativação.

As novas permissões concedem SELECT/INSERT nas três tabelas e somente UPDATE das colunas `ReviewWindow.releasedAt` e `ParticipantReview.publishedAt,batchId`. Sem DELETE, alteração de nota/texto/autoria, `db_owner` ou `db_datawriter`. Rever os papéis existentes para garantir que não haja concessões amplas herdadas. O script de permissões também recusa porta diferente de 15433.

`REVIEWS_V2_ENABLED` é `false` por padrão. Não foi alterado nenhum `.env`. Depois da migration, o trigger `ServiceReview_protected_cutover` recusa novas gravações pelo caminho antigo. Portanto desligar o flag ou executar um backend antigo **não é rollback funcional de escrita**: o sistema falha fechado para proteger a política. Parar escritores, migrar, conceder permissões e ativar devem compor uma única janela de manutenção na instância de testes.

## Atualização do código no Windows agora

Após conferir o hash efetivamente publicado em `origin/feature/fase-2-6`, atualizar no Windows com árvore limpa. O pull traz o código; não autoriza migrations ou início da API contra o banco principal:

```powershell
Set-Location C:\projetos\omini
git status --short
git switch feature/fase-2-6
git pull --ff-only origin feature/fase-2-6
npm.cmd ci
npm.cmd run prisma:generate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run check:migrations --workspace @omini/api
npm.cmd run check:routes
npm.cmd run check:mobile-runtime
npm.cmd run check:secrets
```

`npm.cmd` evita o bloqueio de `npm.ps1` no PowerShell sem alterar políticas do Windows. `prisma:generate` e `check:migrations` são locais/estáticos, não aplicam SQL. Não iniciar API com conexão principal para testar esta fase.

## Procedimento de migração — somente após autorização separada

**Os passos abaixo são um plano para o responsável, não instrução de execução imediata. Nenhum comando de migration é executado nesta entrega.**

1. Confirmar a autorização específica para OMINI_TEST, TCP 15433, e nenhum outro destino. Conferir que a API principal não será usada. Parar escritores de testes e reservar janela de manutenção.
2. Fazer backup e inventário de contagens/checksums das categorias, solicitações, eventos e avaliações históricas em OMINI_TEST; guardar fora do Git. Confirmar as seis migrations anteriores aplicadas e nenhuma tentativa pendente/falha. Se houver falha anterior, interromper e revisar histórico/checksum antes de prosseguir.
3. Revisar SQL e checksum da sétima migration, trigger e GRANTs. Revisar `apps/api/.env.migrations` local com migrador em 127.0.0.1:15433 e placeholders substituídos localmente; nunca copiar credenciais para logs/Git.
4. Só então executar os comandos existentes `db:migrate:status` e `db:migrate:deploy` no workspace API, usando o migrador restrito e o runner protegido. O runtime não aplica migrations. Executar os GRANTs incrementais com identidade autorizada de testes.
5. Comparar contagens e conteúdo históricos antes/depois; confirmar seis checksums antigos intactos, novo ledger equivalente ao legado, nenhuma janela para conclusões antigas e constraints confiáveis. Testar que o caminho antigo falha fechado.
6. No ambiente local da API de testes, configurar manualmente `PORT=3001`, `REVIEWS_V2_ENABLED=true`, `AUTH_ENABLED=true`, `PERSISTENCE_ENABLED=true`, runtime `omini_app` e conexão **127.0.0.1:15433 / OminiDB**. Preservar chaves de sessão e outros segredos locais. Não substituir `.env` integralmente ou alterar a conexão principal por conveniência.
7. Iniciar somente a API isolada e validar `/api/health`, sessão e novos fluxos. A proteção de configuração impede ativar o flag contra 1433 ou HTTP 3000.

Se o SQL falhar, a transação deve reverter tabelas, cópia e trigger; ainda assim inspecionar o estado real e o registro do Prisma antes de qualquer recuperação. Não usar reset/db push, não excluir `_prisma_migrations`, não marcar migration não executada como aplicada. Se aplicada com sucesso e surgirem problemas de aplicação, parar escritores, preservar dados e fazer correção aditiva para frente. Não apagar avaliações para retornar ao backend antigo.

## Expo Go / iPhone, após a instância de testes autorizada estar pronta

Em outro PowerShell, manter o iPhone e o Windows na mesma rede. Usar o IPv4 atual do Windows, **não localhost no celular**. Alterar somente a linha `EXPO_PUBLIC_API_URL` do arquivo mobile local existente para `http://SEU_IPV4:3001/api` (substituir SEU_IPV4 pelo endereço real). Preservar as demais linhas. Não publicar esse `.env`.

```powershell
Set-Location C:\projetos\omini
ipconfig
npm.cmd run dev:mobile -- --clear
```

Abrir QR code no Expo Go compatível com SDK 58. Não é necessário atualizar dependências ou criar build nativo. API isolada deve escutar na rede, e firewall do Windows deve permitir a porta 3001 na rede privada. Conferir o endereço `/api/health` no Safari do iPhone; isso confirma conectividade, não a política nem o banco.

### Checklist manual obrigatório

1. Conta normal: não aparecem “Conexão com a API”, URL, botão de teste nem revisão técnica. Login, persistência, troca de perfis e logout continuam funcionando. O diagnóstico deliberado pode ser aberto pelo esquema Expo em desenvolvimento; nunca inserir link no menu de produto.
2. Criar uma solicitação nova com dois usuários distintos. Prestador consulta a reputação do cliente **antes do aceite**. Ver apenas agregado protegido, sem notas individuais. Terceiro não consegue consultar a mesma rota.
3. Concluir pelo ciclo real: aceite → início → proposta → confirmação do cliente. Cliente e prestador veem oportunidade para avaliar o alvo correto e prazo. Solicitações históricas não ganham oportunidade nova; recibos antigos próprios continuam acessíveis.
4. Uma parte envia: vê apenas o próprio recibo; a outra não vê nota, comentário ou indicação de envio. Voltar pelo formulário deve preservar a Stack e o pedido do modo correto. Back com nota não salva deve pedir confirmação.
5. Segunda parte envia dentro da janela: ambas as notas são liberadas internamente. Repetição idêntica não duplica e alteração da nota falha. A reputação pública continua protegida se não houver grupo de cinco autores distintos.
6. Testar grupos de cinco autores distintos **somente na instância isolada**, com contratações reais de teste concluídas, sem seed automático de avaliações. Conferir média/contagem/distribuição reais e ausência total de identidades, IDs, datas e comentários individuais. Nova nota isolada não altera grupo já divulgado.
7. Expiração: validar com fixture/relógio controlado no teste automatizado. Para teste real, acompanhar a janela no tempo real; não alterar relógio/data do banco nem atualizar registros para acelerar. Após 14 dias, rejeitar envio novo e publicar a nota existente pelo ciclo de até 60 s do publicador saudável.
8. Cancelamentos: repetir REQUESTED pelo cliente e ACCEPTED/IN_PROGRESS/AWAITING_CONFIRMATION por ambos, motivos únicos, OTHER de 10–500 caracteres, confirmação explícita e contexto obrigatório após início. Alegação parcial/integral não impede o cancelamento vigente. Conferir CANCELLED/histórico, bloqueio de contato e avaliações, idempotência e conflito de versão. Não modificar regras para acomodar avaliações.
9. Textos maiores do iOS e larguras de 375/390 pontos: sem corte de nota/contagem, barras e mensagens legíveis, alvos de estrelas de pelo menos 48 pontos. VoiceOver deve ler contagem exata nas barras. Verificar teclado, safe areas, retorno e carregamento/erro/expiração de sessão.
10. Sessão expirada, conta trocada durante requisição e API indisponível: não manter conteúdo privado de outro usuário ou autorizar leitura com o adaptador da conta anterior.

## Limitações de validação

Não há SQL Server ou iPhone acessível nesta execução. Testes locais usam repositórios em memória e mocks de Prisma/HTTP/Expo. Inspeção estática não comprova compilação real da migration, grants, comportamento de bloqueios ou plano de execução SQL. A homologação física e o ensaio de migração/rollback isolado continuam pendentes de autorização e execução pelo responsável. Push, moderação administrativa, denúncias e avaliação antifraude avançada permanecem fora do escopo.
