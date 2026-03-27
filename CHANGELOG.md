# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Progressive island hydration with IntersectionObserver and priority queue
- Hydration performance metrics API (`getHydrationMetrics`)
- Hydration analytics/report helpers with recommendation scoring
- Hydration capability endpoint (`GET /_nexular/hydration/info`)
- CSRF token generation and validation
- Observability endpoint authentication
- Comprehensive security headers (HSTS, CSP, Permissions-Policy)
- HMAC-based plugin signature validation
- Plugin signature enforcement in production
- CORS allowlist configuration
- Runtime security configuration
- ESLint and Prettier configuration
- GitHub Actions CI/CD workflows
- Code of Conduct and Security Policy
- Contributing guidelines
- Coverage targets (80% minimum)

### Changed

- Forms module unified with canonical implementation in `src/app/core/forms/index.ts`
- `src/app/core/forms.ts` converted to compatibility entrypoint (re-export)
- README and docs updated for external app SSR + hydration flow
- Improved rate limiting infrastructure for distributed systems
- Enhanced auth plugin loader with HMAC signatures
- Security config integrated into runtime configuration
- Runtime config validation on bootstrap

### Fixed

- External app static client serving now resolves `app/client` correctly
- Compression middleware exclusions for `/api`, `/client`, and `/assets`
- SSR mixed src/dist runtime bridge for i18n token resolution
- Plugin path resolution for external plugins
- CommonJS plugin export shape handling

## [0.1.0] - 2026-03-26

### Added

- Initial framework scaffold
- SSR-first architecture with hydration
- Signals-based reactivity system
- Decorators for components and modules
- Dependency injection container
- File-based routing with dynamic/catch-all routes
- Server actions with typed input/output
- Dynamic route loaders with caching
- Error boundaries per route segment
- Route middleware with rewrite/redirect
- MCP integration (codegen, architect, perf, qa)
- i18n service with locale fallback
- Client action SDK with optimistic updates
- Auth plugins system (bearer, api-key, internal-token)
- External plugin loading with whitelist
- CLI with generators and MCP commands
- Comprehensive test suite with 45+ tests
- TypeScript strict mode configuration

---

### Legend

- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes
