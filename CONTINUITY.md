# BREBO Calc — Continuiteit

Laatst bijgewerkt: 2026-10-07

## Doel van vandaag

Calc vandaag functioneel werkend krijgen voor de volledige kernketen:

1. invoer / calculatieregels;
2. structuur met hoofdgroepen en paragrafen;
3. uren, materiaal, materieel, OA en overige directe kosten;
4. BTW per regel;
5. staartkosten;
6. deelcalculaties en allocaties;
7. opslaan;
8. publiceercontrole;
9. vaststellen;
10. terugleveren naar BREBO Office.

Geen nieuwe cosmetische zijpaden zolang deze keten niet aantoonbaar rond is. De grote UX-polijstslag volgt daarna.

## Architectuur / vaste uitgangspunten

- Office is centrale databron en ontvangt uiteindelijk alleen het commerciële resultaat.
- Calc is eigenaar van de calculatiewerkbank, recepten, deelcalculaties en staartkosten.
- Recepten worden in Calc samengesteld uit Office-bronnen.
- BTW is niet hardcoded en zit op regelniveau; staartkosten hebben eveneens eigen BTW-regime.
- Hoofdgroepen/paragrafen volgen het gekozen calculatiestelsel: STABU of NL-SfB, niet beide tegelijk.
- Alleen bij Vrije code zijn structuurcodes/omschrijvingen vrij invoerbaar.
- Vrije code is ook op regelniveau mogelijk.
- Deelcalculaties krijgen eigen staartkosten; in de hoofdcalculatie mag daar niet nogmaals staartkosten overheen worden gerekend.
- Office ontvangt alleen de afgesproken commerciële samenvatting; Calc blijft eigenaar van de detailopbouw.
- Kwaliteit en reproduceerbaarheid gaan voor automatische aannames.

## Recente afgeronde keten

### Bronselectie, documentversies en conceptopbouw

- #235 gemerged: bronbeslissingen maken deel uit van CalculationConcept.
- #236 gemerged: broncontrole zichtbaar in de Digitale Calculator.
- #237 gemerged: complementaire actuele bronnen per positie gefuseerd met provenance.
- #238 gemerged: gefuseerde broninhoud stuurt receptmatching.
- #239 gemerged: receptmatches hebben uitlegbare source evidence.
- #240 gemerged: auditeerbare receptvoorstelbeslissingen accepted/rejected.
- #241 gemerged: reviewstatus en acties zichtbaar in de Digitale Calculator.
- #242 gemerged: actuele reviewbeslissingen sturen automatische receptselectie.
- #243 gemerged: 'Nog te bepalen' is per positie uitlegbaar.
- #244 gemerged: herstelacties voor unresolved receptkeuzes; reviewstatus reset toegevoegd.
- #245 gemerged: Concept opbouwen gebruikt alleen veilige, gereviewde en eenduidige posities.
- #246 gemerged: auto-build is idempotent op positie + receptversie + broncontext.
- #247 gemerged: stale gegenereerde receptregels kunnen gecontroleerd worden ververst.
- #248 gemerged: accepted-audit pas na succesvolle generatie; lokale reviewstatus blijft synchroon.
- #249 gemerged: refresh toont oud -> nieuw en netto directe-kostimpact.
- #250 gemerged: delta per kostcomponent.
- #251 gemerged: inklapbare regelniveau-diff, grootste financiële impact bovenaan.
- #252 gemerged: impactlabels Hoger / Lager / Neutraal.

### Structuur en financiële consistentie

- #253 gemerged: hoofdgroep-/paragraafsubtotalen gebruiken effectieve directe kost na allocaties.
- #254 gemerged: binnen filters/deelcalculaties worden alleen allocaties meegenomen waarvan bron en doel binnen de zichtbare scope vallen.
- #255 gemerged: frontend en backend hanteren dezelfde financiële regel:
  - Regel telt mee;
  - Stelpost telt mee;
  - Verrekenbaar telt mee;
  - Optie telt niet mee;
  - Notitie/structuur telt niet mee.
  Opties kunnen daardoor ook niet meer als kostenverdelingsbron/-doel worden gebruikt.

Laatste main merge: #255 -> 8e37964977338a12211884f044ab2361774fad37.

## Huidige actieve wijziging — publicatieveiligheid

Branch: `fix/two-phase-safe-publication`

Huidige branch-bestand SHA: `aadc3b0c9fba8e88d875e46c2dcb6c83bd2d60d3`

Er is nog geen open PR voor deze branch.

### Probleem

Het publiceer-endpoint deed tot nu toe:

1. lokale DB-transactie openen;
2. Calc-doorrekening/snapshot voorbereiden;
3. Office publiceren;
4. Office-resultaat verifiëren;
5. lokale snapshot + established-status schrijven;
6. lokale transactie committen.

Risico: Office kan al gepubliceerd zijn terwijl daarna de lokale Calc-commit faalt. Dan lopen Office en Calc uit elkaar.

### Wijziging op de branch

Publicatie wordt tweefasen:

**Fase 1 — lokaal duurzaam vaststellen**
- volledige publicatiechecks uitvoeren;
- immutable snapshot + content hash opslaan;
- versie status established zetten;
- calculation status established zetten;
- lokale transactie committen.

**Fase 2 — naar Office publiceren**
- Office workspace/version opnieuw ophalen;
- exact die established Calc-versie publiceren;
- commerciële samenvatting verifiëren;
- publication binding verifiëren.

Retry van een established versie wordt toegestaan, maar alleen wanneer opgeslagen snapshot-contract + content hash exact overeenkomen met de opnieuw opgebouwde inhoud. Daardoor kan een mislukte Office-sync veilig opnieuw worden geprobeerd zonder de calculatie te wijzigen.

### Eerstvolgende stap

1. Branch controleren/typecheck/tests.
2. PR openen.
3. CI groen maken.
4. Mergen.
5. Daarna de volledige kernketen als end-to-end smoke-flow nalopen:
   - regel invoeren;
   - uren/norm;
   - directe kosten;
   - BTW;
   - staartkosten;
   - deelcalculatie;
   - allocatie;
   - structuur/subtotalen;
   - opslaan;
   - publication-readiness;
   - vaststellen;
   - publish naar Office;
   - Office-resultaat teruglezen/verifiëren.

Alleen blockers uit deze smoke-flow nog oplossen voordat de UX-polijstslag begint.

## Bekende UX-status

De huidige UI is functioneel maar visueel nog niet volwassen. Vastgestelde punten voor de latere UX-slag:

- te veel grijs/kaders;
- hiërarchie in het werkveld is onrustig;
- diverse technische panelen ogen nog als bouwscherm;
- grote zwarte knoppen zijn eerder al uit het werkveld gehaald/naar menu verplaatst;
- instellingen horen achter een tandwiel;
- complete help hoort bij Calc;
- dockbare panelen/recepten blijven uitgangspunt;
- kolomkeuze via pulldown;
- zoekboom/structuur moet leidend en professioneel worden uitgewerkt.

Niet nu cosmetisch verbouwen zolang de kernketen nog wordt afgemaakt.

## Hervatten zonder opnieuw uitzoeken

Bij volgende 'door':

1. ga naar branch `fix/two-phase-safe-publication`;
2. controleer de wijziging in `apps/api/src/index.ts`;
3. run/controleer CI via PR;
4. merge bij groen;
5. voer daarna de kernketen-smokecontrole uit en fix alleen echte blockers.

