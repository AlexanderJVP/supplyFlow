# Roadmap

Herzien 2026-09-26. Dit bestand stuurt prioriteit in
`scrum-master-sprint-risk` en `architect-draft-adr`. De gedetailleerde
volgorde staat in `scrum/product-backlog.md`; het waarom staat in
`CLAUDE.md` → Product Vision.

## Richting

Een platform waarmee een productiebedrijf zijn voorraad zo effectief
mogelijk beheert. Twee ideeën vormen de kern:

1. **De Russische pop** — alles wat je in huis maakt is ook een onderdeel
   van iets groters, en elk niveau is apart te bekijken.
2. **Voorstellen in plaats van vergaderingen** — een wijziging (bv. een
   andere schroef) wordt voorgesteld, met gevolgen en al bekeken, en door
   de juiste rollen in de juiste volgorde in de app beslist.

Nu voor eigen gebruik; op termijn als SaaS, waarbij de opstart van elke
klant een dienst is die jij levert (rollen en toegang op maat).

## Fases

| Fase | Wat | Epics / stories | Status |
|---|---|---|---|
| 0 | Basis: inloggen, artikelen, stuklijsten, voorraadlogboek, productie, goedkeuringen, beveiliging | EPIC-001 t/m 006 | grotendeels af |
| 1 | Stabiel en online: tests groen, CI/CD, eerste echte deploy, negatieve-voorraadbug | EPIC-007, STORY-043 | nu |
| 2 | Kernidee afmaken: voorstellen beoordelen met impact, "waar gebruikt", goedkeuringsketens, meldingen; ieder ziet alleen zijn pagina's | EPIC-005, STORY-056, 061, 062 | volgende |
| 3 | Inkomende voorraad en tellen | EPIC-011, EPIC-010 | daarna |
| 4 | Vooruit plannen: bestelvoorstellen, reserveringen, strakker rechtenbeheer | STORY-054, 035, 030 | daarna |
| 5 | Onboarding als dienst: support-account, rolsjablonen, import, beginvoorraad, checklist | EPIC-012, ADR-004 | vanaf eerste externe klant |
| 6 | Meerdere magazijnen en verzending | EPIC-009 | later |
| 7 | Achtergrondtaken: PDF, labels | EPIC-008 | later |
| 8 | SaaS-klaar: zelf registreren, abonnementen/facturatie, voorwaarden/privacy | nog geen epics | horizon |

## Bewuste keuzes

- Zichtbaarheid is **per pagina**, niet per gegeven: wie een pagina mag
  zien, ziet alle gegevens van het bedrijf op die pagina (2026-09-26).
- Rollen liggen nooit vooraf vast; ze worden per klant gemaakt tijdens de
  onboarding. Rolsjablonen zijn enkel startpunten.

## Nog niet uitgewerkt (suggesties uit de backlog-review van 2026-09-26)

**Voorraadwaarde/kostprijs** — bewust nog niet in de impact van een
voorstel (`STORY-057`); die is zo gebouwd dat kosten er later bij kunnen.
Begin het ontwerp (waarschijnlijk een eigen ADR) bij deze open vragen:

1. Inkoopprijs of standaardkostprijs?
2. Welke leverancier telt, als een artikel er meerdere heeft?
3. Geldt een prijs vanaf een bepaalde datum (prijshistoriek)?
4. Samengestelde artikelen: tellen ze hun onderdelen op, of krijgen ze
   een eigen prijs?

Verder: batch- en serienummers, scannen met barcode,
afval en retouren, eenheden omrekenen, meldingen bij lage voorraad.
