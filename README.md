# BREBO Calculatie

BREBO Calculatie is de gespecialiseerde calculatiewerkbank voor BREBO.

## Hoofdprincipe

- **BREBO Office is de centrale databron en eigenaar van projectcontext.**
- **BREBO Calculatie is de interactieve werkbank voor calculeren.**
- Vastgestelde calculatieversies worden via een expliciet API-contract teruggeleverd aan Office.
- Er is geen directe databasekoppeling tussen Calculatie en Office.
- De huidige Drupal-calculatiemodule blijft bestaan totdat deze applicatie productieproof is.

## Doelarchitectuur

- Frontend: React + TypeScript
- Backend/API: ASP.NET Core
- Database: PostgreSQL
- Authenticatie: centrale BREBO SSO via OIDC/OAuth2
- Publieke host: `calculatie.brebobv.nl`
- Productiedocumentroot: `/home/u213420663/domains/brebobv.nl/public_html/calculatie/web`

## Repositories

- `calc` — calculatiewerkbank
- `mjop` — MJOP-werkbank
- `plan` — planningswerkbank

Deze drie applicaties moeten dezelfde BREBO look & feel, navigatieprincipes, authenticatie en Office-integratie gebruiken.

## Security

Deze repository is openbaar. Nooit secrets, klantdata, productiedumps, tokens, wachtwoorden of private sleutels committen. Zie [SECURITY.md](SECURITY.md).
