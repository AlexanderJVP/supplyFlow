---
id: EPIC-004-production-orders
title: Production Orders
status: done
---

## Doel

Let a tenant build finished goods: check whether current stock covers a
production run's full recursive BOM requirement, then atomically produce
the item and deduct every component from stock in one transaction.

## Stories

- STORY-014
- STORY-015
- STORY-016
- STORY-048
