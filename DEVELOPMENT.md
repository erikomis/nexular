# Development Guide

This guide helps you set up a development environment for contributing to Nexular Framework.

## Prerequisites

- **Node.js** >= 18.0.0 - [Download](https://nodejs.org/)
- **npm** >= 9.0.0 - Comes with Node.js
- **Git** - [Download](https://git-scm.com/)
- **TypeScript** knowledge - Familiarity with TS is helpful

## Initial Setup

### 1. Clone and Install

```bash
git clone https://github.com/nexular/framework.git
cd framework
npm install
```

### 2. Build the Framework

```bash
npm run build
```

This creates `dist/` with compiled TypeScript and client bundles.

### 3. Verify Installation

```bash
npm run test:core
```

All tests should pass ✅

## Development Workflow

### Watch Mode Development

Start three concurrent processes:

```bash
npm run dev
```

This runs:

- `dev:build` - TypeScript compiler in watch mode
- `dev:client` - Client bundle builder in watch mode
- `dev:serve` - SSR server with auto-reload

Any changes to `src/` automatically recompile and reload the browser.

### Running Tests

```bash
# Run all tests (core + showcase)
npm run test

# Run only core framework tests
npm run test:core

# Run showcase contract tests (requires NEXULAR_SHOWCASE_ROOT)
npm run test:showcase

# Run with coverage
npm run test:core:coverage

# Watch mode (auto-run on save)
npm run test:watch
```

### Code Quality

```bash
# Lint and type-check
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting without changing files
npm run format:check

# Full CI pipeline
npm run ci
```

## Project Structure

```
src/
├── app/                    # Example app & core features
│   ├── core/              # Framework core (signals, DI, decorators, auth)
│   ├── modules/           # Example modules
│   ├── routes/            # File-based routes (SSR examples)
│   └── fixtures/          # Shared test fixtures
├── server/                # SSR runtime
│   ├── renderer.ts        # Template rendering engine
│   ├── streaming-ssr.ts   # Streaming response handler
│   ├── ssr-state.ts       # State serialization
│   ├── file-router.ts     # Dynamic route loader
│   ├── plugin-isolation.ts # Plugin sandboxing
│   └── server.ts          # Express setup
├── cli/                   # Command-line tools
│   ├── index.ts           # Main CLI entry
│   ├── create-nexular.ts  # App scaffolding
│   ├── mcp-stdio.ts       # MCP stdio transport
│   └── mcp-http.ts        # MCP HTTP transport
└── client/                # Browser-side code
    └── hydration.ts       # Island hydration system

tests/                     # Test suite
├── core/                  # Framework tests
├── showcase/              # External app tests
└── fixtures/              # Test utilities

docs/                      # Documentation
```

## Key Files

### Framework Entry Points

- **`src/app/core/`** - Core APIs (signals, DI, decorators)
  - `signals/` - Reactive state management
  - `di/` - Dependency injection
  - `component/` + `module/` - `@Component`, `@Module`
  - `forms/` - Form builder and validation
  - `auth/` - Authentication plugins

- **`src/server/`** - SSR runtime
  - `renderer.ts` - Template compilation & rendering
  - `file-router.ts` - File-based routing
  - `server.ts` - Express middleware

- **`src/client/`** - Browser-side hydration
  - `hydration.ts` - Island hydration engine

### Configuration Files

- `tsconfig.json` - TypeScript compiler options
- `vitest.core.config.ts` - Test configuration for core
- `vitest.showcase.config.ts` - Test configuration for external apps
- `.eslintrc.json` - Linting rules
- `.prettierrc` - Code formatting

## Common Development Tasks

### Adding a New Feature

1. Create feature branch:

   ```bash
   git checkout -b feature/my-feature
   ```

2. Write tests first (TDD approach):

   ```bash
   # tests/core/features/my-feature.test.ts
   ```

3. Implement feature:

   ```bash
   # src/app/core/features/my-feature.ts
   ```

4. Verify tests pass:

   ```bash
   npm run test:core
   ```

5. Format and lint:

   ```bash
   npm run format && npm run lint:fix
   ```

6. Commit and push:
   ```bash
   git commit -m "feat(core): add my feature"
   git push origin feature/my-feature
   ```

### Running External App Tests

To test against an external Nexular app (e.g., `nexular-example`):

```bash
# Set app root and run tests
NEXULAR_SHOWCASE_ROOT=/path/to/nexular-example npm run test:showcase
```

This validates framework behavior against real-world apps without direct coupling.

### Building Documentation

Update markdown files in `docs/`:

```bash
# Reformat documentation
npm run format
```

## Debugging

### Debug SSR Rendering

```bash
# Enable verbose logging
DEBUG=nexular:* npm run start
```

### Debug Tests

```bash
# Use Node debugger
node --inspect-brk node_modules/.bin/vitest run
```

Then open `chrome://inspect` in Chrome DevTools.

### Check Template Issues

Use the built-in template diagnostics:

```typescript
import { renderTemplateWithDiagnostics } from "nexular-framework/server/renderer";

const result = await renderTemplateWithDiagnostics(template, context);
console.log(result.errors); // Template errors
console.log(result.warnings); // Potential issues
```

## Performance Profiling

### Measure Hydration Performance

```bash
npm run start
# Visit http://localhost:3000
# Open DevTools > Performance
# Record and analyze
```

### Check Bundle Size

```bash
# Build and report size
npm run build
```

Look at `dist/client/main.js` size in console.

## Git Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation
- `refactor/description` - Code cleanup
- `test/description` - Test additions

### Commit Messages

Follow conventional commits:

```
feat(core): add island hydration support
fix: resolve SSR streaming timeout
docs: update setup guide
refactor: simplify renderer logic
test: add hydration tests
```

### Pull Request Process

1. Ensure all tests pass: `npm run ci`
2. Update documentation if needed
3. Add entry to CHANGELOG.md
4. Open PR with clear description
5. Address review feedback
6. One approval from maintainer before merge

## Troubleshooting

### Build Fails: "Cannot find module"

```bash
# Clear cache and reinstall
rm -rf node_modules dist
npm install
npm run build
```

### Tests Timeout

```bash
# Increase test timeout
npm run test -- --testTimeout=10000
```

### TypeScript Errors

```bash
# Check for type errors
npm run typecheck

# Fix automatically if possible
npm run lint:fix
```

### SSR Returns 500

1. Check server output for stack trace
2. Enable debug mode: `DEBUG=nexular:* npm run start`
3. Check template syntax in `src/app/routes/`
4. Verify component exports are correct

## IDE Setup

### VS Code

1. Install extensions:
   - **ESLint** - `dbaeumer.vscode-eslint`
   - **Prettier** - `esbenp.prettier-vscode`
   - **TypeScript** - Built-in

2. Create `.vscode/settings.json`:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### WebStorm / IntelliJ

1. Enable ESLint: Settings > Languages & Frameworks > TypeScript > ESLint
2. Enable Prettier: Settings > Languages & Frameworks > TypeScript > Prettier

## Resources

- **Framework README**: [README.md](README.md)
- **Contributing Guide**: [CONTRIBUTING.md](CONTRIBUTING.md)
- **Security Policy**: [SECURITY.md](SECURITY.md)
- **Roadmap**: [ROADMAP.md](ROADMAP.md)
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **Vitest Docs**: https://vitest.dev/

## Getting Help

- **Questions?** Open a [Discussion](https://github.com/nexular/framework/discussions)
- **Found a bug?** Create an [Issue](https://github.com/nexular/framework/issues)
- **Have feedback?** Let us know in Discussions

## Next Steps

- Read [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines
- Check [ROADMAP.md](ROADMAP.md) for areas to contribute
- Pick an issue marked `good-first-issue` in the repo

Happy coding! 🚀
