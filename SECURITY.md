# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the Nexular Framework, please **do not** open a public GitHub issue.

Instead, please follow these steps:

1. **Email us directly** at `security@nexular-framework.dev` with:
   - Description of the vulnerability
   - Steps to reproduce (if applicable)
   - Potential impact
   - Your suggested fix (if available)

2. **Include the following details:**
   - Nexular Framework version affected
   - Operating system and environment details
   - Any relevant logs or error messages

3. **Timeline:**
   - We will acknowledge receipt within 48 hours
   - We aim to investigate and develop a fix within 7 days
   - We will provide a security patch release as soon as possible

## Security Best Practices

### For Developers Using Nexular

- Always keep dependencies updated via `npm audit fix`
- Use security headers as configured in production mode (HSTS, CSP)
- Protect the observability endpoint (`/_nexular/observability/auth`) with a strong token
- Enable CSRF protection by requesting tokens from `/_nexular/csrf-token`
- Use HMAC-signed plugins in production environments
- Regularly review auth plugin whitelists and rotations
- Store secrets in environment variables, never commit to repository

### For Framework Contributors

- All pull requests are reviewed for security implications
- Sensitive changes require peer review from maintainers
- External dependencies are audited before merge
- Security-related contributions are fast-tracked

## Known Security Considerations

1. **SSR Hydration**: Payment/credential data should never be included in hydration payloads
2. **Auth Plugins**: Only load plugins from trusted sources; validate signatures in production
3. **Rate Limiting**: In-memory rate limiting does not scale horizontally; use Redis for distributed systems
4. **Environment Config**: Sensitive values in `nexular.runtime.json` must be protected (not versioned)

## Supported Versions

| Version | Status      | Security Support Until |
| ------- | ----------- | ---------------------- |
| 0.x.x   | Pre-release | Not yet determined     |

Security patches will be released for the latest stable version.

## Contact

- **Security**: security@nexular-framework.dev
- **General**: hello@nexular-framework.dev
