# Island Hydration Guide

Guia completo de uso do sistema de hidratação de islands do Nexular Framework com progressive hydration e performance analytics.

## 📖 Conteúdo

1. [Visão Geral](#visão-geral)
2. [Setup Básico](#setup-básico)
3. [Progressive Hydration](#progressive-hydration)
4. [Performance Analytics](#performance-analytics)
5. [Padrões Avançados](#padrões-avançados)
6. [Troubleshooting](#troubleshooting)

---

## Visão Geral

O Nexular Framework suporta **selective island hydration** - apenas componentes marcados com `hydrate: "island"` são hidratados no cliente, melhorando significativamente a performance de pages estáticas.

### Features

- 🏝️ **Selective Hydration** - Hidrate apenas componentes interativos
- 📊 **Progressive Loading** - Lazy-load islands baseado em viewport visibility
- 📈 **Performance Metrics** - Acompanhe tempos de hidratação em tempo real
- ⚡ **Idle Preload** - Carregue scripts com requestIdleCallback
- 🎯 **Priority Queue** - Controle ordem de hidratação por prioridade

---

## Setup Básico

### 1. Marcar Componentes para Hidratação

```typescript
// app/features/forms/components/search-form.component.ts
import { Component } from "nexular-framework/core";

@Component({
  selector: "search-form",
  templateUrl: "./search-form.component.html",
  styleUrls: ["./search-form.component.scss"],
  hydrate: "island", // ← Marca para hidratação
})
export class SearchFormComponent {
  // Component logic
}
```

### 2. Registrar no Client Bundle

```typescript
// app/client/main.ts
import { hydrateIslandsProgressively } from "nexular-framework/core";
import { SearchFormComponent } from "../features/forms/components/search-form.component";
import { CommentFormComponent } from "../features/comments/components/comment-form.component";

const hydrateRegistry = {
  "search-form": SearchFormComponent,
  "comment-form": CommentFormComponent,
};

hydrateIslandsProgressively(hydrateRegistry, {
  // Configurações (veja abaixo)
});
```

### 3. Build Client Bundle

```bash
cd your-app
npm run build:client
```

---

## Progressive Hydration

Progressive Hydration carrega scripts de hidratação sob demanda usando IntersectionObserver.

### Benefícios

- ⚡ Carregamento mais rápido da página (menos JS bloqueando)
- 📱 Melhor experiência em dispositivos lentos
- 💰 Menor uso de banda (não carrega islands invisíveis)
- 🎯 Melhor Core Web Vitals

### Configuração

```typescript
import { hydrateIslandsProgressively } from "nexular-framework/core";

hydrateIslandsProgressively(hydrateRegistry, {
  // Define prioridade de hidratação
  priorityGroups: {
    "search-form": "critical", // Hidrata imediatamente
    "related-items": "high", // Hidrata quando visível
    comments: "normal", // Hidrata quando visível
    "analytics-widget": "low", // Hidrata por último
  },

  // Preload em requestIdleCallback
  preloadOnIdle: true,
});
```

### Prioridades

| Prioridade   | Comportamento                    | Uso                                 |
| ------------ | -------------------------------- | ----------------------------------- |
| **critical** | Hidrata imediatamente            | Componentes essenciais (forms, nav) |
| **high**     | Hidrata quando entra no viewport | Componentes acima da dobra          |
| **normal**   | Hidrata quando entra no viewport | Componentes típicos                 |
| **low**      | Hidrata por último               | Widgets não essenciais              |

### Desabilitar Progressive Hydration

```typescript
import { hydrateIslands } from "nexular-framework/core";

// Hidrato tudo imediatamente
hydrateIslands(hydrateRegistry);
```

Ou via environment:

```html
<script>
  window.__NEXULAR_HYDRATION_DISABLE_PROGRESSIVE = true;
</script>
```

---

## Performance Analytics

### Obter Métricas

```typescript
import { getHydrationMetrics } from "nexular-framework/core";

// Em modo desenvolvimento
if (process.env.NODE_ENV !== "production") {
  setTimeout(() => {
    const metrics = getHydrationMetrics();
    console.log(metrics);

    // Saída:
    // {
    //   totalTime: 245.5,
    //   islandCount: 3,
    //   islandsMetrics: [
    //     { selector: '[data-nx-island-id="..."]', time: 85.2 },
    //     { selector: '[data-nx-island-id="..."]', time: 92.1 },
    //     { selector: '[data-nx-island-id="..."]', time: 68.2 },
    //   ],
    //   progressiveEnabled: true,
    //   firstIslandTime: 68.2,
    // }
  }, 1000);
}
```

### Gerar Relatório de Performance

```typescript
import {
  getHydrationMetrics,
  generatePerformanceReport,
  formatAnalytics,
} from "nexular-framework/core";

const metrics = getHydrationMetrics();
const report = generatePerformanceReport(metrics);

console.log(formatAnalytics(metrics));
// Saída:
// ╔════════════════════════════════════╗
// ║  Island Hydration Performance      ║
// ╚════════════════════════════════════╝
// Total Time:        245.50ms
// Island Count:      3
// Progressive:       ✓ Enabled
// First Island:      68.20ms
//
// Detailed Metrics:
//   1. [data-nx-island-id="search-form"]: 85.20ms
//   2. [data-nx-island-id="comment-form"]: 92.10ms
//   3. [data-nx-island-id="sidebar"]: 68.20ms

console.log(`Grade: ${report.grade}`); // A, B, C, D, F
report.recommendations.forEach((rec) => console.log(`- ${rec}`));
```

### Enviar Métricas para Analytics

```typescript
import { getHydrationMetrics, exportAnalytics } from "nexular-framework/core";

// Enviar para serviço de analytics
const metrics = getHydrationMetrics();
const json = exportAnalytics(metrics);

fetch("/api/analytics/hydration", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: json,
});
```

### Verificar Capabilidades de Hydration

```typescript
// Endpoint do servidor
fetch("/_nexular/hydration/info")
  .then((r) => r.json())
  .then((data) => {
    console.log(data);
    // {
    //   ok: true,
    //   hydration: {
    //     supported: true,
    //     features: {
    //       progressive: true,
    //       metrics: true,
    //       analytics: true,
    //     },
    //     endpoints: {
    //       metrics: "/_nexular/hydration/metrics",
    //       islands: "/_nexular/hydration/islands"
    //     }
    //   }
    // }
  });
```

---

## Padrões Avançados

### Lazy Islands com Asset Preloading

```typescript
hydrateIslandsProgressively(hydrateRegistry, {
  priorityGroups: {
    "main-form": "critical",
    "related-posts": "low",
  },
  preloadOnIdle: true,
});

// Precarrega recursos críticos
if ("requestIdleCallback" in window) {
  requestIdleCallback(() => {
    // Preload image assets
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.href = "/images/related-posts-thumbnail.jpg";
    document.head.appendChild(link);
  });
}
```

### Monitoramento de Hydration em Produção

```typescript
import { getHydrationMetrics } from "nexular-framework/core";

// Enviar métricas após 3 segundos de load
window.addEventListener("load", () => {
  setTimeout(() => {
    const metrics = getHydrationMetrics();

    // Web Vitals tracking
    if (window.gtag) {
      window.gtag("event", "hydration_time", {
        value: Math.round(metrics.totalTime),
        island_count: metrics.islandCount,
      });
    }
  }, 3000);
});
```

### Conditional Hydration

```typescript
// Só hidrate se browser suporta IntersectionObserver
const supportsProgressiveHydration = "IntersectionObserver" in window;

if (supportsProgressiveHydration) {
  hydrateIslandsProgressively(hydrateRegistry);
} else {
  // Fallback para todos menos criticals
  hydrateIslands({ "critical-component": CriticalComponent });
}
```

---

## Troubleshooting

### Form não responde a cliques após hydration

**Problema**: Form foi hidratado mas inputs não funcionam

**Solução**: Verifique se está usando imports corretos (não de core/index):

```typescript
// ❌ Errado
import { formBuilder } from "nexular-framework/dist/app/core/index";

// ✅ Correto
import { formBuilder } from "nexular-framework/dist/app/core/forms";
```

### Hydration lento (> 1s)

**Verificar**:

```typescript
const metrics = getHydrationMetrics();
console.log(metrics.islandsMetrics); // Qual island está lento?

// Se todas estão lentas:
// - Reduza o tamanho das props passadas
// - Divida em múltiplos componentes menores
// - Use lazy loading para data fetching
```

### CORS errors no client bundle

**Problema**: `/client/main.js` retorna 404 ou CORS error

**Verificar**:

```bash
# Verificar se file existe
ls -la app/client/main.js

# Verificar se servidor está servindo /client routes
curl http://localhost:3000/client/main.js

# Se não serve, verificar package.json scripts
npm run build:client
```

### Islands não hidratam

**Checklist**:

1. Componente tem `hydrate: "island"`?
2. Está registrado em `hydrateRegistry`?
3. Client bundle foi buildado? (`npm run build:client`)
4. Browser console sem erros?

```typescript
// Debug no console
console.log(window.__NEXULAR_HYDRATION__); // Deve ter dados
console.log(__hydrationMetrics?.()); // Deve ter métricas
```

---

## próximos passos

- 📊 Integrar com seu analytics platform
- 🚀 Configurar monitoring em produção
- 🎯 Otimizar based on real metrics
- 📱 Testar em dispositivos reais

---

**Documentação**: https://github.com/nexular/framework
**Issues**: https://github.com/nexular/framework/issues
