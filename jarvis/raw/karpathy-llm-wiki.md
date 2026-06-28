# LLM Knowledge Bases — the LLM Wiki pattern (Karpathy)

> Raw source. Immutable. Captured 2026-06-28 from an article describing Andrej
> Karpathy's "LLM Wiki" pattern and a hands-on walkthrough of building one with
> Claude Code + Obsidian.

Most people use AI the same way every time. Upload a document. Ask a question.
Get an answer. Close the tab. Tomorrow, you upload the same document, ask a
slightly different question, and the AI starts from scratch — no memory of
yesterday, no accumulated understanding, no synthesis across everything you've
ever asked. This is how NotebookLM works, how ChatGPT file uploads work, and how
most RAG systems work — and it's fundamentally broken for anyone trying to build
knowledge over time.

## What Karpathy proposed: the LLM Wiki

Instead of having your AI re-read raw documents every time you ask a question,
have the AI incrementally build and maintain a persistent wiki: a structured,
interlinked collection of markdown files that compounds over time. When you add
a new source, the AI doesn't just index it for retrieval — it reads it, extracts
the key information, and integrates it into the existing wiki: updating entity
pages, revising topic summaries, noting where new information contradicts old
claims, and strengthening the overall synthesis.

RAG vs LLM Wiki:
- When you add a source: RAG chunks and embeds it for later retrieval. LLM Wiki
  reads it, summarizes it, and updates every relevant page.
- When you ask a question: RAG searches for relevant chunks and pieces together
  an answer from scratch. LLM Wiki reads pre-built wiki pages and answers with
  citations already in place.
- Over time: RAG accumulates nothing; every query starts from zero. LLM Wiki
  gets richer — cross-references build up, contradictions are flagged.
- Maintenance: RAG needs none (but quality doesn't improve). LLM Wiki: the AI
  handles all maintenance, and that's the whole point.

> "Humans abandon wikis because the maintenance burden grows faster than the
> value. LLMs don't get bored, don't forget to update a cross-reference, and can
> touch 15 files in one pass." — Karpathy

## The architecture: three layers

1. **Raw sources** — Curated source documents (articles, PDFs, notes, clipped
   web pages). Immutable. The AI reads but never modifies them. Source of truth.
2. **The wiki** — AI-generated markdown (summaries, entity pages, concept pages,
   comparisons, an index). The AI owns this layer entirely.
3. **The schema** — A config file (CLAUDE.md for Claude Code) telling the AI how
   the wiki is structured, what conventions to follow, and what workflows to run
   when ingesting sources, answering questions, or maintaining the wiki.

> "Obsidian is the IDE. The LLM is the programmer. The wiki is the codebase."

## How to build one (with Claude Code + Obsidian)

1. Create an Obsidian vault (a folder for your markdown).
2. Point Claude Code at the vault, paste Karpathy's gist, and have it implement
   the pattern: create the directory structure, the CLAUDE.md schema, the index,
   the log, and templates — and ingest the gist as the first source.
3. Configure the Obsidian Web Clipper to drop clean markdown into `raw/`.
4. Ingest your first real source: "Ingest the new file in raw/". One source →
   5–15 wiki pages updated.
5. Query: "What do we know about [topic] across all sources?" — answered with
   [[wikilink]] citations.
6. Keep it healthy: "Lint the wiki" — scans for contradictions, orphan pages,
   stale claims, and missing cross-references, organized by severity.

## Why it's better than RAG

The bottleneck to a useful knowledge base was never the reading or thinking —
it's the bookkeeping: updating cross-references, keeping summaries current,
noting contradictions, maintaining consistency. That's the work humans abandon,
and exactly what LLMs are built for. The wiki stays maintained because the cost
of maintenance is near zero. And because it's just markdown files, you get git
version history, Obsidian graph visualization, and full portability — no vendor
lock-in.

## Five use cases

1. **Editorial brain** — Ingest everything you've published; query your own beat
   before drafting to avoid repeating yourself and surface forgotten connections.
2. **Deep research over weeks/months** — Ingest every paper/report; synthesis
   evolves incrementally so multi-document questions are already answered.
3. **Team knowledge base** — Feed Slack threads, call transcripts, docs; entity
   pages for clients/projects/competitors update automatically.
4. **Business & competitive intelligence** — "What were the top objections this
   quarter?" becomes a cited, queryable question.
5. **Course notes & self-education** — Track concepts as they build; flag when
   later material updates earlier material.

## The bigger picture

The idea traces back to Vannevar Bush's 1945 Memex — a personal, curated
knowledge store where the connections between documents are as valuable as the
documents themselves. The part Bush couldn't solve was who does the maintenance.
Now there's an answer: the human curates sources, directs analysis, asks good
questions, and thinks about meaning; the LLM does everything else.
