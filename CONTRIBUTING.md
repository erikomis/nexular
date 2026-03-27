# Contributing to Nexular Framework

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the Nexular Framework.

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please read our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before contributing.

## How to Contribute

### Reporting Bugs

1. **Check existing issues** to avoid duplicates
2. **Provide a clear description** with steps to reproduce
3. **Include minimal reproduction** code if possible
4. **Specify environment:** OS, Node version, Nexular version
5. **Attach error messages** and logs

### Suggesting Enhancements

1. **Use GitHub Discussions** for feature requests and architecture discussions
2. **Describe the use case** and expected behavior
3. **Provide examples** or mockups if applicable
4. **Consider backward compatibility**

### Code Contributions

#### Setup

```bash
git clone https://github.com/nexular/framework.git
cd framework
npm install
npm run build
npm run test:core
```

#### Creating a Pull Request

1. **Fork the repository** and create a feature branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

   For bug fixes, prefer:

   ```bash
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes** following the code style guide (below)

3. **Test your changes:**

   ```bash
   npm run lint
   npm run typecheck
   npm run test:core
   npm run build
   ```

4. **Commit with clear messages:**

   ```bash
   git commit -m "feat(scope): short description"
   ```

5. **Push and open a PR:**

   ```bash
   git push origin feature/your-feature-name
   ```

6. **Wait for review** from maintainers and keep the branch updated if requested

#### Code Style

- **TypeScript** - Use strict mode and type annotations
- **Formatting** - Run `npm run format` before committing
- **Linting** - Fix issues with `npm run lint`
- **Testing** - Include tests for new features/fixes
- **Comments** - Prefer clear code over extensive comments

#### Pull Request Checklist

Before opening your PR, make sure all items below are true:

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test:core` passes
- [ ] `npm run build` passes
- [ ] New/changed behavior is covered by tests
- [ ] `README.md` and docs are updated when behavior changes
- [ ] No secrets, credentials, or private keys are committed

#### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`

Example:

```
feat(auth): add HMAC plugin signature validation

- Replace hash-based signatures with HMAC-SHA256
- Add production-enforced signature requirement
- Update plugin loader and runtime config

Closes #42
```

### Documentation Contributions

- Update `README.md` for major features
- Add comments/docs for public APIs when needed
- Document new environment variables
- Include architecture diagrams for complex features

## Development Workflow

### Commands

```bash
npm run build         # Compile TypeScript
npm run test:core     # Run core tests
npm run test:showcase # Run showcase tests (requires external app)
npm run lint          # Check code style
npm run format        # Format code
npm run typecheck     # Type checking
```

### Testing Requirements

- Minimum 80% code coverage
- All tests must pass before merge
- Add tests for new features/fixes
- Use descriptive test names

For showcase validation against external app:

```bash
NEXULAR_SHOWCASE_ROOT=/caminho/absoluto/para/nexular-example npm run test:showcase
```

### Performance

- Monitor bundle size impacts
- Profile SSR rendering performance
- Cache strategy implications must be documented
- Rate limiting and memory usage should be tracked

## Release Process

1. Maintainers review and merge PRs
2. Changes are collected for next release
3. Version is bumped following SemVer
4. Changelog is updated
5. Release notes are written
6. Package is published to npm

## Getting Help

- **Issues**: Use GitHub Issues for bug reports
- **Discussions**: Use GitHub Discussions for questions
- **Security**: Use private disclosure flow in `SECURITY.md`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for making Nexular Framework better! 🚀
