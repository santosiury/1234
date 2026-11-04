# Configuração proposta para a nuvem

O projeto substitui o antigo site estático. As instruções antigas de servidor Python não se aplicam ao Omini.

Checkout existente: `/workspace/1234`. As tarefas já são isoladas; não crie worktrees sem pedido explícito. Node >=22.13. Na raiz: `npm ci` se precisar restaurar dependências; `npm run dev:api` e, em outro terminal persistente, `npm run dev:mobile`. Processos precisam ser reiniciados após restauração. Verifique `/api/health` e o bundle Metro. Não use loopback da nuvem como endereço de API de um celular físico.

Rede adicional necessária: `binaries.prisma.sh` para engines/checksums do Prisma e `api.expo.dev` para consultas online do Expo. Preserve as permissões existentes. Não remova validação TLS/checksum. A verificação offline do Expo usa apenas a matriz local instalada.

A tentativa de salvar essas instruções e domínios no draft da plataforma retornou `draft_not_editable`; persistência não foi confirmada. Este arquivo preserva a proposta para configuração posterior. Isso não bloqueia o uso dos comandos do repositório, mas impede afirmar que a configuração automática da nuvem foi atualizada.
