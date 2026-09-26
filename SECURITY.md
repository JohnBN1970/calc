# Security policy

## Public repository

This repository is public by design. Treat every committed byte as internet-visible.

## Never commit

- production credentials
- API tokens
- SSH keys
- database credentials or connection strings with secrets
- customer, resident, employee or project data
- database dumps
- private Office endpoints containing credentials
- production logs containing personal or confidential data

## Runtime configuration

Production secrets must be supplied through the deployment environment or an approved secret store.

The application may contain `.env.example` and development placeholders, but never real credentials.

## Data boundary

BREBO Calculatie must not read or write the BREBO Office database directly.

All Office data access must pass through a versioned Office API with explicit authorization and least-privilege scopes.

## Reporting

Security findings must be handled privately and must not include production secrets in public GitHub issues.
