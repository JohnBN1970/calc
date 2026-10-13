# BREBO Calculatie

BREBO Calculatie is de gespecialiseerde calculatiewerkbank voor BREBO.

## Hoofdprincipe

- **BREBO Office is de centrale databron en eigenaar van projectcontext.**
- **BREBO Calculatie is de interactieve werkbank voor calculeren.**
- Vastgestelde calculatieversies worden via een expliciet API-contract teruggeleverd aan Office.
- Er is geen directe databasekoppeling tussen Calculatie en Office.
- De huidige Drupal-calculatiemodule blijft bestaan totdat deze applicatie productieproof is.

## Doelarchitectuur

- Frontend: React + TypeScript (Vite)
- Backend/API: Node.js 22 + Express 5 (TypeScript)
- Database: MySQL (`mysql2`)
- Authenticatie: ondertekende Office-launch, gevolgd door HttpOnly Calc-sessiecookie; geen zelfstandige Calc-login
- Gebruikersroute (doel): de bestaande BREBO Office-host, onder de Office-calculatiemodule
- Runtime: Hostinger Node.js/Passenger via root `startup.js`

## Repositories

- `calc` — calculatiewerkbank
- `mjop` — MJOP-werkbank
- `plan` — planningswerkbank

Deze drie applicaties moeten dezelfde BREBO look & feel, navigatieprincipes, authenticatie en Office-integratie gebruiken.

## Security

Deze repository is openbaar. Nooit secrets, klantdata, productiedumps, tokens, wachtwoorden of private sleutels committen. Zie [SECURITY.md](SECURITY.md).


## Integratie binnen BREBO Office (besluit 13 oktober 2026)

Calc blijft technisch een afzonderlijke Node/React-rekenmotor, maar krijgt **geen afzonderlijk zichtbaar gebruikersdomein**. De bestaande Office-login, projectcontext en calculatierechten zijn leidend. Het publieke Office-adres en de exacte proxy-prefix moeten eerst tegen de zelfstandige Office-runtime worden geverifieerd.

**Huidige implementatie:** `apps/api/src/index.ts` biedt `POST /api/launch/consume` voor een kortlevend, HMAC-ondertekend Office-launch-token, maakt een HttpOnly Calc-sessiecookie en beschermt de calculatie-API met `requireSession`. Express serveert de React-build en de API momenteel vanaf rootpaden (`/api/*`, `/assets/*`). Dit is nog **niet** automatisch geschikt voor een proxy onder `/calculaties/*` zonder prefix- en asset-aanpassingen.

**Benodigde implementatieslices:**
1. Verifieer de werkelijke Office-host, Office-PHP-login, router en sessiebron; behoud die als enige gebruikersingang.
2. Reserveer een niet-conflicterend intern pad voor Calc-assets, API en launch. Maak Vite-base, frontend API-URLs en Express-routering expliciet prefix-aware, met tests voor diepe links, assets, fetches en refresh.
3. Laat Office server-side de calculatie/projectrechten controleren en een eenmalige signed launch aanleveren. Houd secrets uit GitHub en tokens uit logs, URL-historie en browseropslag.
4. Valideer cookiepad, SameSite/Secure, reverse-proxy headers, logout, verlopen sessie, rechtenwijziging en toegang zonder Office-login. De huidige achtuurs Calc-cookie is geen vervanging voor een actuele Office-rechtencontrole.
5. Test op staging en productie met een rollbackmogelijkheid; schakel het oude Calc-subdomein pas uit na een volledige end-to-end smoke.

**Geen wijzigingen in deze documentatieslice aan:** productiehosting, DNS, login, secrets of de werkende Calc-routering.
