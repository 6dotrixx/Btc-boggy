---
type: comparison
title: cmp-rag-vs-llm-wiki
created: 2026-06-28
updated: 2026-06-28
tags: [llm, knowledge-management]
---

# RAG vs LLM Wiki

| Dimension | [[c-rag]] | [[c-llm-wiki-pattern]] |
|-----------|-----------|------------------------|
| Adding a source | Chunked and embedded for later retrieval | LLM reads it, summarizes it, updates every relevant page |
| Asking a question | Searches for chunks, assembles an answer from scratch | Reads pre-built wiki pages; answers with citations already in place |
| Over time | Nothing accumulates; every query starts from zero | Wiki gets richer; cross-references build up; contradictions flagged |
| Maintenance | None needed (quality doesn't improve) | LLM handles all maintenance — that's the whole point |
| Storage | Vector database | Plain markdown (git history, graph view, portable) |

## Verdict

RAG is fine for one-off lookups where nothing needs to persist. The LLM Wiki
wins whenever you are building knowledge over time — research, an editorial
brain, team/competitive intelligence, or study notes — because synthesis is done
incrementally and maintenance cost is near zero. ([[src-karpathy-llm-wiki]])

## Sources

- [[src-karpathy-llm-wiki]]
