# Nexular Framework

Framework SSR-first experimental inspirado no Angular, com arquitetura modular, signals-first, roteamento file-based, MCP nativo, i18n padrão e segurança reforçada.

**Status:** 🚀 Pre-release 0.1.0 (Production-Ready Core + Enterprise Preview)

**Status dos marcos:**

- ✅ **Q2 2026** - Island Hydration Completed (progressive hydration, performance analytics)
- 🚀 **Q3 2026** - Security & Observability (OpenTelemetry, distributed rate limiting)
- 📅 **Q4 2026+** - Roadmap [em desenvolvimento](ROADMAP.md)

## 🚀 Quick Start

```bash
npm install
npm run build
npm run start
# Abre http://localhost:3000
```

## 🧱 Create App (local, sem npm publish)

Enquanto o pacote ainda nao esta publicado no npm, use o fluxo local:

```bash
npm run build
npm run create -- my-app
cd my-app
npm install
npm run dev
```

Templates disponiveis:

```bash
# base enxuta
npm run create -- my-app --template minimal

# padrao completo
npm run create -- my-app --template full

# completo + plugin auth de exemplo
npm run create -- my-app --template with-auth

# starter oficial com UI showcase + i18n pt/en
npm run create -- my-app --template showcase-i18n
```

Assistentes guiados no CLI:

```bash
nexular setup app --name my-app --template showcase-i18n
nexular setup mcp --transport http --start
```

Opcionalmente, voce pode usar o bin local apos `npm link`:

```bash
# na pasta do framework
npm link

# em qualquer pasta
create-nexular my-app
```

## Scripts

### Framework Core

| Script                              | Descrição                                      |
| ----------------------------------- | ---------------------------------------------- |
| `npm run build`                     | Compila TypeScript para `dist/`                |
| `npm run start`                     | Inicia servidor SSR em `http://localhost:3000` |
| `npm run test`                      | Roda `core + showcase`                         |
| `npm run test:core`                 | Executa suíte de regressão do core             |
| `npm run test:showcase`             | Executa suíte desacoplada do app showcase      |
| `nexular doctor`                    | Diagnóstico de setup e ambiente                |
| `npm run start:template:playground` | Inicia playground local de template            |
| `nexular template playground`       | Inicia playground de template via CLI          |
| `npm run test:watch`                | Roda testes em modo watch                      |
| `npm run test:coverage`             | Testes com cobertura (meta: 80%)               |
| `npm run lint`                      | Lint + type check (sem warnings)               |
| `npm run format`                    | Formata código com Prettier                    |
| `npm run ci`                        | Pipeline CI completo                           |

### App Externa (com NEXULAR_APP_ROOT)

| Comando                                                                                                  | Descrição                                                     |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `npm run build:client`                                                                                   | Build client bundle do framework (`dist/client/main.js`)      |
| `npm run build:client:watch`                                                                             | Watch mode do bundle client do framework                      |
| `NEXULAR_APP_ROOT=/caminho/da/app NODE_ENV=development PORT=4030 node --import tsx src/server/server.ts` | Inicia o servidor SSR do framework apontando para app externa |
| `NEXULAR_SHOWCASE_ROOT=/caminho/da/app npm run test:showcase`                                            | Executa suíte desacoplada contra app externa                  |

### Testes Core vs Showcase

O repositório separa os contratos de teste em duas suítes:

- `core`: valida o framework minimalista desta workspace.
- `showcase`: valida um app de exemplo externo sem acoplamento direto ao core.

Para validar o showcase externo, configure:

```bash
NEXULAR_SHOWCASE_ROOT=/caminho/absoluto/para/nexular-example
npm run test:showcase
```

### Experiência de desenvolvimento

- Em desenvolvimento, o servidor publica um canal SSE em `/_nexular/dev/events`.
- Alterações em `src/` e `dist/` disparam reload automático do browser.
- Erros SSR em dev disparam overlay amigável na página para feedback rápido.
- Use `nexular template playground` para validar templates e contexto com feedback imediato.
- Use `analyzeTemplateDiagnostics` e `renderTemplateWithDiagnostics` para tooling de diagnóstico.

## ✅ Pronto para Produção

### Roteamento & Rendering

- ⚡ **SSR-first** para todas as rotas com streaming de resposta
- 🏝️ **Hydration seletiva** por islands (somente componentes marcados)
- 📁 **File-based routing** via `src/app/routes/**/page.ts`
- 🎯 **Rotas dinâmicas** e catch-all (`[id]`, `[...slug]`) com params tipados
- 📐 **Layouts aninhados** via `layout.ts` na árvore de rotas
- ⚠️ **Error boundaries** por segmento com fallback por ambiente
- 🔄 **Middleware por segmento** com `rewrite`/`redirect`

### Data & Performance

- 📊 **Data fetching** por rota/layout com loaders tipados
- ⏱️ **Cache ISR-like** com `revalidate` por rota
- 📦 **Cache declarativo** para dados/actions com `ttl` customizável
- 🧹 **Invalidacao por rota/tag** com API (`invalidateRouteCache`, `invalidateTagCache`)
- 🔐 **Server Actions tipadas** com validação e autorização

### Islands & Hydration

- 🏝️ **Selective Hydration** - Apenas componentes com `hydrate: "island"` hidratam no cliente
- 📦 **Client Bundle Support** compilado com esbuild
- 🔄 **Dynamic Template Injection** do servidor para componentes com `templateUrl`
- 🌍 **External App Support** com `NEXULAR_APP_ROOT` e `/client` routes customizadas
- 🎯 **Component Registration** para hidratação automática no browser
- ⚡ **Progressive Hydration** - IntersectionObserver-based lazy loading com priority queue
- 📊 **Performance Metrics** - Acompanhe tempos de hidratação em tempo real com `getHydrationMetrics()`
- 🔍 **Hydration Analytics** - Performance scoring e recomendações automáticas

### Segurança (Enterprise)

- 🛡️ **CSRF token-based** com geração em `GET /_nexular/csrf-token`
- 🔐 **Observability endpoint protegido** com token `x-observability-token`
- 📋 **CORS allowlist configurável** por ambiente
- 🔒 **Headers de segurança** completos:
  - HSTS (produção)
  - CSP com directives customizáveis
  - X-Frame-Options, X-Content-Type-Options, Permissions-Policy
- 🔑 **Auth plugins** com HMAC-SHA256 (bearer, api-key, internal-token)
- 🤝 **Trust policy de plugins** com modo `strict|permissive`, denylist e publishers confiáveis
- 🧾 **MCP HTTP hardening** com rate-limit, quotas (SSE/body) e trilha de auditoria
- 🚫 **Rate limiting** por IP (pronto para Redis em distribuído)
- ✍️ **Plugin signature enforcement** em produção (obrigatório em `NODE_ENV=production`)
- 🔍 **Relatórios automáticos de segurança** no CI (`.github/workflows/security.yml`)

### Experiência de desenvolvimento

- 🎨 **Reactivity-first** com Signals (veja `src/app/core/signals/`)
- 🧩 **Decorators** para `@Component` e `@Module`
- 💉 **Dependency injection** com escopos (singleton, transient)
- 🧪 **100+ testes** cobrindo SSR, streaming, routing, actions, auth, MCP e isolamento de plugins
- 📝 **i18n padrão** com locale fallback (pt/en)
- 🤖 **MCP integrado** (codegen, architect, perf, qa)
- 💻 **CLI generators** (component, module, service)

### Qualidade

- ✅ **Coverage 80%+ obrigatório** (Vitest com relatório HTML)
- 🔍 **ESLint + Prettier** pré-configurados
- 📦 **TypeScript strict mode**
- 🚀 **GitHub Actions CI/CD** com múltiplas versões de Node
- 📄 **CHANGELOG + versioning** (SemVer)

## 🏝️ Island Hydration & Client Bundles

Nexular suporta hidratação seletiva de componentes com templates dinâmicos e bundles de cliente customizados.

Fluxo mínimo para app externa:

```bash
# Build do client bundle da app externa
npm run build:client

# Iniciar servidor SSR do framework apontando para a app
NEXULAR_APP_ROOT=/caminho/absoluto/para/app NODE_ENV=development PORT=4030 \
  node --import tsx src/server/server.ts
```

Guia completo (registro de islands, progressive hydration, métricas e troubleshooting):

- [docs/ISLAND_HYDRATION_GUIDE.md](docs/ISLAND_HYDRATION_GUIDE.md)

## 🔐 Security Configuration (Produção)

### 1. Proteger Observabilidade

```bash
# .env.production
NEXULAR_OBSERVABILITY_TOKEN="seu-token-secreto-aleatorio"
NODE_ENV=production
```

```javascript
// Acessar métricas
fetch("/_nexular/observability/auth", {
  headers: { "x-observability-token": "seu-token-secreto-aleatorio" },
});
```

### 2. Habilitar CSRF em Cliente

```javascript
// Antes de invocar action, pegar token
const csrfRes = await fetch('/_nexular/csrf-token');
const { token } = await csrfRes.json();

// Incluir no header da requisição
fetch('/_nexular/action', {
  method: 'POST',
  headers: { 'x-csrf-token': token },
  body: JSON.stringify({ ... })
})
```

### 3. Configurar Plugin Signatures (Produção)

```bash
# Gerar secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# b7c4e9... (copiar)

NEXULAR_SECURITY_REQUIRE_PLUGIN_SIGNATURE=true
NEXULAR_AUTH_PLUGIN_SIGNATURE_SECRET=b7c4e9...
```

```json
// nexular.runtime.json
{
  "production": {
    "security": {
      "requirePluginSignature": true,
      "observabilityToken": "${NEXULAR_OBSERVABILITY_TOKEN}",
      "corsAllowList": ["https://seu-dominio.com"]
    }
  }
}
```

### 4. Rate Limiting & Headers

- Rate limit em memória: 120 requests / 60s por IP
- Headers automáticos em produção: HSTS, CSP, X-XSS-Protection
- Customize CSP em `src/server/server.ts` se necessário

## 🔮 Roadmap

Para roadmap completo e status por trimestre, consulte:

- [ROADMAP.md](ROADMAP.md)

## 📚 Documentação

- [CONTRIBUTING.md](CONTRIBUTING.md) - Como contribuir
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - Código de conduta
- [SECURITY.md](SECURITY.md) - Política de segurança
- [CHANGELOG.md](CHANGELOG.md) - Histórico de versões
- [ROADMAP.md](ROADMAP.md) - Roadmap das próximas entregas (Q3 2026+)
- [DEVELOPMENT.md](DEVELOPMENT.md) - Guia de desenvolvimento
- [docs/ISLAND_HYDRATION_GUIDE.md](docs/ISLAND_HYDRATION_GUIDE.md) - Guia completo de island hydration com progressive hydration e performance analytics
- [docs/NOVO_PADRAO.md](docs/NOVO_PADRAO.md) - Guia completo do novo padrão de templates
- [docs/MCP_HTTP_INTEGRATION.md](docs/MCP_HTTP_INTEGRATION.md) - Guia de integração MCP HTTP

## Migração de Template Legado

Para migrar templates antigos (`*if`, `*for`) para o novo padrão (`@if`, `@for`):

```bash
# preview (sem alterar arquivos)
nexular template migrate-legacy --root ./src

# aplica migração nos arquivos
nexular template migrate-legacy --root ./src --write
```

## 🏗️ Arquitetura

```
src/
├── app/core/         # Features core (signals, DI, decorators, auth, bootstrap)
├── app/modules/      # Módulos de negócio (auth, home, blog)
├── app/routes/       # File-based routes (page.ts, layout.ts, middleware.ts)
├── server/           # SSR runtime (renderer, streaming-ssr, ssr-state, plugin-isolation, file-router)
├── cli/              # CLI generators
└── client/           # Client-side entry

tests/                # Suite de testes (30 arquivos, 189 testes)
```

## 📦 Plugins & Runtime Config

### Built-ins

- `bearer`: Bearer token na header `Authorization: Bearer token`
- `api-key`: API key na header `x-api-key`
- `internal-token`: Token interno na header `x-internal-token`

### Externos

Declare em `nexular.runtime.json`:

```json
{
  "auth": {
    "externalPlugins": [
      {
        "name": "my-plugin",
        "file": "plugins/auth/my-plugin.js",
        "signature": "hash-hmac-sha256" // opcional, obrigatório em produção
      }
    ]
  }
}
```

## 🤖 MCP Commands

```bash
node dist/cli/index.js mcp codegen "criar dashboard"     # Gera blueprint
node dist/cli/index.js mcp architect                     # Analisa padrões
node dist/cli/index.js mcp perf                          # Recomendações de cache
node dist/cli/index.js mcp qa                            # Lacunas de teste
node dist/cli/index.js mcp stdio                         # Transporte MCP via stdio
node dist/cli/index.js mcp http --port 3334             # Transporte MCP via HTTP
node dist/cli/index.js mcp http --auth-bearer token     # HTTP com auth bearer
```

Variáveis de ambiente para MCP HTTP:

```bash
NEXULAR_MCP_HTTP_HOST=127.0.0.1
NEXULAR_MCP_HTTP_PORT=3334
NEXULAR_MCP_HTTP_PATH=/mcp
NEXULAR_MCP_PROJECT_ROOT=/absolute/path/to/project
NEXULAR_MCP_HTTP_BEARER_TOKEN=super-secret-token
NEXULAR_MCP_HTTP_CORS_ENABLED=true
NEXULAR_MCP_HTTP_CORS_ORIGINS=https://ide.example.com,https://agent.example.com
NEXULAR_MCP_HTTP_CORS_METHODS=GET,POST,OPTIONS
NEXULAR_MCP_HTTP_CORS_HEADERS=Content-Type,Authorization
NEXULAR_MCP_HTTP_CORS_CREDENTIALS=false
NEXULAR_MCP_HTTP_RATE_LIMIT_ENABLED=true
NEXULAR_MCP_HTTP_RATE_LIMIT_MAX_REQUESTS=120
NEXULAR_MCP_HTTP_RATE_LIMIT_WINDOW_MS=60000
NEXULAR_MCP_HTTP_MAX_SSE_CLIENTS=250
NEXULAR_MCP_HTTP_MAX_REQUEST_BYTES=1048576
NEXULAR_MCP_HTTP_AUDIT_ENABLED=true
NEXULAR_MCP_HTTP_AUDIT_INCLUDE_HEADERS=false
```

Variáveis de ambiente para SSR & Island Hydration:

```bash
# External app support
NEXULAR_APP_ROOT=/absolute/path/to/external/app

# Server configuration
NODE_ENV=development|production
PORT=3000

# Disable client hydration (debug)
NEXULAR_DISABLE_HYDRATION=false
```

Variáveis de ambiente para trust de plugins externos:

```bash
NEXULAR_SECURITY_PLUGIN_TRUST_MODE=strict
NEXULAR_AUTH_PLUGIN_TRUSTED_PLUGINS=trusted-plugin
NEXULAR_AUTH_PLUGIN_TRUSTED_PUBLISHERS=nexular-labs
NEXULAR_AUTH_PLUGIN_DENYLIST=legacy-plugin
NEXULAR_SECURITY_REQUIRE_PLUGIN_SIGNATURE=true
```

Endpoints MCP HTTP:

- `POST /mcp` para requests JSON-RPC
- `GET /mcp/events` para stream SSE de notifications
- `GET /health` para healthcheck básico
- `GET /ready` para readiness detalhado

## 📄 Licença

MIT © 2026 Nexular Framework Contributors
