---
type: overview
title: ov-llm-knowledge-bases
created: 2026-06-28
updated: 2026-06-28
source_count: 1
tags: [llm, knowledge-management]
---

# LLM Knowledge Bases — Overview

> A living synthesis. Updated as new sources are ingested.

## Summary

The dominant way people use LLMs over documents — [[c-rag]] — treats knowledge
as a retrieval problem: upload, chunk, embed, retrieve, answer, repeat. Nothing
persists between queries. The [[c-llm-wiki-pattern]] (Karpathy) reframes it as a
*compounding asset*: the LLM incrementally maintains an interlinked markdown wiki
so that synthesis happens at ingest time, not query time. Built on a
[[c-three-layer-architecture]] (immutable raw sources, an AI-owned wiki, a schema
file), it delegates the bookkeeping humans abandon to the one actor that never
gets bored. The lineage runs back to the [[c-memex]] (1945); the LLM is the
missing maintenance engine.

## Key themes

- **Compounding beats retrieval** — incremental synthesis means multi-document
  questions are already answered. ([[src-karpathy-llm-wiki]], see [[cmp-rag-vs-llm-wiki]])
- **Maintenance is the bottleneck, and it's solved** — cross-references,
  current summaries, contradiction tracking are exactly LLM-shaped work.
  ([[src-karpathy-llm-wiki]])
- **Plain markdown = no lock-in** — git history, [[e-obsidian]] graph view,
  portability. ([[src-karpathy-llm-wiki]])
- **Tooling** — [[e-claude-code]] as the maintainer, [[e-obsidian]] as the vault.

## Open questions / contradictions

- None yet (single source). Future sources on retrieval quality, scaling limits,
  or hybrid RAG+wiki designs should be integrated here.

## Contributing sources

- [[src-karpathy-llm-wiki]]
