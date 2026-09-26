# Product Backlog

Geordende lijst van stories, hoogste prioriteit bovenaan. Dit bestand is de
volgorde — de eigenlijke inhoud/status van elke story leeft in
`product/stories/STORY-XXX.md` (of nog in `staging/` zolang niet
geaccepteerd).

_Volgorde herzien 2026-09-26 (na het vastleggen van de productvisie in
`CLAUDE.md`, en na de sprint-risicoanalyse: STORY-067 vooraan, 043 vóór
de account-ketting 028 → 029 → 025). Afgeronde stories staan hier niet in._

## 1. Stabiel en online (nu)

1. STORY-067 — Werk van juli testen tegen een echte database *(Docker nodig)*
2. STORY-027 — CI/CD-workflow één keer groen laten draaien + pushen *(in-progress)*
3. STORY-043 — Bug: voorraad kan negatief worden bij gelijktijdig afronden
4. STORY-028 — Cloudflare/Supabase/GitHub-accounts en sleutels *(jouw actie)*
5. STORY-029 — Eerste proefversie online + smoke test
6. STORY-025 — Sentry echt aanzetten en testen *(pas na 029, niet in sprint 1)*

## 2. Kernidee: voorstellen snel beslissen + ieder ziet zijn pagina's (volgende)

7. STORY-061 — "Bekijken"-rechten echt afdwingen op de server
8. STORY-062 — Menu en pagina's volgen de rechten
9. STORY-055 — Voorstel beoordelen in de app (wat verandert, historiek, wie is volgende)
10. STORY-056 — "Waar wordt dit gebruikt?" (de pop naar boven)
11. STORY-058 — Goedkeuringsketen per bedrijf instellen
12. STORY-057 — Impact van een voorstel tonen
13. STORY-059 — Onderdeel overal vervangen in één voorstel
14. STORY-060 — Melding "er wacht een voorstel op jou"

## 3. Inkomende voorraad en tellen

15. STORY-049 — Leveranciers
16. STORY-050 — Inkooporders
17. STORY-051 — Goederen ontvangen tegen een inkooporder
18. STORY-052 — Telronde starten en tellen
19. STORY-053 — Telverschillen verwerken (met goedkeuring)

## 4. Vooruit plannen

20. STORY-054 — Bestelvoorstellen
21. STORY-035 — Voorraad reserveren voor productieorders
22. STORY-030 — Ingetrokken rechten meteen laten gelden *(wacht op ADR-003)*

## 5. Onboarding (nodig vanaf de eerste externe klant)

23. STORY-066 — Support-account per klant + gebruikers deactiveren *(wacht op ADR-004)*
24. STORY-063 — Rolsjablonen
25. STORY-032 — CSV-import van artikelen en stuklijsten
26. STORY-065 — Beginvoorraad invoeren
27. STORY-064 — Onboarding-checklist

## 6. Meerdere magazijnen en verzending (later)

28. STORY-036 — Magazijnen en plekken (database)
29. STORY-041 — Standaardmagazijn voor nieuwe bedrijven
30. STORY-037 — Voorraadbewegingen per plek
31. STORY-042 — Standaardmagazijn voor bestaande bedrijven + koppelen
32. STORY-038 — Voorraad verplaatsen (`move_stock`)
33. STORY-046 — Scherm: magazijnen en plekken beheren
34. STORY-047 — Scherm: voorraad per plek + verplaatsen
35. STORY-039 — Uitlevering aanmaken
36. STORY-044 — Uitlevering verzamelen (pick)
37. STORY-045 — Inpakken en verzenden
38. STORY-040 — Projectbeschrijving bijwerken

## 7. Achtergrondtaken (later)

39. STORY-031 — Gedeeld wachtrijsysteem
40. STORY-033 — PDF's
41. STORY-034 — Labels

## 8. Op aanvraag

42. STORY-020 — Voorstel om artikelgegevens te wijzigen (`process_change` geparkeerd)
43. STORY-008 — Stuklijstregel direct aanpassen *(alleen bij echte vraag)*
