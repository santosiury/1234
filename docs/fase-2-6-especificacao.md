# Omini — Especificação proposta da Fase 2.6

Status: **escopo funcional aprovado pelo responsável em 21/11/2026; implementação pendente**. Documento de planejamento, **não** equivale a código entregue ou migration aplicada.

Base técnica: continuidade da branch `feature/fase-2-5-contato-avaliacoes` (NestJS + Prisma/SQL Server, React Native/Expo SDK 58). Omini mantém contratação direta entre cliente e prestador; sem comissão, gerenciamento de orçamentos ou pagamentos dos serviços. A Fase 2.5 deve ser concluída e revista antes do rollout.

## 1. Encerramento motivado de solicitação por falta de acordo

### Problema
Na Fase 2.5, `cancel` é permitido somente ao **cliente** em `REQUESTED` e `ACCEPTED`. Depois de `start`, o estado `IN_PROGRESS` não admite cancelamento motivado; tampouco há ação para o prestador encerrar um aceite sem acordo. Aceitar indica interesse em conversar, e **não** significa preço ou condições acordados. O estado `IN_PROGRESS` pode ter sido acionado antes do acordo.

### Escopo aprovado
- Oferecer **Encerrar atendimento** a cliente e prestador para negociações sem acordo **após aceite**, inclusive se a solicitação já estiver em `IN_PROGRESS`, sujeito às regras de proteção abaixo.
- Apresentar **um único motivo selecionável** (radio buttons ou seletor de escolha única), nunca checklist múltiplo.
- Se selecionado **Outro motivo**, exibir campo livre obrigatório com **10 a 500 caracteres**, aparado, normalizado e validado também no backend.
- Motivo aprovado/selecionado na prévia: **“Não chegamos a um acordo sobre o valor”**. Ele deve existir como **primeira opção**; no formulário real, não pré-selecionar motivo, para assegurar escolha consciente.
- Exigir confirmação explícita antes de registrar a transição, com aviso de que o atendimento será encerrado, não concluído.
- Registrar ator, motivo estruturado, texto complementar quando aplicável e data/hora confiável em histórico acessível aos participantes. Não disponibilizar motivo ou relato em catálogo e avaliações públicas.
- Notificar/atualizar a outra parte **pelos mecanismos de atualização existentes**, sem pressupor push remoto.
- Ao encerrar: impedir novas consultas ao telefone, remover botões WhatsApp/Ligar, preservar histórico e impedir novas avaliações para solicitações não concluídas. Não apagar contato que a outra pessoa já obteve fora do app.
- Manter `COMPLETED` exclusivo para confirmação real de conclusão pelo cliente. Não converter encerramento por desacordo em `COMPLETED`, não gerar evento fictício de conclusão e não afetar avaliações históricas válidas.

### Motivos do CLIENTE (escolha única)
| Código proposto | Rótulo aprovado |
| --- | --- |
| `NO_PRICE_AGREEMENT` | **Não chegamos a um acordo sobre o valor** |
| `DEADLINE_NOT_SUITABLE` | O prazo não atende à minha necessidade |
| `SERVICE_MISMATCH` | O serviço oferecido não corresponde ao solicitado |
| `PROVIDER_UNAVAILABLE` | O profissional não poderá realizar o atendimento |
| `NO_LONGER_NEEDED` | Não preciso mais do serviço |
| `OTHER_TERMS_NO_AGREEMENT` | Não chegamos a um acordo sobre as condições |
| `OTHER` | Outro motivo (explicação obrigatória) |

### Motivos propostos para o PRESTADOR (a revisar na implementação)
| Código proposto | Rótulo sugerido |
| --- | --- |
| `NO_PRICE_AGREEMENT` | Não chegamos a um acordo sobre o valor |
| `SCOPE_MISMATCH` | O serviço solicitado está fora do escopo combinado |
| `SCHEDULE_CONFLICT` | Não conseguimos combinar data ou horário |
| `UNABLE_TO_PERFORM` | Não poderei realizar o serviço |
| `OTHER_TERMS_NO_AGREEMENT` | Não chegamos a um acordo sobre as condições |
| `OTHER` | Outro motivo (explicação obrigatória) |

### Estados e proteção contra encerramentos indevidos
- Candidatos à transição: `ACCEPTED` e `IN_PROGRESS`. `REQUESTED` mantém a rejeição/cancelamento atual, com compatibilidade retroativa a revisar.
- Considerar reutilizar `CANCELLED` com razão/ator estruturados para permitir migração compatível; **decidir o desenho antes de implementar**, comparando semântica com `REJECTED` e o histórico atual. Não criar estado novo apenas por preferência visual.
- Em `IN_PROGRESS`, perguntar se **houve execução efetiva, parcial ou entrega**. Quando houve trabalho executado ou divergência sobre isso, **não** encerrar automaticamente como simples "sem acordo"; preparar tratamento diferenciado de interrupção/pendência e deixar o caso fora do fluxo simplificado até definição de produto. A resposta não deve funcionar como prova definitiva de execução.
- `AWAITING_CONFIRMATION`, `COMPLETED`, `CANCELLED` e `REJECTED` não podem ser encerrados por esta ação simplificada. Preservar o fluxo atual de confirmação/reabertura.
- Autorizar apenas participantes originais com perfis/contas ativos; validar estado e versão do registro no servidor com transação serializável, idempotency key, trilha de auditoria e sem duplicar eventos.
- Sanitizar texto livre: impedir HTML, dados de contato/PII evidentes, URLs e caracteres de controle, com mensagens de validação úteis. Preservar privacidade dos registros.
- Definir o comportamento de desistência sem acordo versus cancelamento comum, para não confundir métricas e reputação.

### Alterações técnicas planejadas (não implementadas)
- **shared**: ação/transições, motivo tipado, rótulos, campos de leitura compatíveis.
- **API**: validação estrita do motivo, transição autorizada e idempotente, persistência de evento e resposta sem exposição de PII; manter contrato das rotas históricas ou versionar mudanças incompatíveis.
- **SQL Server**: avaliar se bastam campos/eventos históricos existentes; se campos adicionais forem necessários, criar migration **aditiva**, jamais editar migrations já aplicadas nem resetar dados.
- **Mobile**: botão condicionado ao estado/perfil, formulário de seleção única, campo Outro, confirmação, resposta segura a falha de rede/repetição, refresh do histórico, acessibilidade e estados vazios.
- **Testes**: transições elegíveis/negadas, concorrência, múltiplos toques, idempotência, revogação de acesso ao contato, não elegibilidade para avaliação, datas/histórico, perfis adversários, texto inválido, app iPhone e Android.

## 2. Reputação e avaliação visual no estilo Uber

### Requisitos aprovados
- Exibir média real e quantidade no card de busca e perfil do prestador: **⭐ 4,9 (127 avaliações)** como **exemplo ilustrativo**, nunca valor fixo.
- Exibir a seleção de 1 a 5 estrelas como affordance clara ao cliente após a conclusão; manter opção de avaliar posteriormente pelo histórico, sem obrigar o cliente e sem modal intrusivo.
- Mostrar nota e contagem obtidas da API de avaliações reais; **nenhuma nota fictícia**. Para zero avaliações, mostrar "Ainda não há avaliações", sem `0,0` ou estrela sugerindo reputação.
- Apresentar média com uma casa decimal no padrão pt-BR (`4,9`, `5,0`). Média calculada no backend sobre registros válidos existentes; mobile apenas formata.
- Manter comentários, datas, paginação e pseudônimo público existentes; sem telefone, e-mail ou IDs privados nos cards.
- Manter regra da Fase 2.5: **uma avaliação imutável por solicitação validamente `COMPLETED`**, com `confirm-completion` autêntico; publicação idempotente, diferenças retornam HTTP 409.
- Não permitir avaliação para `CANCELLED`, `REJECTED`, `IN_PROGRESS` ou solicitações encerradas por falta de acordo.

### Pontos de UI
1. Card de resultado de busca e perfil público: estrela pequena + nota + contagem clicável/âncora para comentários.
2. Detalhe concluído: convite voluntário "Avalie o atendimento"; ao tocar, tela intuitiva de 1..5 estrelas, comentário opcional, botão de publicar, confirmação da imutabilidade.
3. Painel do prestador: média/contagem e avaliações recebidas coerentes com o perfil público.
4. Estados: sem avaliações, carregando, offline, erro, paginação e grande fonte; áreas de toque acessíveis.

### Testes de aceitação
- Cadastrar duas avaliações de teste 5 e 4 estrelas em solicitações válidas distintas -> média 4,5 e total 2 no catálogo, perfil público e painel.
- Duas notas 5 -> média 5,0; total 2. Média nunca hardcoded.
- Sem avaliações -> estado vazio sem nota inventada.
- Após publicar -> formulário indisponível no mesmo pedido; reenvio igual retorna original e diferente retorna 409.
- Encerramento por desacordo não abre avaliação.
- Conferir formatação pt-BR, acessibilidade e layout em iPhone/Android.

## 3. Sequência e critérios de entrega
1. Revisão das regras de estados e do tratamento de trabalho parcialmente executado, sem quebrar Fase 2.4/2.5.
2. Especificação de modelos, contratos e migrations aditivas, se indispensáveis.
3. Implementação backend + testes de autorização, concorrência, imutabilidade e integridade.
4. Implementação mobile do encerramento motivado e da reputação visual, com QA em iPhone/Android.
5. **Primeiro**: validação em `OMINI_TEST` (`localhost\\OMINI_TEST`, porta 15433), preservando a instância/banco principal (`localhost\\OMINI`, porta 1433). Confirmar permissões SQL, backup, status das migrations e dados históricos.
6. Somente depois de revisão e aprovação expressa do responsável, planejar implantação na base principal. Este documento não concede autorização para migrar, resetar, editar ou conectar a base principal.

### Fora do escopo aprovado até nova decisão
- Pagamentos, reembolsos e comissões; moderação/denúncias completas; avaliação prestador -> cliente; notificações push garantidas; resolução formal de disputas por trabalho parcialmente executado; novos planos de assinatura.
