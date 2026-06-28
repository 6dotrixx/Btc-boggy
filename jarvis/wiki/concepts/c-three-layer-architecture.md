---
type: concept
title: c-three-layer-architecture
created: 2026-06-28
updated: 2026-06-28
tags: [llm, architecture]
---

# Three-Layer Architecture

## Definition

The structural design of an [[c-llm-wiki-pattern]] knowledge base: raw sources,
the wiki, and the schema.

## How it works

1. **Raw sources** — Curated, immutable source documents. The LLM reads but
   never modifies them. The source of truth. (`raw/`)
2. **The wiki** — AI-generated, interlinked markdown the LLM owns entirely:
   source summaries, entity pages, concept pages, comparisons, overviews.
   (`wiki/`)
3. **The schema** — A config file (`CLAUDE.md`) encoding conventions, page types,
   and workflows so the LLM behaves as a disciplined maintainer, not a generic
   chatbot.

## Why it matters

The separation keeps ground truth immutable while letting the synthesis layer
evolve freely, and the schema is what turns a chatbot into a reliable wiki
maintainer. ([[src-karpathy-llm-wiki]])

## Related concepts

- [[c-llm-wiki-pattern]]

## Appears in

- [[src-karpathy-llm-wiki]]
