# Staging

AI-voorstellen komen hier terecht en wachten op menselijke review.

Workflow: AI genereert → `staging/` (voorstel) → mens reviewt in app →
Accept/Reject/Aanpassing voorstellen.

- **Accept**: verplaatst naar de juiste map (`product/stories/`,
  `product/epics/`, `engineering/decisions/`, ...) — pas dan source of
  truth.
- **Reject**: bestand wordt verwijderd, verder niets.
- **Aanpassing voorstellen**: bestand blijft in `staging/` staan. De mens
  schrijft een notitie (`review_note`) in de app; die wordt samen met
  `review_status: changes_requested` in de frontmatter gezet, zodat het
  voorstel als "wijziging gevraagd" gemarkeerd blijft tot iemand (mens of
  agent) het herwerkt en opnieuw indient, of accepteert/verwerpt zoals het
  is. Een agent kan alle voorstellen met `review_status: changes_requested`
  in `staging/` opzoeken om in één keer een actieplan te maken voor alle
  openstaande aanpassingsverzoeken, in plaats van er één voor één over te
  moeten overleggen — zie `ai/prompts/process-staging-feedback.md`.
  `review_status`/`review_note` worden bij Accept automatisch uit de
  frontmatter gehaald, die horen niet thuis in het geaccepteerde bestand.

Dit bestand is de enige inhoud van deze map tot de eerste AI-actie plaatsvindt.
