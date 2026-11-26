# Fase 2.6 — corte de versão e homologação exclusivamente em testes

Esta revisão corrige coortes, prazo no mobile, Swagger e CI. **A validação não executa SQL, migrations ou GRANTs. A publicação do código é separada, restrita à branch feature/fase-2-6 e sem merge.** A sétima migration continua apenas preparada. Não há rollback funcional comprovado após sua aplicação. Os comandos deste documento pertencem a uma etapa futura, condicionada à autorização expressa do responsável.

## Destinos e proteções

- SQL autorizado: **127.0.0.1:15433**, banco **OminiDB**, instância de testes OMINI_TEST. Migração: **omini_migrator**; runtime: **omini_app**.
- API isolada: **3001**. Mobile aponta para o IPv4 do Windows:3001/api, nunca localhost no iPhone.
- Instância principal **1433**: não acessar, não migrar, não trocar configuração para contornar recusas.
- Runner de status/deploy exige MIGRATION_DATABASE_URL separada, host/porta/banco/login exatos e não usa fallback do runtime.
- `REVIEWS_V2_ENABLED=true` exige autenticação/persistência, API 3001, runtime de testes e ambiente não produção. A validação antecede a conexão Prisma.
- SQL preparado e scripts de verificação também recusam banco/porta diferentes. A porta verificada pelo SQL é a porta TCP real da conexão no servidor.

## Matriz de compatibilidade auditada

| Schema                     | Flag  | Comportamento                                                                                                                                                                                                                                                                                |
| -------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Antes da sétima migration  | false | Contrato legado da Fase 2.5, somente cliente e publicação imediata. É o estado anterior ao corte, não a nova política.                                                                                                                                                                       |
| Antes da sétima migration  | true  | Configuração proibida operacionalmente: faltam tabelas. Health pode responder, mas rotas protegidas falham com erro seguro. Não usar para testar conexão.                                                                                                                                    |
| Depois da sétima migration | false | Trigger impede INSERT em ServiceReview; gravação antiga falha fechada, mas leituras voltam ao contrato legado e podem reexpor metadados históricos. Conclusões ainda feitas por backend antigo não criam ReviewWindow. **Não é rollback. Não reabrir leitores nem escritores nesse estado.** |
| Depois da sétima migration | true  | Backend novo usa ParticipantReview, janela de 14 dias e coortes completas. Novos envios exigem declaração de compatibilidade do aplicativo.                                                                                                                                                  |

O aplicativo atualizado mantém formato/payload REST e inclui `X-Omini-Review-Policy: protected-14d-v1` nos envios. É uma capacidade pública de protocolo, igual para todos, não uma credencial ou identificador de usuário. Guards de sessão e participantes continuam obrigatórios.

Com a flag ativa, o backend atualizado responde **426 REVIEW_CLIENT_UPDATE_REQUIRED** antes do repositório para escritores antigos sem esse cabeçalho ou com valor incompatível. O aplicativo novo mostra orientação de atualização e não oferece retry como se fosse erro de rede. Essa barreira evita aceitar um envio cuja tela antiga promete publicação imediata/individual. Não identifica builds criptograficamente; um cliente modificado pode copiar o valor, mas não ganha autorização ou acesso a identidades.

Leituras antigas podem reconhecer o formato básico do agregado, porém não possuem toda a explicação visual da política. Não considerar o aplicativo antigo homologado. Atualizar Expo/bundle no iPhone e conferir revisão **2.6-mobile-r4**, além do cabeçalho em teste de contrato. O código de cancelamentos e seus contratos são preservados.

## Sequência de ativação — somente após autorização

1. Revisar e publicar todo o conjunto da Fase 2.6 (incluindo arquivos novos), obter o hash aprovado e atualizar somente a branch feature/fase-2-6 no Windows. Não misturar arquivos de revisões diferentes.
2. Reservar manutenção. Parar **somente os processos da API e os leitores/escritores de testes**, incluindo instâncias antigas da API, testes manuais/Postman e confirmações de conclusão. Não parar serviços do banco principal ou matar todos os processos Node.
3. Obter backup verificável de OMINI_TEST por DBA autorizado. Registrar contagens e checksums do histórico Prisma fora do Git. Não reexecutar seed: oito categorias e dados existentes devem permanecer como estão.
4. Executar o preflight read-only abaixo como omini_migrator: seis migrations anteriores aplicadas, nenhuma tentativa incompleta, nomes esperados e ausência dos objetos novos. Revisar checksums contra o inventário anterior.
5. Executar status pelo runner protegido. Uma pendência é esperada; somente a sétima migration pode estar pendente. Erro de credencial, conexão, permissão ou histórico é motivo para parar, nunca para trocar a URL por 1433.
6. Com aprovação específica de aplicação, executar deploy; conceder apenas os novos GRANTs com DBA de testes. Não elevar o runtime/migrador a db_owner/db_datawriter para contornar erro.
7. **Ainda sem escritores**, executar consistência e conferir: ServiceReview intacta; cópia legada equivalente inclusive bytes de comentários/datas; contagens antigas iguais; zero novas janelas/notas/coortes antes da primeira inicialização; PKs/índices/constraints presentes e confiáveis. Executar a verificação de permissões como omini_app.
8. Iniciar somente o backend atualizado de testes com flag true e configuração separada. Não passar por um intervalo de funcionamento com flag false: conclusões nesse intervalo não ganhariam janela e não poderão ser recuperadas por backfill retroativo nesta política.
9. Validar login/sessão e rotas reais, não apenas /api/health. Confirmar rejeição do cliente antigo (426, sem gravação), sucesso com cabeçalho e papéis autorizados, anonimato e erros seguros.
10. Atualizar/abrir o bundle novo no iPhone, validar checklist e só então reabrir os escritores de testes. Registrar resultados e hash real antes de declarar homologação.

### PowerShell: atualizar e validar o código publicado

Este bloco só faz sentido **depois de existir publicação autorizada**; a autorização de publicar código não autoriza acesso ou alterações nos bancos.

```powershell
Set-Location C:\projetos\omini
if ((git branch --show-current) -ne 'feature/fase-2-6') { throw 'Branch incorreta.' }
if (git status --porcelain) { throw 'Revisar alterações locais antes de atualizar.' }
git pull --ff-only origin feature/fase-2-6
if ($LASTEXITCODE -ne 0) { throw 'Atualização falhou.' }
npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Instalação falhou.' }
foreach ($ominiCheck in @('typecheck','lint','test','build:api','check:routes','check:secrets')) {
    npm.cmd run $ominiCheck
    if ($LASTEXITCODE -ne 0) { throw "Falhou: $ominiCheck" }
}
npm.cmd run prisma:validate -w @omini/api
if ($LASTEXITCODE -ne 0) { throw 'Prisma inválido.' }
npm.cmd run check:migrations -w @omini/api
if ($LASTEXITCODE -ne 0) { throw 'Verificação estática falhou.' }
```

### PowerShell: acesso e aplicação futura SOMENTE em 15433

Revisar localmente `apps/api/.env.migrations`, ignorado no Git, com MIGRATION_DATABASE_URL do migrador de testes. Não mostrar o conteúdo. `sqlcmd` sem `-P` pede senha sem colocá-la na linha de comando. Os scripts read-only **não foram executados** nesta entrega.

```powershell
Set-Location C:\projetos\omini
sqlcmd -S tcp:127.0.0.1,15433 -d OminiDB -U omini_migrator -C -b `
    -i .\docs\sql\protected-reviews-preflight.sql
if ($LASTEXITCODE -ne 0) { throw 'Preflight falhou; interromper.' }

npm.cmd run db:migrate:status -w @omini/api
# Revisão humana obrigatória: pending pode retornar código não zero.
# Só prosseguir com uma pendência esperada, sem falhas de histórico/configuração.
```

O bloco seguinte é outra etapa, **somente com autorização de aplicação**, não continuação automática do preflight:

```powershell
npm.cmd run db:migrate:deploy -w @omini/api
if ($LASTEXITCODE -ne 0) { throw 'Deploy falhou; preservar evidências e parar.' }
$ominiDba = Read-Host 'Login DBA autorizado na instância de testes'
sqlcmd -S tcp:127.0.0.1,15433 -d OminiDB -U $ominiDba -C -b `
    -i .\docs\sql\protected-reviews-runtime-permissions.sql
if ($LASTEXITCODE -ne 0) { throw 'GRANTs falharam; não abrir escritores.' }
sqlcmd -S tcp:127.0.0.1,15433 -d OminiDB -U omini_migrator -C -b `
    -i .\docs\sql\protected-reviews-consistency.sql
if ($LASTEXITCODE -ne 0) { throw 'Inconsistência; não abrir escritores.' }
sqlcmd -S tcp:127.0.0.1,15433 -d OminiDB -U omini_app -C -b `
    -i .\docs\sql\protected-reviews-runtime-check.sql
if ($LASTEXITCODE -ne 0) { throw 'Permissões divergentes; revisar com DBA.' }
npm.cmd run db:migrate:status -w @omini/api
if ($LASTEXITCODE -ne 0) { throw 'Histórico final requer revisão.' }
```

O preflight é apenas anterior à aplicação; reaplicá-lo depois deve recusar os objetos novos. O verificador de consistência pode ser repetido após uso legítimo: janelas/notas novas deixam de ter contagem zero. Ele não compara automaticamente todas as tabelas antigas ao backup; a comparação com o inventário anterior é uma responsabilidade separada.

### PowerShell: iniciar API e Expo após o corte aprovado

Preparar `apps/api/.env.homologacao`, ignorado no Git, com DATABASE_URL do **omini_app em 127.0.0.1:15433/OminiDB** e segredos JWT locais de testes. Não copiar o migrador para o runtime. Não substituir o `.env` principal.

```powershell
Set-Location C:\projetos\omini\apps\api
$env:NODE_ENV = 'development'
$env:PORT = '3001'
$env:PERSISTENCE_ENABLED = 'true'
$env:AUTH_ENABLED = 'true'
$env:REVIEWS_V2_ENABLED = 'true'
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
node --env-file=.env.homologacao --import tsx src/main.ts
```

A flag forçada faz a configuração recusar um destino principal incorreto antes da conexão. Em outro terminal:

```powershell
Set-Location C:\projetos\omini
ipconfig
$ominiIpv4 = Read-Host 'IPv4 atual do Windows, sem porta ou credenciais'
$env:EXPO_PUBLIC_API_URL = "http://${ominiIpv4}:3001/api"
npm.cmd run dev:mobile -- --clear
```

Usar Expo Go SDK 58, mesma rede e firewall privado para 3001. Manter a API ativa: com o iPhone fechado, o publicador roda no backend a cada 60 s, até 20 janelas vencidas por ciclo. Backlog/falhas podem atrasar liberação; envios novos são bloqueados no instante exato do prazo pelo relógio SQL. A primeira execução ocorre no primeiro ciclo após início, não no lançamento do aplicativo.

## Falha e recuperação: não há rollback automático certificado

- **Antes do deploy:** parar, manter a base intacta e corrigir configuração/artefato; não trocar para a conexão principal.
- **Durante o deploy:** XACT_ABORT/TRY-CATCH devem reverter a transação SQL, mas isso ainda precisa de ensaio real. Verificar objetos, dados e constraints; uma tentativa falha pode continuar no histórico Prisma fora dessa transação. Não declarar rollback pela ausência de uma mensagem de sucesso.
- **Histórico com tentativa falha:** preservar SQL/checksum/log sanitizado e estado real. Somente depois de prova de reversão completa e nova autorização discutir marcar a tentativa como rolled back. Nunca marcar como aplicada uma migration não executada, editar/apagar _prisma_migrations, usar reset ou db push.
- **Deploy aplicado, API/GRANTs falharam:** não abrir escritores. Manter schema, trigger e avaliações; corrigir para frente. Não servir leituras pela projeção legada como fallback. Desligar a flag/voltar o binário não restaura a gravação antiga nem preserva toda a política de visibilidade.
- **Depois de novos envios:** preservar ServiceReview, ParticipantReview, ReviewWindow e ReputationBatch. Não remover trigger, desacoplar/reagrupar coortes, apagar notas, mudar datas ou executar restauração sobre a base ativa. Investigar cópia isolada do backup apenas sob plano e autorização próprios, conciliando dados novos. Preferir correção aditiva para frente.
- **Coorte inconsistente:** a leitura oculta o grupo inteiro; o verificador não repara dados. Restaurar elegibilidade comprovada dos mesmos registros imutáveis pode tornar o grupo inteiro visível outra vez. Não republicar apenas os sobreviventes nem reciclar membros de grupos já publicados.

## Checklist de homologação real

- [ ] SQL nativo: preflight, backup, deploy, GRANTs, consistência, índices/FKs/CHECKs confiáveis e permissões mínimas comprovados em 15433.
- [ ] Checksums das seis migrations e contagens/conteúdo históricos idênticos antes/depois; seed/categorias preservados; nenhuma janela retroativa.
- [ ] Confirmar atomicidade conclusão/evento/janela e concorrência/repetição com dois clientes de API reais.
- [ ] API com flag true: cliente antigo sem capability retorna 426 antes de gravar; novo cliente autorizado recebe recibo próprio; terceiros não acessam.
- [ ] iPhone: login/sessão, duas direções, alvo correto, retorno da Stack, fonte ampliada, VoiceOver, carregamento e erros.
- [ ] Prazo: 409 mostra exatamente “O prazo de 14 dias para avaliar este serviço terminou.”, sem reenvio/retry; erro de rede ainda permite repetir o mesmo conteúdo. Teste acelerado usa relógio de fixture, não relógio/dados do banco.
- [ ] Publicação conjunta e por prazo com backend ativo/mobile fechado; retomada após parada e atraso de filas. Vencimento real exige tempo real ou um ensaio isolado adicional autorizado, sem alterar registros existentes para acelerar.
- [ ] Coortes 5/6/9+, completas, parcialmente inelegíveis, removidas em fixture e restauradas: nunca divulgar sobreviventes, IDs, comentários ou datas. Não deletar dados reais para ensaiar; usar fixtures aprovadas/harness isolado.
- [ ] Regressão de cancelamentos, contato e avaliações bloqueadas em estados finais.
- [ ] Diagnóstico ausente da conta normal; rota interna de desenvolvimento não aparece em produção.

## Antes de qualquer futura implantação principal

Outra autorização expressa e outra configuração revisada serão necessárias. A configuração atual bloqueia a política em produção/1433 deliberadamente; não remover a proteção para reaproveitar estes comandos. Exigir ensaio de recuperação e SQL nativo concluídos, capacidade/monitoramento do publicador, estratégia de atualização/recusa de aplicativos antigos, janela sem escritores antigos, backup recuperável com RPO/RTO definidos, auditoria de papéis/TLS/segredos e conciliação de dados históricos. Aprovar compatibilidade e checksum dos artefatos finais. Não há prova de rollback principal nesta revisão.
