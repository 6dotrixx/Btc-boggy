---
type: concept
title: c-llm-wiki-pattern
created: 2026-06-28
updated: 2026-06-28
tags: [llm, knowledge-management, core]
---

# LLM Wiki Pattern

## Definition

A workflow where an LLM incrementally builds and maintains a persistent,
interlinked collection of markdown files — a personal wiki — instead of
re-reading raw documents at query time. Knowledge becomes a compounding asset
rather than a retrieval problem.

## How it works

When a new source arrives, the LLM reads it, extracts key information, and
*integrates* it: updating [[c-three-layer-architecture]] entity and topic pages,
revising summaries, flagging contradictions, and strengthening cross-references.
Answering a question reads the pre-built wiki pages (with citations already in
place) rather than reconstructing from chunks. Maintenance — the bookkeeping
that makes humans abandon wikis — is delegated entirely to the LLM.

## Why it matters

- Synthesis is done incrementally, so multi-document questions are already
  answered. ([[src-karpathy-llm-wiki]])
- Maintenance cost is near zero, so the wiki actually stays current.
- Plain markdown means git history, graph view, and portability.
- Contrast with [[c-rag]] is captured in [[cmp-rag-vs-llm-wiki]].

## Related concepts

- [[c-rag]]
- [[c-three-layer-architecture]]
- [[c-memex]]

## Appears in

- [[src-karpathy-llm-wiki]]
