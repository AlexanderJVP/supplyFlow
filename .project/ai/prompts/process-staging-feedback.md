# Prompt: Verwerk staging-feedback

Context meegestuurd: alle bestanden in `staging/` met
`review_status: changes_requested`

---

Twee manieren om dit te gebruiken:

1. **Eén voorstel**: "bekijk {{id}} en de aanpassing" — lees dat ene
   staging-bestand, inclusief `review_note`, en herwerk het voorstel zodat
   het de gevraagde aanpassing verwerkt. Schrijf het resultaat terug naar
   hetzelfde staging-bestand (nooit rechtstreeks naar `product/` of
   `engineering/`), en verwijder `review_status`/`review_note` pas als de
   aanpassing er echt in verwerkt is — niet vooraf.
2. **Alles in staging**: maak een lijst van alle voorstellen met
   `review_status: changes_requested`, elk met id, titel en de
   `review_note`. Groepeer per type (story/epic/adr) en stel per item voor
   wat de aanpassing concreet betekent (herschrijven, splitsen, extra info
   opvragen bij de mens, ...). Vat dat samen in een actieplan — volgorde en
   afhankelijkheden tussen de voorstellen zijn daarbij belangrijker dan
   volledigheid van elk individueel voorstel.

In beide gevallen: dit is nog steeds een AI-voorstel, geen source of
truth. Elke herwerking gaat terug naar `staging/` voor een nieuwe
menselijke Accept/Reject/Aanpassing-beslissing (§6.4) — dit prompt-type
mag zelf niets in `product/` of `engineering/` schrijven.
