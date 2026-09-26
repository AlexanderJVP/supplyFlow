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
4. STORY-068 — Bug: afronden boekt alle lagen af i.p.v. enkel de directe onderdelen
5. STORY-028 — Cloudflare/Supabase/GitHub-accounts en sleutels *(jouw actie)*
6. STORY-029 — Eerste proefversie online + smoke test
7. STORY-025 — Sentry echt aanzetten en testen *(pas na 029, niet in sprint 1)*

## 2. Kernidee: voorstellen snel beslissen + ieder ziet zijn pagina's (volgende)

8. STORY-061 — "Bekijken"-rechten echt afdwingen op de server
9. STORY-062 — Menu en pagina's volgen de rechten
10. STORY-055 — Voorstel beoordelen in de app (wat verandert, historiek, wie is volgende)
11. STORY-056 — "Waar wordt dit gebruikt?" (de pop naar boven)
12. STORY-058 — Goedkeuringsketen per bedrijf instellen
13. STORY-057 — Impact van een voorstel tonen
14. STORY-059 — Onderdeel overal vervangen in één voorstel
15. STORY-060 — Melding "er wacht een voorstel op jou"

## 3. Inkomende voorraad en tellen

16. STORY-049 — Leveranciers
17. STORY-050 — Inkooporders
18. STORY-051 — Goederen ontvangen tegen een inkooporder
19. STORY-052 — Telronde starten en tellen
20. STORY-053 — Telverschillen verwerken (met goedkeuring)

## 4. Vooruit plannen

21. STORY-054 — Bestelvoorstellen
22. STORY-035 — Voorraad reserveren voor productieorders
23. STORY-030 — Ingetrokken rechten meteen laten gelden *(wacht op ADR-003)*

## 5. Onboarding (nodig vanaf de eerste externe klant)

24. STORY-066 — Support-account per klant + gebruikers deactiveren *(wacht op ADR-004)*
25. STORY-063 — Rolsjablonen
26. STORY-032 — CSV-import van artikelen en stuklijsten
27. STORY-065 — Beginvoorraad invoeren
28. STORY-064 — Onboarding-checklist

## 6. Meerdere magazijnen en verzending (later)

29. STORY-036 — Magazijnen en plekken (database)
30. STORY-041 — Standaardmagazijn voor nieuwe bedrijven
31. STORY-037 — Voorraadbewegingen per plek
32. STORY-042 — Standaardmagazijn voor bestaande bedrijven + koppelen
33. STORY-038 — Voorraad verplaatsen (`move_stock`)
34. STORY-046 — Scherm: magazijnen en plekken beheren
35. STORY-047 — Scherm: voorraad per plek + verplaatsen
36. STORY-039 — Uitlevering aanmaken
37. STORY-044 — Uitlevering verzamelen (pick)
38. STORY-045 — Inpakken en verzenden
39. STORY-040 — Projectbeschrijving bijwerken

## 7. Achtergrondtaken (later)

40. STORY-031 — Gedeeld wachtrijsysteem
41. STORY-033 — PDF's
42. STORY-034 — Labels

## 8. Op aanvraag

43. STORY-069 — Sets (fantoom-artikelen): groepje onderdelen dat nooit op voorraad ligt
44. STORY-020 — Voorstel om artikelgegevens te wijzigen (`process_change` geparkeerd)
45. STORY-008 — Stuklijstregel direct aanpassen *(alleen bij echte vraag)*
