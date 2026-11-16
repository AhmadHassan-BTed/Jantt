# Security Policy

The Jantt project takes the security of its engine, dependencies, and users seriously.

---

## Supported Versions

We actively support and provide security patches for the following versions:

| Version | Supported | Security Updates |
|---|---|---|
| `1.1.x` | :white_check_mark: Yes | Active security support |
| `1.0.x` | :white_check_mark: Yes | Critical security patches only |
| `< 1.0.0` | :x: No | Unsupported |

---

## Scope

Reports are welcome for:
- The `@jantt/*` packages, the CLI and the playground app.
- **Jantt Cloud**: the Firebase Realtime Database rules ([`database.rules.json`](database.rules.json)) that protect cloud rooms and profiles, and the Cloudflare worker in `worker/`.

The cloud threat model, the rules matrix and its accepted risks are documented in [docs/security.md](docs/security.md#cloud-collaboration--identity-security). A way to read or write data the matrix says you cannot (another user's profile, a room you were not invited to edit, a roster you do not own) is a vulnerability.

---

## Reporting a Vulnerability

If you discover a security vulnerability or potential threat in Jantt, please do **NOT** open a public issue. Instead, please report it privately:

1. **GitHub Security Advisory**: Submit a private report via [GitHub Security Advisories](https://github.com/AhmadHassan-BTed/Jantt/security/advisories/new).
2. **Email**: Send detailed findings to [security@jantt.dev](mailto:security@jantt.dev).

### What to Include
- Detailed description of the vulnerability.
- Minimal reproduction steps, script, or fixture payload.
- Potential impact and threat vector.
- Any proposed fix or mitigation.

### Response SLA
- **Initial Response**: Within 24 hours.
- **Triage & Assessment**: Within 48 hours.
- **Fix & Disclosure Timeline**: Coordinated within 14 days of confirmation.

---

## Security Design Principles

- **Zero Remote Code Execution**: Jantt parses and validates JSON state strictly as declarative data without executing scripts or arbitrary templates.
- **Minimal Runtime Dependencies**: `@jantt/core` depends only on `fflate` (share-link compression), keeping supply-chain risk small.
- **Strict Input Validation**: Every plan the engine loads is checked for schema compliance, malicious loops, and invalid date formats before rendering.
- **Server-Side Enforcement for Cloud Data**: Access to Jantt Cloud data is decided only by the database rules; client-side checks are UX conveniences and are never relied on for security.
