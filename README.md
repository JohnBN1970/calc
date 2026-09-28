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

## Lokale database

De historische tabellen `calculations`, `calculation_versions` en `calculation_lines` zijn **legacy opslag** en maken geen deel meer uit van de actieve calculatieketen. Ze worden nog niet destructief verwijderd zolang migratie/rollbackcontrole loopt. Nieuwe runtimecode mag deze tabellen niet als calculatiebron of rekenbron gebruiken.

De actieve Calc-runtime gebruikt geen lokale database voor calculatiestate, sessies of launch-replaybescherming. Launch-consumptie wordt door Office geclaimd. De lokale databaseconfiguratie blijft uitsluitend beschikbaar voor tijdelijke legacy-migratie/rollbackhulpmiddelen.

De historische migrations 001-009 blijven in de repository als audit-/rollbackhistorie, maar worden niet meer uitgevoerd door de actieve migration runner. Verse Calc-runtimes bouwen dus geen lokale calculatie-, versie- of regeltabellen meer op. Alleen runtime-infrastructuur zoals launch/replaybescherming wordt aangemaakt.

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
