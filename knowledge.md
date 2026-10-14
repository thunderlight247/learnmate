# LearnMate — Project Knowledge

A living reference for anyone (human or AI agent) working on this codebase.
For the product overview and getting-started guide, see `README.md`.

## What We Are Building

**LearnMate** is an AI-powered study assistant. Students upload lecture PDFs
and the app extracts the text, summarizes the material, answers
context-grounded questions, and generates practice quizzes — all tied to the
uploaded content to reduce hallucination.

The platform is being delivered in phases:

- **Phase 1 (shipped):** PDF upload → text extraction → AI summary, chat, and
  quiz generation (`/api/analyze`, `/api/chat`, `/api/quiz`).
- **Phase 2 (shipped):** RAG pipeline — semantic chunking, vector embeddings,
  pgvector-backed storage (`/api/documents/process`), and cosine-similarity
  search (`searchSimilarChunks`).
- **Phase 3 (shipped):** Multi-document RAG chat — `/api/chat` retrieves the
  top 5 chunks for the user's message, augments the system prompt with them,
  and answers over chat history, returning cited sources. Backed by an
  auto-managed HNSW index (`ensureVectorIndex`).
- **Phase 4 (shipped):** Spaced-repetition flashcards — AI generation from
  workspace chunks (`/api/flashcards/generate`) and SM-2 scheduling
  (`/api/flashcards/review`, `src/lib/sm2.ts`).
- **Phase 5 (shipped):** Theory-to-project blueprint generator
  (`/api/projects/generate`) — vector-retrieves context for a topic, has
  OpenRouter act as a Systems Engineering Lead, and persists the returned
  graph (Project + CanvasNode + CanvasEdge) atomically.
- **Phase 6 (shipped):** LearnMate Canvas UI — `@xyflow/react` canvas with
  a custom `HardwareNode` (per-type icon/color from `src/components/canvas/
  HardwareNode.tsx`), dagre auto-layout (`src/lib/canvas/layout.ts`), and
  typed graph conversion (`src/types/canvas.ts`). `ProjectsTab.tsx` posts a
  topic to `/api/projects/generate` and renders the graph + bill of
  materials; `Workspace.tsx` now bootstraps a workspace via
  `POST /api/workspaces` (singleton demo user) and runs the Phase 2
  pipeline on upload so blueprints have retrieval context. Prisma schema
  lives at `prisma/schema.prisma` in the app root (apply with
  `npx prisma db push`); `@prisma/client`/`prisma` are app dependencies.
- **Next candidates:** Migrate `ChatTab.tsx` to the RAG chat contract (it
  still uses the legacy `{ question, context }` path), a flashcard review UI
  with quality buttons 0-5, real auth to replace the singleton demo user,
  persisting canvas repositions back to `CanvasNode`, and file storage for
  `fileUrl`.

## Tech Stack

| Layer           | Technology                                              |
| --------------- | ------------------------------------------------------- |
| Framework       | Next.js 16 (App Router), React 19                       |
| Language        | TypeScript (strict mode)                                |
| Styling         | Tailwind CSS 4                                          |
| PDF extraction  | `unpdf` (bundled pdf.js, serverless-friendly)           |
| AI provider     | OpenRouter (chat completions + embeddings)              |
| Database        | PostgreSQL with the **pgvector** extension              |
| ORM             | Prisma 6                                                |

## Architecture Notes

### Repository layout

The app root is the repo root (single-level workspace):

```text
/                          ← repo root = the Next.js app
├── prisma/schema.prisma   ← the database schema lives here
└── src/                   ← all app source code
```

Prisma (`@prisma/client` + `prisma` CLI) is an app dependency. Run
`npx prisma generate` / `npx prisma db push` from the app root; the
`learnmate/` subdirectory layout described in earlier revisions no longer
exists.

### Database schema (`prisma/schema.prisma`)

The datasource enables `extensions = [vector]`. Key models:

- `User` → `Workspace` → `Document` (status: PENDING / PROCESSING / COMPLETED / ERROR)
- `DocumentChunk` — `content @db.Text` plus
  `embedding Unsupported("vector(1536)")?`
- `Flashcard` — spaced-repetition fields (`repetitions`, `interval`,
  `easeFactor`, `dueDate`). The `repetitions` column ships in
  `prisma/schema.prisma` and is applied to the live database via
  `npx prisma db push` (no migrations directory).
- `Project`, `CanvasNode`, `CanvasEdge` — canvas/graph feature tables
  (Phase 5). `CanvasNode.properties` is JSON carrying the AI's node label
  plus its technical specs; there is no dedicated label column.

The `vector(1536)` dimension matches OpenAI's `text-embedding-3-small`
embedding output exactly.

### Lib modules (`src/lib/`)

- `pdfExtractor.ts` — Phase 1 PDF → text via unpdf (`mergePages: true`).
- `document-processor.ts` — Phase 2: `extractTextFromPdf(buffer)` and
  `chunkText(text, maxTokens = 500)` (paragraph → sentence → word fallback
  strategy) plus `estimateTokens` (~4 chars/token heuristic).
- `embeddings.ts` — Phase 2: `generateEmbedding(text)`,
  `saveDocumentChunks(documentId, chunks)`,
  `searchSimilarChunks(query, workspaceId, limit = 5)` returning typed
  `SimilarChunk[]` rows, and `ensureVectorIndex()` (Phase 3 HNSW index).
- `sm2.ts` — Phase 4: pure SM-2 spaced-repetition math.
  `calculateSM2(quality 0-5, repetitions, easeFactor, interval)` returns the
  next `{ repetitions, easeFactor, interval, dueDate }`; quality < 3 resets
  the streak to interval 1, passes step 1 → 6 → round(interval × EF) days,
  EF floored at 1.3. No I/O — trivially unit-testable.
- `blueprint.ts` — Phase 5 engine shared by the route and the verification
  script: `generateBlueprint(workspaceId, topic, prisma)` (retrieval →
  OpenRouter → validate → persist), the exported `persistBlueprint`
  (validation + transactional graph write, callable with a mocked AI
  response), the `parseBlueprint` validator, and `blueprintSystemPrompt`.
- `scripts/verify-phases.ts` — end-to-end backend suite for Phases 1-5.
  Run from `learnmate/`: `npx tsx src/scripts/verify-phases.ts`. Requires a
  reachable `DATABASE_URL` (pgvector + schema applied) and
  `OPENROUTER_API_KEY`; gates on both and exits 1 if missing. Creates a
  test user/workspace/document, exercises chunking → embeddings → vector
  search → HNSW index → SM-2 → flashcards → blueprint persistence, prints
  `[PASS]`/`[FAIL]` per step, then deletes the test user (cascade) and its
  flashcards (explicit — no FK). Only real API spend: embeddings. The
  Phase 5 blueprint AI call is **mocked** — a canned response goes through
  the real `parseBlueprint` validator and `persistBlueprint` transaction,
  so no chat-model credits are consumed.
- `openrouter.ts` — chat-completions wrapper: `callOpenRouterMessages`
  (full `ChatMessage[]` history, used by RAG chat) and the
  two-argument `callOpenRouter` convenience wrapper (analyze/quiz/flashcard
  routes).
- `prisma.ts` — Prisma client singleton (Next.js hot-reload safe).

### pgvector + Prisma conventions

Prisma's typed client cannot write `Unsupported("vector(1536)")` columns, so
inserts use raw SQL:

```sql
INSERT INTO "DocumentChunk" ("id", "documentId", "content", "embedding")
VALUES (gen_random_uuid(), $1, $2, $3::vector)
```

- The vector is passed as pgvector's text format: `[0.011,-0.123,...]`.
- `gen_random_uuid()` (core in Postgres 13+) supplies the id because the
  model's `cuid()` default is not applied to raw statements — chunk ids are
  UUIDs, which is expected and fine.

Vector search uses the same raw-SQL approach with pgvector's cosine-distance
operator (`<=>`):

```sql
SELECT c.id, c."documentId", c.content,
       1 - (c.embedding <=> $1::vector) AS similarity
FROM "DocumentChunk" c
JOIN "Document" d ON c."documentId" = d.id
WHERE d."workspaceId" = $2 AND c.embedding IS NOT NULL
ORDER BY c.embedding <=> $1::vector ASC
LIMIT $3
```

Results are typed via the exported `SimilarChunk` interface, and `limit` is
capped at 50 to bound query size.

For fast similarity search, `ensureVectorIndex()` creates an HNSW index
(`USING hnsw (embedding vector_cosine_ops)`). It runs automatically after
`saveDocumentChunks` completes, is memoized per process, and is deliberately
non-fatal on failure (search falls back to a sequential scan). Requires
pgvector >= 0.5.0.

### OpenRouter specifics

- Chat: `POST https://openrouter.ai/api/v1/chat/completions`.
- Embeddings: `POST https://openrouter.ai/api/v1/embeddings`.
- Model ids are **provider-namespaced** on OpenRouter — use
  `openai/text-embedding-3-small`, not the bare `text-embedding-3-small`.

### Path alias

Imports use `@/lib/...` (tsconfig maps `@/*` → `./src/*`).

### API routes (`src/app/api/`)

| Route | Contract | Returns |
| ----- | -------- | ------- |
| `POST /api/analyze` | FormData `file` (PDF ≤ 10 MB) | `{ success, data: { summary, keyConcepts, importantTopics }, rawText }` |
| `POST /api/chat` | **RAG (Phase 3):** JSON `{ message, workspaceId, history? }` | `{ response, sources: [{ documentId, content, similarity }] }` |
| `POST /api/chat` (legacy) | **Phase 1 UI:** JSON `{ question, context }` | `{ answer }` — in-memory path, no database |
| `POST /api/quiz` | JSON `{ context }` | `{ quiz }` (5 multiple-choice questions) |
| `POST /api/flashcards/generate` | JSON `{ workspaceId, count? (1-20, default 5) }` | `{ success, flashcards, count }` — AI cards saved with fresh SM-2 state |
| `POST /api/flashcards/review` | JSON `{ flashcardId, quality (0-5) }` | `{ success, flashcard }` — card updated via `calculateSM2` |
| `POST /api/projects/generate` | JSON `{ workspaceId, topic }` | `{ success, project: { …, nodes, edges } }` — full blueprint graph |
| `POST /api/documents/process` | FormData `file` (PDF ≤ 10 MB) + `workspaceId` | `{ success: true, documentId, chunkCount }` |

`/api/documents/process` is the Phase 2 pipeline: it creates the `Document`
with status `PROCESSING`, then extracts → chunks → embeds → stores, and
finally flips to `COMPLETED` (or `ERROR`, returning HTTP 500 with the
failure message; validation failures return 400 before any row exists). It
sets `export const maxDuration = 300` because embedding runs one sequential
OpenRouter call per chunk. `fileUrl` is currently written as `''` — replace
it when blob storage lands (see `TODO(Phase 3)` in the route).

The Phase 3 RAG chat flow: validate body → `searchSimilarChunks(message,
workspaceId, 5)` → inject the chunks (numbered, with documentId and
similarity) into the system prompt → call OpenRouter with the (capped at 10
turns) history plus the new message → return the response with its sources.
If the workspace has no processed chunks, it returns a helpful 200 response
with empty `sources` rather than an error. History items that fail
validation return 400.

Flashcard generation pulls chunks from the workspace's 3 most recent
COMPLETED documents (up to 12 chunks each) as grounding context, requests
strict JSON, validates every card's shape (502 on malformed AI output), and
inserts cards with schema-default SM-2 state (repetitions 0, interval 0,
easeFactor 2.5, due now). Review validates quality as an integer 0-5
(400), returns 404 for unknown cards, and persists the full SM-2 result.

Blueprint generation (`/api/projects/generate`): retrieves 6 chunks for the
topic, requests a strict-JSON blueprint (title, billOfMaterials, nodes with
temporary `node_N` ids, edges), and validates the full shape before touching
the database — including that every edge references a known node and node
ids are unique. Persistence runs in a single `prisma.$transaction`:
create Project → create nodes while mapping temp ids to record ids → create
edges rewired to those record ids → re-read the project with nested
`nodes`/`edges`. Note: `CanvasNode` has no `label` column, so the AI's
label is persisted inside `properties` as `{ label, …specs }`. Malformed AI
JSON returns 502; anything else bubbles as 500.

## Environment Variables

| Variable                     | Used for                        | Default                             |
| ---------------------------- | ------------------------------- | ----------------------------------- |
| `OPENROUTER_API_KEY`         | All OpenRouter calls (required) | —                                   |
| `OPENROUTER_MODEL`           | Chat/quiz model                 | `anthropic/claude-3-haiku`          |
| `OPENROUTER_EMBEDDING_MODEL` | Embedding model                 | `openai/text-embedding-3-small`     |
| `DATABASE_URL`               | Prisma / PostgreSQL connection  | —                                   |

The app reads `.env.local` (Next.js convention) in `learnmate/`.

## Important Gotchas

- **Prisma is pinned to v6, deliberately.** Prisma 7 rejects this schema
  (`url` in the datasource block was removed in v7, and the generator/output
  requirements changed). Do not "upgrade" without migrating the schema and
  client setup together.
- The Prisma client must be **generated** (`npx prisma generate` at the repo
  root) before `import { PrismaClient } from '@prisma/client'` typechecks —
  an ungenerated client is a stub with no exports.
- `unpdf`'s `extractText` with `{ mergePages: true }` returns `string`;
  without it, `string[]`. Lean on the overload instead of runtime narrowing.
- Keep AI features grounded in uploaded content; pass document context in
  every prompt, matching the existing route implementations.
- **`learnmate/` is its own git repo nested inside the workspace.** Turbopack
  therefore treats it as the workspace root and cannot resolve the
  root-level `@prisma/client` — `next.config.ts` sets `turbopack.root` to
  the parent directory. If a build fails with
  "Module not found: Can't resolve '@prisma/client'", check that setting
  first.
- A fresh install may need `npm install lightningcss-linux-x64-gnu --no-save`
  in `learnmate/`: this machine blocks npm install scripts, which can leave
  the Tailwind 4 CSS pipeline without its native binary (build error
  mentions `lightningcss.linux-x64-gnu.node`).
- `tsx` does not load `.env.local` (only Next.js does). The verification
  script parses `.env.local` itself before importing prisma-dependent
  modules — keep that ordering if you add new steps.

## Verification Commands

```bash
npx tsc --noEmit        # from learnmate/ — strict typecheck
npx eslint <files>      # from learnmate/ — lint
npm run build           # full Next.js production build (catches route/config issues)
npx prisma generate     # from the REPO ROOT — required before first typecheck
```
