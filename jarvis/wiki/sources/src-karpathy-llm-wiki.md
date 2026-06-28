---
type: source
title: src-karpathy-llm-wiki
source_file: raw/karpathy-llm-wiki.md
source_url: https://x.com/karpathy
author: Andrej Karpathy (pattern); article walkthrough
ingested: 2026-06-28
tags: [llm, knowledge-management, rag, claude-code, obsidian]
---

# LLM Knowledge Bases — the LLM Wiki pattern

> **Thesis:** Instead of re-reading raw documents at query time (RAG), have an
> LLM incrementally build and maintain a persistent, interlinked markdown wiki
> that compounds over time — because the real bottleneck to a useful knowledge
> base is bookkeeping, which is exactly what LLMs are good at.

## Key claims

1. **RAG starts from zero every query** — chunks/embeds for retrieval and
   reconstructs an answer each time; nothing accumulates. See [[c-rag]].
2. **The LLM Wiki compounds** — each new source updates every relevant page, so
   synthesis is done incrementally, not on the fly. See [[c-llm-wiki-pattern]].
3. **The bottleneck is bookkeeping, not reading/thinking** — cross-references,
   current summaries, contradiction tracking. LLMs don't get bored and "can
   touch 15 files in one pass." (Karpathy)
4. **Three layers** — immutable raw sources, an AI-owned wiki, and a schema file
   (`CLAUDE.md`) that encodes conventions and workflows. See [[c-three-layer-architecture]].
5. **It's just markdown** — git version history, [[e-obsidian]] graph view, full
   portability, no vendor lock-in.
6. **Ingest is high-leverage** — one source typically updates 5–15 wiki pages.
7. **Idea traces to the Memex** — Vannevar Bush's 1945 vision; the unsolved part
   was *who does the maintenance*. The LLM is the answer. See [[c-memex]].

## Data & figures cited

- "LLMs don't get bored, don't forget to update a cross-reference, and can touch
  15 files in one pass." — [[e-andrej-karpathy]]
- "Obsidian is the IDE. The LLM is the programmer. The wiki is the codebase."
- Author reports ingesting 20+ articles into ~56 interconnected pages in ~1 hour.

## Entities referenced

- [[e-andrej-karpathy]]
- [[e-claude-code]]
- [[e-obsidian]]
- [[e-vannevar-bush]]

## Concepts covered

- [[c-llm-wiki-pattern]]
- [[c-rag]]
- [[c-three-layer-architecture]]
- [[c-memex]]

## Notes & contradictions

None on ingest (first source). The RAG vs LLM Wiki framing is captured in
[[cmp-rag-vs-llm-wiki]].

## Source

- File: `raw/karpathy-llm-wiki.md`
- URL: https://x.com/karpathy (original tweet + gist)
