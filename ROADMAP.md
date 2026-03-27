# Nexular Framework - Roadmap

> This roadmap outlines planned features and improvements for the Nexular Framework. Items are organized by:
>
> - **Planned** - Next release cycle
> - **In Progress** - Currently being worked on
> - **Research** - Under exploration or design phase
> - **Future** - Someday goals, not yet scheduled

Help us prioritize by [opening a discussion](https://github.com/nexular/framework/discussions) with your use cases and feedback.

---

## 🚀 Q2 2026 - Hydration & Islands Stabilization ✅ COMPLETED

### Completed

- [x] **Island Hydration End-to-End** - Complete client-side component hydration with template injection
  - Framework modifications to support `templateUrl` components in browser context
  - External app client bundle generation with esbuild
  - Template server injection into hydration payloads
  - Component registration and lazy hydration

- [x] **Progressive Hydration** - Load hydration scripts based on viewport visibility
  - IntersectionObserver-based lazy loading for islands
  - Priority-based hydration queue (critical, high, normal, low)
  - Deferred hydration for below-fold components
  - requestIdleCallback preloading on idle

- [x] **Hydration Performance Analysis** - Tools to measure and optimize hydration cost
  - Real-time hydration timing metrics
  - Per-island performance tracking
  - Automatic performance scoring & recommendations
  - `getHydrationMetrics()` API for client-side metrics
  - `/_nexular/hydration/info` endpoint for hydration capabilities
  - Hydration time metrics
  - Bundle size analysis
  - Unused component detection

- [ ] **Component Metadata Extraction** - Automated metadata generation for islands
  - Type extraction from TypeScript
  - Serializable prop validation
  - Error handling for complex types

---

## 🛡️ Q3 2026 - Security & Observability Hardening

### Planned

- [ ] **OpenTelemetry Integration** - Native distributed tracing and metrics
  - Automatic span generation for SSR
  - Route-level performance traces
  - Custom metric collection helpers
  - Integration with Datadog, New Relic, Jaeger

- [ ] **Advanced Rate Limiting** - Redis-backed distributed rate limiting
  - Redis adapter for persistent state
  - User-level rate limiting
  - Endpoint-specific quotas
  - Sliding window algorithm

- [ ] **Plugin Sandbox Hardening** - Enhanced security isolation for plugins
  - V8 Isolate-based sandboxing (experimental)
  - Resource limits (CPU, memory, timeouts)
  - Capability-based permission model
  - Audit log for privileged operations

- [ ] **OWASP Security Compliance** - Comprehensive security standards
  - Automated OWASP Top 10 checks
  - Security Headers cookbook
  - XSS protection enhancements
  - SQL injection prevention helpers

---

## 📊 Q4 2026 - Developer Experience & Tooling

### Planned

- [ ] **Storybook Integration** - Official component showcase and documentation
  - Auto-discovery of components
  - Interactive playground
  - Props documentation
  - Story-based testing

- [ ] **Advanced Diagnostics** - IDE-like error reporting for templates
  - Real-time template parsing errors
  - Type checking in template bindings
  - Performance warnings
  - Accessibility checks

- [ ] **Admin Dashboard** - Built-in framework observability UI
  - Real-time request monitoring
  - Performance graphs
  - Cache hit rates
  - Error tracking
  - Plugin management interface

- [ ] **CLI Enhancement** - More powerful generators and tools
  - Entity generator (scaffold CRUD routes + components)
  - Migration generator for framework updates
  - Code scaffolding for common patterns
  - Interactive setup wizard

- [ ] **API Documentation Generator** - Automatic OpenAPI/GraphQL docs
  - Server action introspection
  - Type-safe client SDK generation
  - Interactive API explorer

---

## 🔗 2027 - Advanced Data Layer & ORM

### Research & Planning

- [ ] **Database Adapters** - Official ORM integration layer
  - Prisma adapter
  - TypeORM adapter
  - Drizzle adapter
  - Query builder helpers

- [ ] **GraphQL Support**
  - Native GraphQL server integration
  - Apollo Server support
  - Automatic type generation from schema
  - DataLoader integration for batch queries

- [ ] **Real-time Features** - WebSocket & Server-Sent Events
  - Built-in WebSocket server
  - Automatic connection management
  - Broadcasting helpers
  - Real-time form validation

- [ ] **File Upload & Processing**
  - Multipart form handling
  - Image optimization pipeline
  - Virus scanning integration
  - S3/cloud storage adapters

---

## ☁️ 2027 - Edge & Serverless

### Research & Planning

- [ ] **Edge Computing Support**
  - Vercel Edge Functions adapter
  - Cloudflare Workers support
  - Netlify Edge Functions adapter
  - Automatic edge deployment insights

- [ ] **Serverless Optimization**
  - Cold start reduction
  - Bundle size optimization for Lambda
  - Container image builder
  - Deployment guides for AWS, Azure, GCP

- [ ] **Streaming & Progressive Rendering**
  - Enhanced streaming SSR
  - Suspense-like async component support
  - Progressive enhancement patterns
  - Skeleton screen helpers

---

## 🧪 Ongoing - Quality & Performance

### Always In Progress

- [ ] **Test Coverage** - Maintain 80%+ coverage
  - Core framework tests
  - Integration tests with plugins
  - End-to-end test suite
  - Performance regression tests

- [ ] **Performance Optimization**
  - Bundle size reduction
  - Hydration performance tracking
  - Cache hit ratio improvements
  - Rendering speed benchmarks

- [ ] **Documentation**
  - Migration guides
  - Performance tuning guide
  - Plugin development guide
  - Architecture deep-dives

- [ ] **Dependencies**
  - Monthly security audits
  - Dependency updates
  - Major version compatibility
  - Breaking change documentation

---

## 🤝 Community Contributions Welcome

We encourage community contributions in these areas:

### High Priority

- **Testing** - Add tests for edge cases, error scenarios
- **Documentation** - Write guides, tutorials, examples
- **Template Refactoring** - Migrate legacy templates to control flow syntax
- **Example Apps** - Build showcase apps (e-commerce, blog, SaaS)
- **Performance** - Identify and fix bottlenecks

### Medium Priority

- **CLI Tools** - Add new generators and utilities
- **Plugin Development** - Create useful plugins (auth, cache, etc)
- **Integrations** - Cloud provider adapters, monitoring tools
- **DevTools** - VSCode extensions, browser DevTools

### Research Areas

- **Alternative Runtimes** - Deno, Bun support
- **Meta-frameworks** - Full-stack patterns on top of Nexular
- **Deployment** - Platform-specific optimization
- **Tooling** - Build tools, dev servers, diagnostics

---

## 📅 Release Timeline

| Version   | Target  | Focus                                                        |
| --------- | ------- | ------------------------------------------------------------ |
| **0.1.0** | Q1 2026 | Core SSR, file-based routing, signals, MCP                   |
| **0.2.0** | Q2 2026 | Island hydration, template injection, client bundles         |
| **0.3.0** | Q3 2026 | OpenTelemetry, distributed rate limiting, security hardening |
| **0.4.0** | Q4 2026 | Storybook, admin dashboard, CLI enhancement                  |
| **0.5.0** | Q1 2027 | Database adapters, GraphQL, real-time                        |
| **1.0.0** | Q2 2027 | Stable API, comprehensive docs, edge support                 |

---

## 🙋 How to Influence the Roadmap

1. **Vote on existing issues** - Add reactions to show importance
2. **Open Discussions** - Share your use cases and needs
3. **Contribute** - Submit PRs for roadmap items
4. **Provide Feedback** - Comment on PRs and RFCs
5. **Sponsor** - Support core team development

---

## Latest Updates

- **2026-03-27**: Added island hydration and Q2 roadmap focus
- **2026-03-01**: Initial roadmap with core features
