# Jarvis — LLM Wiki Knowledge Base

Jarvis is a personal knowledge base built on Andrej Karpathy's **LLM Wiki**
pattern. Instead of re-reading raw documents every time you ask a question (the
RAG approach), Jarvis incrementally builds and maintains a persistent, interlinked
wiki of markdown files that **compounds over time**.

> Obsidian is the IDE. The LLM is the programmer. The wiki is the codebase.

## How it's organized

```
jarvis/
├── CLAUDE.md       The schema — rules, page types, and workflows for the maintainer
├── index.md        Master index of every wiki page (read this first)
├── log.md          Append-only activity log
├── raw/            Immutable source documents (you add these)
├── wiki/           AI-generated, interlinked pages (Jarvis owns this)
│   ├── sources/    One summary per ingested source
│   ├── entities/   People, companies, products, projects
│   ├── concepts/   Ideas, methods, patterns
│   ├── comparisons/  X vs Y analyses
│   └── overviews/  Living syntheses of whole topics
└── templates/      Page templates Jarvis copies from
```

## How to use it

Point Claude Code at this `jarvis/` directory (so it picks up `CLAUDE.md`), then:

| You want to… | Say |
|---|---|
| Add knowledge | Drop a file in `raw/`, then: **"Ingest the new file in raw/"** |
| Ask a question | **"What do we know about X across all sources?"** |
| Health-check | **"Lint the wiki"** |

When you ingest a source, Jarvis reads it, shows you the thesis and key claims
for review, then files a source summary plus entity/concept pages — all
cross-referenced with `[[wikilinks]]` and added to the index. One source
typically updates 5–15 pages. That compounding is the whole point.

The system is seeded with one source — Karpathy's own LLM Wiki write-up — so the
graph isn't empty. Open `index.md` to explore it.

## Why not just RAG?

The bottleneck to a useful knowledge base was never reading or thinking — it's
the bookkeeping (cross-references, current summaries, contradiction tracking).
That's the work humans abandon and exactly what an LLM does cheaply. See
[`wiki/comparisons/cmp-rag-vs-llm-wiki.md`](wiki/comparisons/cmp-rag-vs-llm-wiki.md).
