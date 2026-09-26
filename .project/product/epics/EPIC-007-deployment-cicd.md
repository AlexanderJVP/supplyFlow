---
id: EPIC-007-deployment-cicd
title: Deployment & CI/CD
status: in-progress
---

## In gewone taal

De app automatisch online zetten telkens er een nieuwe versie is. De code is klaar; wat nog ontbreekt zijn de echte accounts en sleutels, en een eerste proefversie.

## Doel

Ship the client to Cloudflare Pages and the API to a Cloudflare Worker,
with CI/CD building the client with production env vars and deploying
both on push to `main`/`master`. Code-side wiring is done; the remaining
work needs real Cloudflare/Supabase account access to finish.

## Stories

- STORY-026
- STORY-027
- STORY-028
- STORY-029
- STORY-067
