# Calc-programma naar BREBO Office-test — implementatiegrenzen

Besluit 11 november 2026: **alleen het bestaande programma** uit `JohnBN1970/calc` gebruiken en verbeteren. Bestaande calculaties, calculatieregels, offertes, historische datasets en de bestaande Calc-MySQL-database **niet overnemen**. Het later vullen met nieuwe calculaties is een apart besluit.

## Gewenst
- Zichtbaar binnen `https://brebobv.nl/office-test` als native Office-module, met bestaande React/Node Calc-werkbank.
- Office beheert login, autorisatie, relaties/verkoopkansen en calculatie-identiteit; een nieuwe calculatie kan worden gestart vanuit de verkoopkans zonder project.
- Calc blijft aparte interface/runtime achter interne navigatie. Geen nieuwe Drupal-afhankelijkheid, geen tweede calculatiewaarheid.
- Verbeteringen: spreadsheetachtige werkbank, compacte totalen en filters, recepten, deelcalculaties, flexibele kolommen, kostencomponenten, versies en brontrace. Bestaande functionaliteit niet regressief maken.

## Technische grens
De prefix `/office-test/calc-app` is een **voorlopige technische doelprefix**, geen bewezen Hostinger-router of werkende same-origin proxy. Zowel `CALC_BASE_PATH` als `VITE_CALC_BASE_PATH` moeten overeenkomen. Bevestig eerst de echte Apache/Passenger-proxy-, route- en cookieconfiguratie. Publiceer geen onbeveiligde alternatieve toegang.

De optionele, read-only preflight `node scripts/office-test-program-only-preflight.mjs` faalt standaard en controleert expliciete isolated-test-instellingen. Hij voert **geen** installaties, databasehandelingen, migraties, imports of hostingwijzigingen uit. De doel-DB moet apart worden bevestigd; bestaande `u213420663_calc`, `u213420663_calc_restore` en `u213420663_office_test` zijn verboden als Calc-programmatest-DB.

## Gebundelde vervolgacceptatie
1. Actuele Calc-main, CRM PR #1776, Calc-Office PR #1777 en Office-router controleren; conflicten en echte deploymentcapaciteit beoordelen.
2. Nieuw geïsoleerd applicatieproces en lege, afzonderlijke testopslag voorbereiden zonder bestaande data te wijzigen. Geen migratie uit oude database.
3. Office-login, live rechten, CSRF, eenmalige grant, projectloze verkoopkans en Calc-consume aansluiten; verlopen of ingetrokken toegang blokkeren.
4. E2E: ingelogde gebruiker opent **nieuwe lege** calculatie uit CRM, voert regels in, slaat op, heropent, controleert totalen en versies; na acceptatie overdracht naar nieuwe vergrendelde werkbegroting.
5. Test anoniem/onbevoegd/replay/logout, API/assets/refresh, geïsoleerde MySQL, rollback. Rapporteren met runlinks en feitelijke Office-testbewijzen.

**Geen merge, databasewijziging, deploy, DNS-verandering of omschakeling van bestaande Calc-origin zonder separate go/no-go.**

## Geverifieerde blockers uit de broncode
- `apps/api/src/index.ts` op main verwerkt nu uitsluitend de v1-launch met een verplicht numeriek `project_id`, `calculation_id` en `actor_id`. Dit kan nog geen nieuwe verkoopkans vóór projectvorming openen.
- `apps/api/src/officeGrantClient.ts` vereist de vaste oude `/api/workbench/v1/calculation-grants/validate`-route en positieve project-ID; de CRM-first draft-grant uit brebo-office PR #1777 is nog niet compatibel. De preflightcontrole bewijst dus alleen de configuratie-intentie, niet dat de bestaande API het CRM-first contract kan uitvoeren.
- Calc PR #307 levert alleen de v2-tokenbasis; `/api/launch/consume` is daarin expliciet nog niet gekoppeld.
- De UI gebruikt `import.meta.env.BASE_URL` voor de berekende API-prefix; de Node-server heeft een optionele `CALC_BASE_PATH`. De nested Office-test route is toegevoegd aan prefix-regressietests, maar nog niet live bewezen.
- Een bestaand afzonderlijk Calc-applicatieproces onder een Hostinger-root is **geen** bewijs voor een same-origin proxy of voor `/office-test/calc-app`.
- De nieuwe, lege opslag moet afzonderlijk worden ingericht en mag de bestaande Calc-database of de Office-test-CRM-database niet overschrijven.

### Vrijgavecriteria
**NO-GO totdat** het CRM-first launch-consume/Office-grantcontract daadwerkelijk is geïmplementeerd, de actieve Office-test router/proxy is bevestigd, een geïsoleerde lege testdatastore werkt en de volledige ingelogde gebruikersketen door echte HTTP-/databasetests is geverifieerd.

## Hostinger hosting-besluit na serveraudit (11 november 2026)

De productie-Office-test PHP-router op `brebobv.nl` bestaat en `/office-test/calc-app/` retourneert 404. Node.js 22 is beschikbaar als binaire runtime maar er is **geen bestaande Calc-appmount** of ProxyPass/Passenger-verwijzing in de gecontroleerde Office-rewritebestanden. Bewijs: [BREBO Office run 42981004440](https://github.com/JohnBN1970/brebo-office/actions/runs/42981004440).

Hostingers actuele documentatie schrijft voor dat Node-webapps op Business/Cloud als **afzonderlijke website** worden ingericht, en dat een PHP-website niet in-place naar Node wordt omgezet. Een subdomein moet een aparte website zijn, geen subfolder. Daarom kan de aanwezige Node-binary **niet** als bewijs worden beschouwd dat de PHP-Office-origin een veilige werkende Node-mount ondersteunt. Zie https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/

### Tweede, onafhankelijke kandidaat
`.github/workflows/calc-hostinger-isolated-node.yml` bouwt een afzonderlijk, reviewbaar ZIP voor een **nieuwe** Hostinger-Node-testwebsite, op rootprefix `/` en met de bestaande Calc-appcode. Dit verschilt van het Office-prefix-pakket; het creëert **geen** website, database, autorisatie, nieuwe DNS of Hostinger-deployment. Het ZIP bevat geen historische calculaties.

Nog te regelen in Hostinger hPanel: een afzonderlijke nieuwe testwebsite (alleen als een beschikbare websiteplek/plan dit toestaat), bijbehorende testorigin en strikt geïsoleerde omgevingsinstellingen. Gebruik nooit `brebobv.nl` als Node-websitebestemming: dat zou de bestaande PHP Office-site vervangen. Hergebruik ook niet de bestaande oude Calc-origin als testdoel.

### Gebruikerservaring
Een nieuwe testorigin betekent nog **niet** eenzelfde adresbalk als `/office-test/calc-app`. Een Office-navigatie naar een afzonderlijke Calc-werkbank kan pas na veilige CRM-first one-time launch, revocation en E2E getest worden. Echte same-origin toegang vereist een afzonderlijk aantoonbaar ondersteunde reverse proxy of latere hostingarchitectuur. Geen onveilige iframe/cookie-omweg en geen stille aanpassing van gebruikersrechten.
