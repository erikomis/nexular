# MCP HTTP Integration Guide

Este guia mostra como integrar clientes externos (IDEs, agentes e automacoes) ao MCP HTTP do Nexular.

## Endpoints

- `POST /mcp` JSON-RPC 2.0 request/response
- `GET /mcp/events` SSE stream de notifications
- `GET /health` liveness simples
- `GET /ready` readiness detalhado (lifecycle, auth, cors, clients)

## Subindo o servidor

Via script:

```bash
npm run start:mcp:http
```

Via CLI:

```bash
nexular mcp http --host 127.0.0.1 --port 3334 --path /mcp
```

## Auth Bearer opcional

Habilite por env:

```bash
NEXULAR_MCP_HTTP_BEARER_TOKEN=super-secret-token
```

Ou por CLI:

```bash
nexular mcp http --auth-bearer super-secret-token
```

Quando habilitado:

- `POST /mcp` exige `Authorization: Bearer <token>`
- `GET /mcp/events` exige `Authorization: Bearer <token>`

## CORS configuravel

Exemplo por env:

```bash
NEXULAR_MCP_HTTP_CORS_ENABLED=true
NEXULAR_MCP_HTTP_CORS_ORIGINS=https://ide.example.com,https://agent.example.com
NEXULAR_MCP_HTTP_CORS_METHODS=GET,POST,OPTIONS
NEXULAR_MCP_HTTP_CORS_HEADERS=Content-Type,Authorization
NEXULAR_MCP_HTTP_CORS_CREDENTIALS=false
```

Exemplo por CLI:

```bash
nexular mcp http \
  --cors-enabled true \
  --cors-origins https://ide.example.com,https://agent.example.com \
  --cors-methods GET,POST,OPTIONS \
  --cors-headers Content-Type,Authorization \
  --cors-credentials false
```

## Hardening: rate-limit, quotas e auditoria

Configuracao por env:

```bash
NEXULAR_MCP_HTTP_RATE_LIMIT_ENABLED=true
NEXULAR_MCP_HTTP_RATE_LIMIT_MAX_REQUESTS=120
NEXULAR_MCP_HTTP_RATE_LIMIT_WINDOW_MS=60000
NEXULAR_MCP_HTTP_MAX_SSE_CLIENTS=250
NEXULAR_MCP_HTTP_MAX_REQUEST_BYTES=1048576
NEXULAR_MCP_HTTP_AUDIT_ENABLED=true
NEXULAR_MCP_HTTP_AUDIT_INCLUDE_HEADERS=false
```

Configuracao por CLI:

```bash
nexular mcp http \
  --rate-limit-enabled true \
  --rate-limit-max-requests 120 \
  --rate-limit-window-ms 60000 \
  --max-sse-clients 250 \
  --max-request-bytes 1048576 \
  --audit-enabled true
```

Com isso ativo:

- excesso de requests MCP retorna `429`
- payload acima da cota retorna `413`
- excesso de clientes SSE retorna `429`
- eventos de seguranca ficam auditaveis via logger

## Fluxo mínimo de cliente MCP

1. `initialize`
2. `notifications/initialized`
3. chamadas de `tools/list`, `tools/call`, `resources/list/read`, `prompts/list/get`
4. escutar `GET /mcp/events` para `notifications/*/list_changed`

## Exemplo cURL

Initialize:

```bash
curl -s http://127.0.0.1:3334/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{
      "protocolVersion":"2025-06-18",
      "capabilities":{},
      "clientInfo":{"name":"curl-client","version":"1.0.0"}
    }
  }'
```

Tools list:

```bash
curl -s http://127.0.0.1:3334/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

SSE events:

```bash
curl -N http://127.0.0.1:3334/mcp/events
```

## Readiness detalhado

```bash
curl -s http://127.0.0.1:3334/ready
```

Campos principais:

- `status`: estado do endpoint (`ready`)
- `mcpLifecycle`: `initialized` e `initializedByClient`
- `auth.enabled`: se bearer esta ativo
- `cors`: configuracao efetiva de CORS
- `clients.sse`: conexoes SSE ativas

## Recomendações para IDE/Agent

- Reutilize conexao SSE para evitar polling.
- Em cenarios sensiveis, habilite bearer e CORS restritivo.
- Em automacao CI, cheque `/ready` antes de enviar requests MCP.
- Trate resposta `202` para notifications sem `id`.
