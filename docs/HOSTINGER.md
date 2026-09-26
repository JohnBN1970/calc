# Hostinger runtime — BREBO Calculatie

## Application

Domain: `calculatie.brebobv.nl`

Database:
- engine: MySQL
- host: `localhost`
- database: `u213420663_calc`
- user: `u213420663_calc`

Never store production passwords or secrets in Git.

## Runtime environment

Required variables:

```text
NODE_ENV=production
PORT=<Hostinger assigned port>
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=u213420663_calc
MYSQL_USER=u213420663_calc
MYSQL_PASSWORD=<secret>
OFFICE_API_BASE_URL=https://office.brebobv.nl
BREBO_CALC_SHARED_SECRET=<same dedicated secret as Office>
CALC_SESSION_SECRET=<independent long random secret>
CORS_ORIGIN=https://calculatie.brebobv.nl
```

`BREBO_CALC_SHARED_SECRET` is shared only between Office and Calc.
`CALC_SESSION_SECRET` belongs only to Calc and must be different.

## Hostinger deployment

Use Hostinger's **Deploy Web App / Node.js** flow and point it at the public GitHub repository `JohnBN1970/calc`.

Recommended settings:

```text
Node.js version: 22
Build command: npm run build
Entrypoint: apps/api/dist/startup.js
```

Hostinger installs dependencies as part of the deployment flow. The Hostinger entrypoint deliberately performs:

```text
runtime preflight -> idempotent MySQL migration -> start Node application
```

No manual SSH npm step is required. The migration only uses `CREATE TABLE IF NOT EXISTS`, so restarting the application does not recreate or delete existing calculation data.

The Node process serves both the API and the built React application.

## Smoke checks

1. `GET /api/health` must return status `ok` and database `connected`.
2. Opening the Calc URL directly must not expose a calculation.
3. Open a calculation from BREBO Office using **Open in Calculatie**.
4. The launch URL must be replaced by a clean URL after the token is consumed.
5. Project title/context must come from Office.
6. Save a harmless test line and reopen the calculation from Office.
7. Confirm that the saved line is still present.

Do not remove the Drupal calculation module until this flow has been proven with real production data and the migration strategy has been approved.
