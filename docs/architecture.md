# Decisões de arquitetura — Fases 1, 2.1 e 2.2

- Monorepo npm workspaces na raiz do repositório conectado. `@omini/shared` contém somente contratos TypeScript; o backend importa tipos, sem depender de TypeScript em runtime após compilação.
- Expo SDK 58 / React Native 0.88 / React 19.3, matriz do SDK e lockfile versionados. Uma única aplicação nativa. Sem PWA, Next.js ou painel administrativo.
- Expo Router com rotas `/client`, `/provider` e `/professional/[id]`. Contexto em memória seleciona experiência; guards do app orientam navegação/perfis, enquanto a autorização real usa JWT e guards no NestJS. Deep links não selecionam um perfil silenciosamente. A seleção demonstrativa é transitória; sessões autenticadas são restauradas por SecureStore conforme a Fase 2.2.
- Catálogo fictício separado em `src/demo`. Busca local pura separada em `src/catalog.ts`; busca normaliza acentos e combina categoria e texto. Solicitações vazias e ações futuras desabilitadas. Sem simular avaliações, pagamentos ou contratação.
- Tema centralizado em verde, creme e âmbar; fonte do sistema, escalonamento de texto, áreas seguras, labels e botões com altura mínima. Navegação precisa de inspeção visual em Android/iOS reais para concluir acessibilidade e ergonomia.
- API NestJS modular. Health não conecta no banco; Swagger usa o mesmo caminho prefixado. Configuração validada antes de abrir porta. CORS por lista explícita; exceções inesperadas retornam mensagem genérica.
- Prisma 6.19.3 com seis entidades de negócio preservadas e três tabelas incrementais de autenticação, migrations e seed de categorias, conforme [Fase 2.1](fase-2-1-persistencia.md). Runtime MSSQL JS opcional; a API não executa migrations e não exige banco em modo demonstrativo.
- Sem infraestrutura de produção nesta fase. A Fase 2.2 adiciona autenticação, sessão e perfis conforme [guia específico](fase-2-2-autenticacao.md). Não implementa contratação, pagamentos, avaliações, push ou geolocalização.
