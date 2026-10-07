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

Laatste main merge: #259 -> 7bcbd239480591b3adeee3fb957fe5ed6541afee.

Aanvullend gemerged:
- #257: tweefasen-publicatie. Calc wordt eerst lokaal duurzaam vastgesteld; daarna wordt exact die immutable versie naar Office gepubliceerd en geverifieerd.
- #258: veilige retry van een established publicatie hergebruikt de oorspronkelijke establishedAt uit de snapshot, zodat de content-hash stabiel blijft.
- #259: allocaties werken nu financieel door in deelcalculaties, mainDirectCost, staartkosten, scope-overzichten, KPI-kostenmix en structuur-subtotalen. Allocaties verplaatsen kost pro rata over arbeid/materiaal/materieel/OA/overig en houden totaal directe kost gelijk.

## Huidige actieve wijziging — gemengde BTW bij allocaties

Branch: `fix/allocated-vat-bases`

PR: **#260 — Move VAT bases with allocated line costs**

Huidige HEAD: `3108f8d86903ec1991faa7af8bd0bfb71e8e0e0a`

### Probleem

Allocaties verplaatsen inmiddels de effectieve directe kost naar de doelregel. Bij gemengde BTW bleef de BTW-grondslag echter nog op de oorspronkelijke bronregel staan. Bij één BTW-regime valt dat niet op, maar bij bijvoorbeeld 9% + 21%, verlegd of vrijgesteld ontstaat dan een onjuiste BTW-specificatie.

### Wijziging op #260

- pure `applyAmountAllocations` toegevoegd;
- `effectiveAllocatedVatSources` toegevoegd;
- allocatie verplaatst BTW-grondslag van bronregel naar doelregel;
- het BTW-regime van de doelregel geldt voor het verplaatste bedrag;
- totaal verkoopgrondslag excl. BTW blijft exact gelijk;
- Opslaan, publication-readiness en Publiceren gebruiken dezelfde effectieve BTW-berekening;
- regressietest toegevoegd voor 21% + 9% met allocatie tussen beide regels.

### Smoke-status kernketen

Gecontroleerd / groen:
- calculatieregelbedragen;
- arbeidsuren/norm-validatie;
- Regel/Stelpost/Verrekenbaar tellen mee; Optie/Notitie/Structuur niet;
- structuur en inklappen;
- hoofdgroep-/paragraafsubtotalen;
- allocaties;
- deelcalculaties;
- hoofdcalculatie versus deelcalculatie-staartkosten;
- BTW per regel en BTW per staartkostenregel;
- broncontextbinding;
- Opslaan;
- publication-readiness;
- immutable snapshot + content hash;
- tweefasen vaststellen/publiceren;
- veilige Office-retry;
- Office commerciële roundtrip-verificatie;
- nieuwe versie starten vanuit established snapshot.

Nog actief:
1. #260 CI groen maken en mergen.
2. Daarna main-CI controleren.
3. Alleen nog concrete blockers uit een daadwerkelijke gebruikersproef oplossen.
4. Zodra die kernflow werkt: functioneel af voor vandaag en daarna pas UX-polijstslag.

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

1. controleer PR #260 / branch `fix/allocated-vat-bases`;
2. CI groen = merge;
3. controleer daarna main-CI;
4. test de echte gebruikersflow in Calc;
5. fix alleen concrete blockers;
6. daarna UX-polijstslag apart uitvoeren.

