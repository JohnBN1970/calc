# Vraaggestuurde calculatie, revisies en gezamenlijk gebruik

## Geïmplementeerd in deze wijziging

De bestaande Builder, Office-bronnen, recepten, offerteselectie en artikelzoekfunctie blijven de bestaande keten. Deze wijziging voegt een vraaggestuurde aanvulling toe in dezelfde werkbank. De API bouwt kostenvoorstellen; de bestaande rekenmotor totaliseert ze.

- Kraan, hoogwerker/bouwlift, steiger, toilet, keet/nutsvoorzieningen, bescherming/bewoners, afval en transport.
- Expliciete controle van scope/elementen/hoeveelheden, arbeidsnormen/uurtarieven, leveranciersprijzen/eenheden en risico/staartkosten.
- Nodig, niet nodig/al opgenomen of nog te beoordelen. Niet nodig vraagt een motivatie; benodigd materieel vraagt positieve hoeveelheid, eenheid, prijs, btw en bron/toelichting.
- Kostenregels komen onder een gekozen bestaande eindparagraaf. Stabiele sleutels voorkomen duplicaten bij opnieuw verwerken. Kostenverdelingen op die regels moeten eerst worden opgelost.
- Antwoorden en auteur/datum worden als bronprovenance op een bestaande notitieregel opgeslagen. Daardoor blijven ze binnen de bestaande versie-/snapshotcyclus; geen parallelle calculatiedatabase.
- Concepten met open vragen kunnen worden opgeslagen. Vaststellen van een vraaggestuurd concept of automatisch receptvoorstel vereist beantwoorde vragen en bijpassende kostenregels. Wijzigingen in reguliere calculatieregels/prijzen/bronnen maken de eerdere vraagcontrole ongeldig.
- Nieuwe revisie uit een vastgestelde versie vraagt een reden en de verwachte bronversie. Het bestaande snapshot blijft behouden.
- Rekenbladopslag en eerste vaststelling controleren een oplopend opslagnummer onder een MySQL-rijlock. Bij een conflict HTTP 409; de browser forceert niets en wist eigen invoer niet automatisch.
- Rekenbladopslag, revisiestart en vaststelling registreren auteur uit de ondertekende Office-sessie, tijdstip, versie, reden en oude/nieuwe regelwaarden. Registratie en wijziging gebruiken dezelfde transactie.
- Historie is alleen leesbaar binnen de huidige calculatiesessie, met paginering.

## Begrenzingen en vervolgwerk

Dit bewijst geen nieuwe native Office-test-koppeling of hostinguitrol. De bestaande API/SSO-grenzen moeten in de bedoelde testomgeving met echte Office-rechten worden geverifieerd.

De bestaande Office-sessie levert een numerieke actor-ID; de historie toont daarom `Office-gebruiker #ID`. Er wordt geen naam verzonnen of vanuit de browser vertrouwd. Een geautoriseerde Office-identiteitsprojectie voor weergavenamen is nog nodig.

De nieuwe detailhistorie dekt rekenbladopslag, vraagantwoorden, revisiestart en vaststelling. Bestaande afzonderlijke schrijfroutes voor bijvoorbeeld receptbibliotheek, documentselectie, tariefbeheer en staartkosten hebben hiermee nog geen volledige nieuwe detailaudit of dezelfde concurrentiecontrole. Dit mag dus niet als pakketbrede wijzigingsaudit worden gepresenteerd.

De vragenlijst is een eerste vaste set in de bestaande calculatie. Contextafhankelijk vragen selecteren, automatische prijsbronkeuze en uitgebreider beheer van vragen/regels volgen apart.

Universele materiaallijstextractie, factuurregel naar vaste prijslijst en het uitlezen/koppelen van willekeurige tekeningen of e-mailbijlagen aan canonieke gebouwonderdelen zijn met deze wijziging niet nieuw geïmplementeerd. De bestaande Builder consumeert uitsluitend aantoonbaar beschikbare Office-bronfeiten; ontbrekende herkenning wordt niet gesimuleerd.

## Installatie en acceptatie

1. CI: typecheck, bestaande domeintests, productiebuild, browserfixture en geïsoleerde MySQL-concurrentietest.
2. Migratie `051_calculation_change_history.sql` via de bestaande migratierunner. Alleen een nieuwe kolom en historietabel; bestaande versies worden niet achteraf aan een persoon toegeschreven.
3. API en frontend samen uitrollen. Schrijvende clients moeten `expectedVersionNo` en `expectedEditRevision` meesturen. Publicatie van een concept gebruikt dezelfde verwachte versie; herpublicatie van een vastgestelde snapshot blijft mogelijk.
4. Open dezelfde testcalculatie met twee verschillende, bevoegde Office-gebruikers. Beide laden opslagnummer N. Eén slaat op; de ander krijgt HTTP 409. Geen stille overschrijving.
5. Geef zes uur kraan à €125 op met geldige btw en prijsbron. Controleer €750 in de bestaande motor; opnieuw verwerken levert één kraanregel.
6. Open vragen blokkeren vaststelling. Een wijziging aan reguliere hoeveelheden/prijzen na review vraagt hercontrole.
7. Maak een revisie met reden, wijzig hoeveelheid/prijs, sla op en controleer auteur, tijdstip en was/wordt. Controleer dat het oude snapshot ongewijzigd blijft.

Lokale verificatie: TypeScript en 126 domeintests geslaagd (inclusief de nieuwe vraag- en historietests). Browseruitvoering en MySQL zijn niet lokaal bevestigd; de omgeving blokkeert lokale sockets en heeft geen MySQL-server. De aparte CI-job voert die controles uit met een wegwerpdatabase en fixturegegevens.
