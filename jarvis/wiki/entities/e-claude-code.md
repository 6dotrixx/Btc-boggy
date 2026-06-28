---
type: entity
title: e-claude-code
entity_kind: product
created: 2026-06-28
updated: 2026-06-28
tags: [tools, llm, claude]
---

# Claude Code

**Kind:** product

## What it is

Anthropic's agentic coding tool, used in the walkthrough as the engine that
implements and maintains the LLM Wiki. It reads a `CLAUDE.md` schema and executes
the ingest / answer / lint workflows against a folder of markdown.

## Key facts

- Acts as the "programmer" that owns and maintains the wiki layer. ([[src-karpathy-llm-wiki]])
- Reads the [[c-three-layer-architecture]] schema (`CLAUDE.md`) to behave as a
  disciplined wiki maintainer rather than a generic chatbot. ([[src-karpathy-llm-wiki]])
- In the walkthrough, ingested 20+ articles into ~56 interlinked pages. ([[src-karpathy-llm-wiki]])

## Relationships

- Implements [[c-llm-wiki-pattern]]
- Pairs with [[e-obsidian]] (the vault / graph view)

## Mentioned in

- [[src-karpathy-llm-wiki]]
