# Principes

1. **Eén entiteit, één bestand.** Structured data (status, priority, story
   points, dependencies) staat als frontmatter bovenaan hetzelfde `.md`-bestand
   — niet in een los JSON-bestand ernaast.
2. **JSON enkel voor afgeleide/geaggregeerde data** (velocity, cycle time,
   AI-context-cache, audit-log) — nooit als source of truth voor een entiteit.
3. **Board = altijd afgeleid.** Kaartposities worden bij elke render berekend
   uit de `status`-velden van de story-bestanden, nooit apart opgeslagen.
4. **AI schrijft nooit direct naar de bron van waarheid.** Elke AI-output gaat
   via `staging/` en vereist expliciete menselijke goedkeuring
   (Accept/Reject/Aanpassing voorstellen).
5. **Bugs zijn taken, geen apart systeem.** `type: bug` in de frontmatter,
   zelfde workflow en bord als elke andere task/story.
6. **Alles is git-versioneerbaar Markdown**, inclusief prompt-templates
   (`ai/prompts/*.md`).
