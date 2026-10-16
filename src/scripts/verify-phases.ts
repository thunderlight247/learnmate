// End-to-end backend verification for LearnMate Phases 1-5.
import '@/lib/polyfills';
//
// Run from the learnmate/ directory:
//   npx tsx src/scripts/verify-phases.ts
//
// Prerequisites (the script gates on these and exits early if missing):
//   - DATABASE_URL pointing at a PostgreSQL server with the pgvector
//     extension and the schema applied (npx prisma db push from the repo root)
//   - OPENROUTER_API_KEY with embedding + chat credits
//
// The suite exercises the real lib modules (no mocks for chunking,
// embeddings, or persistence): chunking, OpenRouter embeddings, pgvector
// storage + cosine search, the HNSW index, SM-2 math, flashcard
// persistence, and the blueprint generator's transactional graph write
// (with the OpenRouter chat call mocked to avoid spending credits).
// Cleanup removes the test user (cascades) plus flashcards, which
// have no FK relation and must be deleted explicitly.

const RESET = process.stdout.isTTY && !process.env.NO_COLOR ? '\x1b[0m' : '';
const GREEN = process.stdout.isTTY && !process.env.NO_COLOR ? '\x1b[32m' : '';
const RED = process.stdout.isTTY && !process.env.NO_COLOR ? '\x1b[31m' : '';
const CYAN = process.stdout.isTTY && !process.env.NO_COLOR ? '\x1b[36m' : '';
const YELLOW = process.stdout.isTTY && !process.env.NO_COLOR ? '\x1b[33m' : '';

function pass(message: string): void {
  console.log(`${GREEN}[PASS]${RESET} ${message}`);
}

function fail(message: string, error?: unknown): void {
  console.log(`${RED}[FAIL]${RESET} ${message}`);
  if (error instanceof Error) {
    console.log(`       ${RED}${error.message}${RESET}`);
  }
}

function phase(title: string): void {
  console.log(`\n${CYAN}=== ${title} ===${RESET}`);
}

function info(message: string): void {
  console.log(`${YELLOW}       ${message}${RESET}`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/**
 * Loads .env.local manually: tsx does not apply Next.js env-file loading,
 * and the Prisma client reads DATABASE_URL at instantiation time, so this
 * must happen before any lib module is dynamically imported.
 */
function loadEnvLocal(): void {
  const envFile = process.env.ENV_FILE ?? '.env.local';

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path') as typeof import('node:path');

    const resolved = path.resolve(process.cwd(), envFile);
    if (!fs.existsSync(resolved)) return;

    for (const line of fs.readFileSync(resolved, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;

      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // No env file readable; the gate below reports what is missing.
  }
}

interface StepContext {
  userEmail: string;
  workspaceTitle: string;
  documentName: string;
}

let passed = 0;
let failed = 0;

/** Runs one step; a failure aborts the run (later steps depend on it). */
async function step(name: string, fn: () => Promise<string>): Promise<boolean> {
  try {
    const detail = await fn();
    pass(`${name}${detail ? ` — ${detail}` : ''}`);
    passed += 1;
    return true;
  } catch (error) {
    fail(name, error);
    failed += 1;
    return false;
  }
}

async function main(): Promise<void> {
  console.log(`${CYAN}LearnMate Phase 1-5 end-to-end verification${RESET}`);

  loadEnvLocal();

  // ---- Environment gate (before importing any prisma-dependent module) ----
  if (!process.env.DATABASE_URL) {
    fail('Environment gate', new Error('DATABASE_URL is not set (.env.local or environment).'));
    process.exitCode = 1;
    return;
  }
  if (!process.env.OPENROUTER_API_KEY) {
    fail('Environment gate', new Error('OPENROUTER_API_KEY is not set (.env.local or environment).'));
    process.exitCode = 1;
    return;
  }
  info('Environment gate OK');

  // ---- Late imports: prisma-dependent modules only load after the gate ----
  const { prisma } = await import('@/lib/prisma');
  const { chunkText } = await import('@/lib/document-processor');
  const {
    saveDocumentChunks,
    searchSimilarChunks,
    ensureVectorIndex,
  } = await import('@/lib/embeddings');
  const { calculateSM2 } = await import('@/lib/sm2');
  const { parseBlueprint, persistBlueprint } = await import('@/lib/blueprint');

  const ctx: StepContext = {
    userEmail: 'test@learnmate.dev',
    workspaceTitle: 'Physics 101',
    documentName: 'ohms_law_notes.pdf',
  };

  let userId: string | null = null;
  let workspaceId: string | null = null;
  let documentId: string | null = null;

  try {
    // ---------------- Phase 1 & 2: DB, chunking, vector ingestion ----------------
    phase('Phase 1 & 2 — Database, Chunking & Vector Ingestion');

    const okUser = await step('Create test user', async () => {
      // Idempotency: remove leftovers from any previous crashed run first.
      // Flashcard has no FK relation, so its rows must be found via the
      // workspace id list before the user cascade removes everything else.
      const previous = await prisma.user.findUnique({
        where: { email: ctx.userEmail },
      });
      if (previous) {
        const previousWorkspaces = await prisma.workspace.findMany({
          where: { userId: previous.id },
          select: { id: true },
        });
        if (previousWorkspaces.length > 0) {
          await prisma.flashcard.deleteMany({
            where: { workspaceId: { in: previousWorkspaces.map((w) => w.id) } },
          });
        }
        await prisma.user.delete({ where: { id: previous.id } });
      }
      const user = await prisma.user.create({
        data: { email: ctx.userEmail, name: 'Phase Verification' },
      });
      userId = user.id;
      return `id=${user.id}`;
    });
    if (!okUser) throw new Error('Cannot continue without a test user.');

    const okWorkspace = await step('Create workspace "Physics 101"', async () => {
      const workspace = await prisma.workspace.create({
        data: { userId: userId as string, name: ctx.workspaceTitle },
      });
      workspaceId = workspace.id;
      return `id=${workspace.id}`;
    });
    if (!okWorkspace) throw new Error('Cannot continue without a workspace.');

    const okDocument = await step('Create Document "ohms_law_notes.pdf"', async () => {
      const document = await prisma.document.create({
        data: {
          workspaceId: workspaceId as string,
          fileName: ctx.documentName,
          fileUrl: '',
          status: 'PROCESSING',
        },
      });
      documentId = document.id;
      return `id=${document.id}`;
    });
    if (!okDocument) throw new Error('Cannot continue without a document.');

    const sampleText =
      "Ohm's law states that the current through a conductor between two points is directly proportional to the voltage across the two points. The formula is V = I * R, where V is voltage, I is current, and R is resistance.";

    await step('chunkText produces semantic chunks', async () => {
      const chunks = chunkText(sampleText);
      assert(chunks.length > 0, 'chunkText returned no chunks');
      assert(chunks.every((chunk) => chunk.trim().length > 0), 'chunkText produced an empty chunk');
      return `${chunks.length} chunk(s)`;
    });

    await step('saveDocumentChunks embeds + stores in pgvector', async () => {
      const chunks = chunkText(sampleText);
      const stored = await saveDocumentChunks(documentId as string, chunks);
      assert(stored === chunks.length, `expected ${chunks.length} inserts, got ${stored}`);
      const dbCount = await prisma.documentChunk.count({
        where: { documentId: documentId as string },
      });
      assert(dbCount === stored, `database has ${dbCount} chunks, expected ${stored}`);
      return `${stored} chunk(s) persisted`;
    });

    // ---------------- Phase 3: RAG search & indexing ----------------
    phase('Phase 3 — RAG Search & Indexing');

    await step('ensureVectorIndex creates the HNSW index', async () => {
      await ensureVectorIndex();
      const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes WHERE tablename = 'DocumentChunk'
      `;
      assert(
        indexes.some((row) => row.indexname === 'document_chunk_embedding_idx'),
        'document_chunk_embedding_idx not found in pg_indexes',
      );
      return 'document_chunk_embedding_idx present';
    });

    await step('searchSimilarChunks returns ranked results', async () => {
      const results = await searchSimilarChunks(
        'What is the formula for voltage?',
        workspaceId as string,
        5,
      );
      assert(results.length > 0, 'vector search returned no results');
      assert(
        results.every((r) => r.similarity > 0 && r.similarity <= 1),
        'similarity values outside (0, 1]',
      );
      const best = results[0];
      info(`top similarity: ${best.similarity.toFixed(3)}`);
      return `${results.length} result(s), top=${best.similarity.toFixed(3)}`;
    });

    await step('Vector search is topically accurate', async () => {
      const results = await searchSimilarChunks(
        'What is the formula for voltage?',
        workspaceId as string,
        5,
      );
      const corpus = results.map((r) => r.content).join(' ').toLowerCase();
      assert(
        corpus.includes('v = i * r') || corpus.includes('voltage'),
        'retrieved chunks do not mention the voltage formula',
      );
      return 'retrieved context mentions the voltage formula';
    });

    // ---------------- Phase 4: SM-2 & flashcards ----------------
    phase('Phase 4 — SM-2 & Flashcards');

    await step('calculateSM2(quality=4) schedules correctly', async () => {
      const result = calculateSM2(4, 0, 2.5, 0);
      assert(result.interval === 1, `expected interval 1, got ${result.interval}`);
      assert(result.repetitions === 1, `expected repetitions 1, got ${result.repetitions}`);
      assert(result.dueDate.getTime() > Date.now(), 'dueDate is not in the future');
      return `interval=${result.interval}d, due=${result.dueDate.toISOString()}`;
    });

    let flashcardId: string | null = null;

    await step('Flashcard creation + schema round-trip', async () => {
      const card = await prisma.flashcard.create({
        data: {
          workspaceId: workspaceId as string,
          front: 'State Ohm\'s law.',
          back: 'V = I * R — voltage equals current times resistance.',
        },
      });
      const fetched = await prisma.flashcard.findUnique({ where: { id: card.id } });
      assert(fetched !== null, 'created flashcard not found by id');
      assert(fetched?.easeFactor === 2.5, `default easeFactor should be 2.5, got ${fetched?.easeFactor}`);
      assert(fetched?.repetitions === 0, `default repetitions should be 0, got ${fetched?.repetitions}`);
      flashcardId = card.id;
      return `id=${card.id}`;
    });

    await step('Review route math persists via calculateSM2', async () => {
      assert(flashcardId !== null, 'flashcard was not created in the previous step');
      const card = await prisma.flashcard.findUnique({ where: { id: flashcardId as string } });
      assert(card !== null, 'flashcard disappeared');
      const result = calculateSM2(4, card!.repetitions, card!.easeFactor, card!.interval);
      const updated = await prisma.flashcard.update({
        where: { id: card!.id },
        data: {
          repetitions: result.repetitions,
          interval: result.interval,
          easeFactor: result.easeFactor,
          dueDate: result.dueDate,
        },
      });
      assert(updated.interval === 1 && updated.repetitions === 1, 'SM-2 state not persisted');
      return `interval=${updated.interval}d, repetitions=${updated.repetitions}`;
    });

    // ---------------- Phase 5: blueprint generator (mocked AI) ----------------
    phase('Phase 5 — Blueprint Generator');

    // The OpenRouter chat call is mocked: a canned Systems-Lead response is
    // pushed through the real parseBlueprint validator and the real
    // persistBlueprint transaction, so this stage costs no chat-model
    // credits while still exercising the exact production persistence path.
    const mockBlueprintResponse = JSON.stringify({
      title: 'LED Brightness Controller',
      billOfMaterials: [
        {
          item: 'LED (red)',
          quantity: 1,
          description: 'Emits light; forward voltage ~2V',
          estimatedCost: '$0.10',
        },
        {
          item: '220 ohm resistor',
          quantity: 1,
          description: 'Limits current through the LED',
          estimatedCost: '$0.05',
        },
        {
          item: '9V battery',
          quantity: 1,
          description: 'Power source for the circuit',
          estimatedCost: '$3.00',
        },
      ],
      nodes: [
        {
          id: 'node_1',
          type: 'power',
          label: '9V Battery',
          positionX: 100,
          positionY: 100,
          properties: { voltage: '9V' },
        },
        {
          id: 'node_2',
          type: 'resistor',
          label: 'Current-Limiting Resistor',
          positionX: 300,
          positionY: 100,
          properties: { resistance: '220 ohm' },
        },
        {
          id: 'node_3',
          type: 'actuator',
          label: 'LED',
          positionX: 500,
          positionY: 100,
          properties: { forwardVoltage: '2V', current: '20mA' },
        },
      ],
      edges: [
        {
          id: 'edge_1',
          source: 'node_1',
          target: 'node_2',
          label: 'Power Rail',
        },
        {
          id: 'edge_2',
          source: 'node_2',
          target: 'node_3',
          label: 'Limited Current',
        },
      ],
    });

    let projectId: string | null = null;

    await step('Mock OpenRouter blueprint parses via the real validator', async () => {
      const blueprint = parseBlueprint(mockBlueprintResponse);
      assert(blueprint.nodes.length === 3, `expected 3 nodes, got ${blueprint.nodes.length}`);
      assert(blueprint.edges.length === 2, `expected 2 edges, got ${blueprint.edges.length}`);
      return `title: "${blueprint.title}"`;
    });

    await step('persistBlueprint saves Project + nodes + edges in one transaction', async () => {
      const blueprint = parseBlueprint(mockBlueprintResponse);
      const project = await persistBlueprint(
        blueprint,
        workspaceId as string,
        prisma,
      );
      assert(project.id.length > 0, 'project has no id');
      assert(project.nodes.length === 3, `expected 3 persisted nodes, got ${project.nodes.length}`);
      assert(project.edges.length === 2, `expected 2 persisted edges, got ${project.edges.length}`);
      projectId = project.id;
      info(`title: "${project.title}"`);
      return `project id=${project.id}`;
    });

    await step('Project graph persisted in PostgreSQL', async () => {
      assert(projectId !== null, 'project was not created in the previous step');
      const nodeCount = await prisma.canvasNode.count({ where: { projectId: projectId as string } });
      const edgeCount = await prisma.canvasEdge.count({ where: { projectId: projectId as string } });
      const project = await prisma.project.findUnique({
        where: { id: projectId as string },
        include: { nodes: true, edges: true },
      });
      assert(project !== null, 'project row missing');
      assert(nodeCount === project!.nodes.length, `node count mismatch (${nodeCount} vs ${project!.nodes.length})`);
      assert(edgeCount === project!.edges.length, `edge count mismatch (${edgeCount} vs ${project!.edges.length})`);
      const nodeIds = new Set(project!.nodes.map((node) => node.id));
      const wired = project!.edges.every(
        (edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId),
      );
      assert(wired, 'an edge references a node outside this project');
      assert(Array.isArray(project!.billOfMaterials), 'billOfMaterials is not an array');
      return `project + ${nodeCount} nodes + ${edgeCount} edges verified`;
    });

    // ---------------- Cleanup ----------------
    phase('Cleanup');

    await step('Delete test data (cascade + explicit flashcard wipe)', async () => {
      // Flashcard has no FK relation in the schema, so it is NOT covered by
      // the user cascade — delete it explicitly.
      const flashcards = await prisma.flashcard.deleteMany({
        where: { workspaceId: workspaceId as string },
      });
      if (userId) {
        // Cascades: Workspace -> Document -> DocumentChunk,
        // Workspace -> Project -> CanvasNode/CanvasEdge.
        await prisma.user.delete({ where: { id: userId } });
      }
      return `${flashcards.count} flashcard(s) + user cascade`;
    });

    phase('Summary');
    console.log(`${GREEN}Passed: ${passed}${RESET}  ${failed > 0 ? `${RED}Failed: ${failed}${RESET}` : 'All phases verified.'}`);
    process.exitCode = failed > 0 ? 1 : 0;
  } catch (error) {
    fail('Run aborted', error);
    if (failed === 0) failed = 1;

    // Best-effort cleanup so a crashed run does not poison the next one.
    try {
      if (workspaceId) {
        await prisma.flashcard.deleteMany({ where: { workspaceId } });
      }
      if (userId) {
        await prisma.user.delete({ where: { id: userId } });
      }
      info('Best-effort cleanup completed.');
    } catch (cleanupError) {
      fail('Best-effort cleanup', cleanupError);
    }

    console.log(`\n${GREEN}Passed: ${passed}${RESET}  ${RED}Failed: ${failed}${RESET}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
