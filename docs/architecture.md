# Decisões da Fase 1

- Monorepo npm workspaces na raiz do repositório conectado. `@omini/shared` contém somente contratos TypeScript; o backend importa tipos, sem depender de TypeScript em runtime após compilação.
- Expo SDK 58 / React Native 0.88 / React 19.3, matriz do SDK e lockfile versionados. Uma única aplicação nativa. Sem PWA, Next.js ou painel administrativo.
- Expo Router com rotas `/client`, `/provider` e `/professional/[id]`. Contexto em memória seleciona experiência; guards são somente de navegação, nunca autenticação/autorização. Deep links não selecionam um perfil silenciosamente. Estado não persiste após reinício.
- Catálogo fictício separado em `src/demo`. Busca local pura separada em `src/catalog.ts`; busca normaliza acentos e combina categoria e texto. Solicitações vazias e ações futuras desabilitadas. Sem simular avaliações, pagamentos ou contratação.
- Tema centralizado em verde, creme e âmbar; fonte do sistema, escalonamento de texto, áreas seguras, labels e botões com altura mínima. Navegação precisa de inspeção visual em Android/iOS reais para concluir acessibilidade e ergonomia.
- API NestJS modular. Health não conecta no banco; Swagger usa o mesmo caminho prefixado. Configuração validada antes de abrir porta. CORS por lista explícita; exceções inesperadas retornam mensagem genérica.
- Prisma 6 com datasource SQL Server e nenhum modelo. Sem PrismaService inicializado e sem migrations. Teste futuro de conexão usa SELECT 1.
- Sem infraestrutura de produção nesta fase. Nenhuma autenticação, banco de negócio, segredos, push, geolocalização ou Fase 2 foi implementada.
