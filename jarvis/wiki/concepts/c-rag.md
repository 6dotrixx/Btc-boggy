---
type: concept
title: c-rag
created: 2026-06-28
updated: 2026-06-28
tags: [llm, retrieval]
---

# RAG (Retrieval-Augmented Generation)

## Definition

The prevailing pattern for using LLMs over documents: upload everything, chunk
and embed it, retrieve relevant chunks at query time, and generate an answer
from those chunks.

## How it works

Sources are split into chunks and embedded into a vector store. At query time,
the most relevant chunks are retrieved and stuffed into the prompt; the LLM
reconstructs an answer from them. Each query starts from zero — nothing
accumulates between queries.

## Why it matters

- It works, and needs no maintenance — but quality does not improve over time.
  ([[src-karpathy-llm-wiki]])
- Every query re-derives the answer; there is no persistent synthesis.
- The [[c-llm-wiki-pattern]] is proposed as the compounding alternative; see
  [[cmp-rag-vs-llm-wiki]].

## Related concepts

- [[c-llm-wiki-pattern]]

## Appears in

- [[src-karpathy-llm-wiki]]
