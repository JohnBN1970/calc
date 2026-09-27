# BREBO Calculatie

BREBO Calculatie is de gespecialiseerde calculatiewerkbank voor BREBO.

## Hoofdprincipe

- **BREBO Office is de centrale bron van waarheid, rekenmotor en eigenaar van de calculatiedomeinlogica.**
- **BREBO Calculatie is de gespecialiseerde interactieve software-interface voor de calculator.**
- Calc leest actuele calculatiestate via expliciete Office API-contracten en stuurt bewerkingen als commands terug naar Office.
- Office valideert, rekent, versieert en bewaart de canonieke calculatie.
- Calc mag lokale opslag alleen gebruiken voor sessie-, cache- of tijdelijke migratiedoeleinden; niet als concurrerende calculatiewaarheid.
- Er is geen directe databasekoppeling tussen Calculatie en Office.

## Applicatiegrens

```
BREBO Office
  brondata + calculatiedomein + rekenmotor + versies + audit
          ^
          | signed API state / commands
          v
BREBO Calculatie
  React software-interface + gebruikersinteractie
```

De interface mag zelfstandig evolueren, maar financiële uitkomsten en domeinbesluiten worden niet lokaal opnieuw geïmplementeerd als tweede waarheid.

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
