// Phase 5 blueprint engine, shared by the /api/projects/generate route and
// the end-to-end verification script (src/scripts/verify-phases.ts).
// Retrieval + OpenRouter + transactional persistence in one callable unit.

import type { Prisma, PrismaClient } from '@prisma/client';
import { callAiWithFallback, getAiModelForComplexity, type CustomAiConfig } from '@/lib/aiClient';
import { searchSimilarChunks } from '@/lib/embeddings';
import { callOpenRouter } from '@/lib/openrouter';

/**
 * Strict retrieval budget: the blueprint prompt gets at most 4 context
 * chunks (pgvector search is capped at MAX_RETRIEVED_CHUNKS) so grounding
 * context never bloats the token budget needed for the JSON output.
 */
export const CONTEXT_CHUNKS = 4;

/** Fresh AI attempts before a failure is surfaced to the user. */
const BLUEPRINT_ATTEMPTS = 3;

/**
 * Per-attempt timeout. Free models often queue 40-90s before they start
 * streaming; the 35s default aborted them mid-generation and handed the
 * request to weaker fallbacks, which is what produced most invalid output.
 */
const BLUEPRINT_TIMEOUT_MS = 90_000;

/**
 * Output cap. Reasoning models can burn 2.5k+ tokens thinking before they
 * write a single character of JSON, so 4000 left the object itself cut off.
 */
const BLUEPRINT_MAX_TOKENS = 6000;

/**
 * Blueprint/canvas generation is the app's heaviest structured task, so it
 * routes on the high-reasoning model tier. Retries rotate to different
 * free models in case the first sample returns unusable output.
 */
const BLUEPRINT_RETRY_MODELS: string[] = Array.from(
  new Set([
    getAiModelForComplexity('complex').openrouter,
    'nvidia/nemotron-3.5-super-vl:free',
    'liquid/lfm-2.5-2.6b:free',
  ]),
);

/** Appended to the user prompt on retries after malformed output. */
const BLUEPRINT_RETRY_REMINDER =
  'REMINDER: Output ONLY the raw JSON object described above — no commentary, no Markdown fences, no text before or after the object.';

export interface BlueprintBomItem {
  item: string;
  quantity: number;
  description: string;
  estimatedCost: string;
}

export interface BlueprintNode {
  id: string;
  type: string;
  label: string;
  role?: string;
  importance?: string;
  damageEffect?: string;
  positionX: number;
  positionY: number;
  properties?: Record<string, string>;
}

export interface BlueprintEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface Blueprint {
  title: string;
  billOfMaterials: BlueprintBomItem[];
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
}

/** The persisted project graph, as returned by generateBlueprint. */
export interface GeneratedProject {
  id: string;
  workspaceId: string;
  title: string;
  billOfMaterials: BlueprintBomItem[];
  nodes: {
    id: string;
    type: string;
    positionX: number;
    positionY: number;
    properties: unknown;
  }[];
  edges: {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    label: string | null;
  }[];
}

export const blueprintSystemPrompt = `
You are LearnMate's Systems Architect and Multidisciplinary Engineering & Biomedical Lead.
Your mission is to transform any academic or technical theory (anatomy, medicine, drone engineering, robotics, circuits, mechanics, software) into an interactive, functional 2D system schematic and practical component breakdown.

Return ONLY valid JSON. Do not use Markdown code fences.

The JSON must exactly follow this structure:

{
  "title": "System / Project Title",
  "billOfMaterials": [
    {
      "item": "Component or Anatomical Structure Name",
      "quantity": 1,
      "description": "Functional role in the system",
      "estimatedCost": "Estimated cost for hardware (e.g. '$15') or clinical reference/marker for biological systems (e.g. 'Vital Organ' or 'N/A')"
    }
  ],
  "nodes": [
    {
      "id": "node_1",
      "type": "organ | sensor | microcontroller | actuator | power | vessel | nerve | mechanical | fluid | display | communication | storage",
      "label": "Part Name (e.g. Mitral Valve, ESC Motor Controller, Left Ventricle)",
      "role": "Concise summary of what this part does in the system",
      "importance": "Why this component is essential to overall operation",
      "damageEffect": "What specific failures, errors, symptoms, or catastrophic consequences occur if this part is damaged or fails",
      "positionX": 100,
      "positionY": 100,
      "properties": {
        "spec1": "value1",
        "spec2": "value2"
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "label": "Connection / flow description (e.g. Oxygenated Blood Flow, PWM Control Signal, Power Rail, Neural Impulse)"
    }
  ]
}

Rules:
1. Ground the architecture strictly in the provided lecture or document context.
2. Adapt to the subject domain automatically:
   - For Anatomy / Biology: Deconstruct the physiological circuit or anatomy (e.g. Heart, Valves, Lungs, Nerves, Blood Vessels). Edges represent blood flow, neural impulses, or endocrine signals. Node types include organ, tissue, vessel, nerve, fluid. "damageEffect" highlights pathology, clinical symptoms, and disease states.
   - For Robotics / Drone Engineering: Deconstruct the avionics, power train, and kinematics (e.g. Flight Controller, ESC, Brushless Motor, IMU, LiPo Battery). Edges represent PWM, I2C telemetry, DC power, or aerodynamic thrust. "damageEffect" highlights loss of attitude, brownout, or spin.
   - For Electronics / Physics: Deconstruct circuits, power rails, logic. Edges represent voltage, current, signal buses.
   - For Software / Systems: Deconstruct services, queues, databases.
3. Every node MUST have an insightful "role", "importance", and "damageEffect".
4. Edges must reference existing node ids via "source" and "target"; "label" names the connection (signal, blood, power, torque).
5. Lay nodes out on a readable grid: vary positionX/positionY, flow from left to right or top to bottom.
6. Return valid JSON only.
`.trim();

/** Closes a string literal left open when the stream was cut mid-value. */
function closeDanglingQuote(s: string): string {
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') inString = !inString;
  }
  return inString ? `${s}"` : s;
}

/** Closes every array/object left open when the stream was cut mid-structure. */
function closeOpenBrackets(s: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  let result = s;
  while (stack.length) result += stack.pop()!;
  return result;
}

/** Offsets of `,` member separators that sit outside string literals. */
function memberSeparators(s: string): number[] {
  const offsets: number[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString && ch === ',') offsets.push(i);
  }
  return offsets;
}

/**
 * Best-effort repair for JSON truncated when max_tokens is hit.
 * Closes unclosed strings, arrays, and objects so JSON.parse can
 * recover the members that were already emitted — and, when a cutoff
 * stranded a half-written member (`..., "quantity": 1`), steps back to
 * the previous complete separator so the salvage still parses.
 */
function repairTruncatedJson(s: string): string {
  try { JSON.parse(s); return s; } catch { /* fall through to repair */ }

  const closed = closeOpenBrackets(
    closeDanglingQuote(s.trimEnd()).replace(/,\s*$/, ''),
  );

  const candidates = [closed];

  const separators = memberSeparators(closed);
  for (let i = separators.length - 1; i >= 0 && i >= separators.length - 6; i--) {
    const prefix = closed.slice(0, separators[i]).replace(/,\s*$/, '');
    candidates.push(closeOpenBrackets(prefix));
  }

  for (const candidate of candidates) {
    try { JSON.parse(candidate); return candidate; } catch { /* try next */ }
  }

  return closed; // JSON.parse throws on this: closest-to-valid text for logs
}

/**
 * Pulls the JSON object out of free-form model output: drops Markdown
 * fences wherever they appear and keeps only the `{ ... }` span, so prose
 * like "Here is your blueprint:" around (or before) the object is ignored.
 */
function extractJsonObjectText(raw: string): string {
  const unfenced = raw.replace(/```[a-zA-Z0-9+-]*/g, '');
  const start = unfenced.indexOf('{');
  if (start === -1) return unfenced.trim();
  const end = unfenced.lastIndexOf('}');
  return unfenced.slice(start, end > start ? end + 1 : undefined).trim();
}

/**
 * Validates an AI-produced blueprint JSON string against the expected
 * shape: title, BOM items, nodes with unique ids, and edges that only
 * reference known nodes.
 *
 * @param raw - The raw model output (Markdown fences are tolerated).
 * @returns The parsed, validated Blueprint.
 * @throws Error describing exactly what the model got wrong.
 */
export function parseBlueprint(raw: string): Blueprint {
  const cleaned = extractJsonObjectText(raw);

  // Repair truncated JSON before parsing (max_tokens hit mid-stream)
  const repaired = repairTruncatedJson(cleaned);

  const parsed: unknown = JSON.parse(repaired);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('AI response is not a JSON object.');
  }

  const blueprint = parsed as Record<string, unknown>;

  if (typeof blueprint.title !== 'string' || !blueprint.title.trim()) {
    throw new Error('AI response is missing a valid "title".');
  }
  if (!Array.isArray(blueprint.nodes) || blueprint.nodes.length === 0) {
    throw new Error('AI response has no "nodes" to build a canvas.');
  }

  // A response cut off after its nodes but before these arrays is still a
  // usable canvas, so tolerate their absence instead of discarding the run.
  const rawBom: unknown[] = Array.isArray(blueprint.billOfMaterials)
    ? blueprint.billOfMaterials
    : [];
  const rawEdges: unknown[] = Array.isArray(blueprint.edges)
    ? blueprint.edges
    : [];

  // ── BOM: coerce quantity to number, fill missing fields with defaults ──
  const normalizedBom: BlueprintBomItem[] = rawBom
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      item: String(item.item ?? 'Component'),
      quantity: typeof item.quantity === 'number' ? item.quantity : Number(item.quantity) || 1,
      description: String(item.description ?? ''),
      estimatedCost: String(item.estimatedCost ?? 'N/A'),
    }));

  // ── Nodes: coerce / default any missing or wrong-typed fields ──
  let posY = 100;
  const nodeIds = new Set<string>();
  const normalizedNodes: BlueprintNode[] = (blueprint.nodes as unknown[])
    .filter((n): n is Record<string, unknown> => typeof n === 'object' && n !== null)
    .map((n, i) => {
      const id = String(n.id ?? `node_${i + 1}`);
      const px = typeof n.positionX === 'number' ? n.positionX : (i % 3) * 250 + 100;
      if (i % 3 === 0 && i !== 0) posY += 200;
      const py = typeof n.positionY === 'number' ? n.positionY : posY;
      const props =
        n.properties && typeof n.properties === 'object' && !Array.isArray(n.properties)
          ? (n.properties as Record<string, string>)
          : {};
      nodeIds.add(id);
      return {
        id,
        type: String(n.type ?? 'mechanical'),
        label: String(n.label ?? id),
        role: n.role ? String(n.role) : undefined,
        importance: n.importance ? String(n.importance) : undefined,
        damageEffect: n.damageEffect ? String(n.damageEffect) : undefined,
        positionX: px,
        positionY: py,
        properties: props,
      };
    });

  if (normalizedNodes.length === 0) {
    throw new Error('AI response has no valid nodes to build a canvas.');
  }

  // Deduplicate node ids (keep first occurrence)
  const seenIds = new Set<string>();
  const dedupedNodes = normalizedNodes.filter((n) => {
    if (seenIds.has(n.id)) return false;
    seenIds.add(n.id);
    return true;
  });

  // ── Edges: drop any referencing unknown node ids ──
  const validNodeIds = new Set(dedupedNodes.map((n) => n.id));
  const normalizedEdges: BlueprintEdge[] = rawEdges
    .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
    .filter((e) => validNodeIds.has(String(e.source)) && validNodeIds.has(String(e.target)))
    .map((e, i) => ({
      id: String(e.id ?? `edge_${i + 1}`),
      source: String(e.source),
      target: String(e.target),
      label: String(e.label ?? ''),
    }));

  return {
    title: blueprint.title as string,
    billOfMaterials: normalizedBom,
    nodes: dedupedNodes,
    edges: normalizedEdges,
  };
}

export function buildBlueprintUserPrompt(topic: string, context: string): string {
  return `
Design a hands-on project for the topic "${topic}" based strictly on the lecture context below.

Lecture Context:
${context}
`.trim();
}

/**
 * End-to-end blueprint generation for one topic in one workspace:
 * vector-retrieve lecture context, ask OpenRouter for a strict-JSON
 * blueprint, validate it, then persist Project + CanvasNode + CanvasEdge
 * rows atomically.
 *
 * The AI labels nodes with temporary ids ("node_1", ...); edges are rewired
 * to the real record ids inside the transaction.
 *
 * @param workspaceId - Workspace whose documents ground the blueprint.
 * @param topic - The theory topic to turn into a project.
 * @param prisma - A Prisma client (or transaction client carrying
 * `$transaction`) used for the writes.
 * @returns The created project with nested nodes and edges.
 * @throws Error if retrieval finds no context, the AI output is invalid,
 * or the database write fails (the transaction rolls back in that case).
 */
export async function generateBlueprint(
  workspaceId: string,
  topic: string,
  prisma: PrismaClient,
  customConfig?: CustomAiConfig,
): Promise<GeneratedProject> {
  const hasDocuments = await prisma.document.count({ where: { workspaceId, status: 'COMPLETED' } });
  const chunks = hasDocuments
    ? await searchSimilarChunks(topic, workspaceId, CONTEXT_CHUNKS)
    : [];

  if (hasDocuments && chunks.length === 0) {
    throw new Error('No indexed passages found for this workspace. Please retry document indexing.');
  }

  const context = chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] (similarity: ${chunk.similarity.toFixed(3)})\n${chunk.content}`,
    )
    .join('\n\n---\n\n');

  const userPrompt = chunks.length
    ? buildBlueprintUserPrompt(topic, context)
    : `Design a hands-on project for the topic "${topic}" using general engineering knowledge. No lecture document was provided.`;

  // Free models are inconsistent: some answer in `reasoning`, some get cut
  // off mid-object, some wrap the JSON in prose. Parse failures therefore
  // trigger a fresh call (rotating model + firmer prompt) instead of failing
  // the whole request on the first bad sample.
  let blueprint: Blueprint | null = null;
  let degraded: Blueprint | null = null;
  let lastParseError: unknown;
  let lastCallError: unknown;
  let lastRaw: string | undefined;

  for (let attempt = 0; attempt < BLUEPRINT_ATTEMPTS && !blueprint; attempt++) {
    const model = BLUEPRINT_RETRY_MODELS[attempt];

    const attemptPrompt = attempt === 0 ? userPrompt : `${userPrompt}\n\n${BLUEPRINT_RETRY_REMINDER}`;
    let aiResponse: string;
    try {
      if (customConfig?.provider && customConfig.provider !== 'default') {
        // User-chosen provider (Ollama, Groq, OpenAI, OpenRouter key): honor it.
        const result = await callAiWithFallback({
          messages: [
            { role: 'system', content: blueprintSystemPrompt },
            { role: 'user', content: attemptPrompt },
          ],
          complexity: 'complex',
          maxTokens: BLUEPRINT_MAX_TOKENS,
          customConfig,
        });
        aiResponse = result.content;
      } else {
        aiResponse = await callOpenRouter(
          blueprintSystemPrompt,
          attemptPrompt,
          {
            maxTokens: BLUEPRINT_MAX_TOKENS,
            timeoutMs: BLUEPRINT_TIMEOUT_MS,
            // A thinking trace is never the blueprint; fail the attempt so the
            // fallback chain can move to the next model instead.
            useReasoningFallback: false,
            ...(model ? { model } : {}),
          },
        );
      }
    } catch (error) {
      lastCallError = error;
      console.warn(
        `[blueprint] AI call failed (attempt ${attempt + 1}/${BLUEPRINT_ATTEMPTS}):`,
        error instanceof Error ? error.message : error,
      );
      continue;
    }

    lastRaw = aiResponse;
    try {
      const parsed = parseBlueprint(aiResponse);
      if (parsed.edges.length > 0) {
        blueprint = parsed;
        break;
      }
      // A canvas without a single wire is a degraded graph (usually an
      // output truncated right after the nodes). Keep it as a fallback and
      // spend another attempt chasing a fully-wired schematic.
      degraded ??= parsed;
      console.warn(
        `[blueprint] sample ${attempt + 1}/${BLUEPRINT_ATTEMPTS} had ${parsed.nodes.length} nodes but no edges; retrying for a wired graph`,
      );
    } catch (error) {
      lastParseError = error;
      console.error(
        `[blueprint] Invalid AI output (attempt ${attempt + 1}/${BLUEPRINT_ATTEMPTS}):`,
        error instanceof Error ? error.message : error,
        aiResponse.slice(0, 500),
      );
    }
  }

  if (!blueprint) {
    // A salvageable parse (nodes but no edges) still beats failing the
    // render: users can draw connections, they just aren't pre-wired.
    if (degraded) {
      return persistBlueprint(degraded, workspaceId, prisma);
    }

    // Transport failures (credits, timeout, missing key) never produced
    // output to judge, so they keep their own message; only genuinely
    // malformed output becomes the user-facing error.
    if (!lastParseError && lastCallError) {
      throw lastCallError;
    }
    console.error('Invalid blueprint JSON from AI:', lastRaw, lastParseError);
    throw new Error('The AI returned an invalid blueprint. Please try again.');
  }

  return persistBlueprint(blueprint, workspaceId, prisma);
}

/**
 * Persists a validated Blueprint atomically: the Project row (title +
 * billOfMaterials JSON), its CanvasNode rows, and its CanvasEdge rows with
 * the AI's temporary node ids ("node_1", ...) rewired to real record ids.
 *
 * Split out from generateBlueprint so the verification script can feed a
 * mocked AI response through the exact same validation + transaction path.
 *
 * @param blueprint - A blueprint already validated by parseBlueprint.
 * @param workspaceId - Workspace the project belongs to.
 * @param prisma - Prisma client used for the transactional writes.
 * @returns The created project with nested nodes and edges.
 * @throws Error if the database write fails (the transaction rolls back,
 * leaving no orphaned nodes or edges).
 */
export async function persistBlueprint(
  blueprint: Blueprint,
  workspaceId: string,
  prisma: PrismaClient,
): Promise<GeneratedProject> {
  const created = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        workspaceId,
        title: blueprint.title,
        // Runtime shape is validated above; the double cast bridges
        // BlueprintBomItem[] to Prisma's InputJsonValue, which demands an
        // index signature the validated interface cannot declare.
        billOfMaterials:
          blueprint.billOfMaterials as unknown as Prisma.InputJsonValue,
      },
    });

    // Create all nodes, remembering which temp id maps to which record id.
    const tempIdToRecordId = new Map<string, string>();

    for (const node of blueprint.nodes) {
      const record = await tx.canvasNode.create({
        data: {
          projectId: project.id,
          type: node.type,
          positionX: node.positionX,
          positionY: node.positionY,
          properties: {
            label: node.label,
            role: node.role ?? '',
            importance: node.importance ?? '',
            damageEffect: node.damageEffect ?? '',
            ...node.properties,
          },
        },
      });
      tempIdToRecordId.set(node.id, record.id);
    }

    // Rewire edges from temporary node ids to real record ids.
    for (const edge of blueprint.edges) {
      await tx.canvasEdge.create({
        data: {
          projectId: project.id,
          sourceNodeId: tempIdToRecordId.get(edge.source) as string,
          targetNodeId: tempIdToRecordId.get(edge.target) as string,
          label: edge.label,
        },
      });
    }

    return tx.project.findUnique({
      where: { id: project.id },
      include: { nodes: true, edges: true },
    });
  });

  if (!created) {
    throw new Error('Blueprint persistence failed unexpectedly.');
  }

  return created as unknown as GeneratedProject;
}
