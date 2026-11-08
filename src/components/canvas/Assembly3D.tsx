'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { ProjectGenerationResponse } from '@/types/canvas';

type Project = ProjectGenerationResponse['project'];
type Point = { x: number; y: number; z: number };
type Shape = 'motor' | 'propeller' | 'wheel' | 'pipe' | 'battery' | 'sensor' | 'display' | 'board' | 'frame' | 'organ' | 'cylinder' | 'box';
/** Visual-only adjustment for one component in the 3D preview; distinct from bench positions. */
type ComponentTransform = { dx: number; dy: number; dz: number; yaw: number };
const DEFAULT_TRANSFORM: ComponentTransform = { dx: 0, dy: 0, dz: 0, yaw: 0 };
const withDefaults = (value?: ComponentTransform): ComponentTransform => ({ ...DEFAULT_TRANSFORM, ...value });

const SHAPE_LEGEND: Record<Shape, { label: string; description: string }> = {
  motor: { label: 'Motor / servo', description: 'Cylindrical body with a shaft.' },
  propeller: { label: 'Propeller / rotor', description: 'Crossed blades with a central hub.' },
  wheel: { label: 'Wheel / gear', description: 'Disc with a central hub.' },
  pipe: { label: 'Pipe / vessel', description: 'Cylinder with end collars.' },
  battery: { label: 'Battery / power supply', description: 'Box with two terminals.' },
  sensor: { label: 'Sensor', description: 'Small board with a raised detector.' },
  display: { label: 'Display', description: 'Flat panel with a screen.' },
  board: { label: 'Controller / circuit board', description: 'Flat board with raised chips.' },
  frame: { label: 'Frame / structure', description: 'Open rectangular frame with a crossbar.' },
  organ: { label: 'Organ', description: 'Abstract rounded form; not anatomical.' },
  cylinder: { label: 'Pump / cylinder', description: 'Simple cylindrical form.' },
  box: { label: 'Generic component', description: 'Box used when no specific shape is recognized.' },
};

const MAX_MODEL_FACES = 50_000;
const MAX_TEXTURE_BYTES = 1_500_000;

/** A texture-coordinate pair from an OBJ `vt` record (u right, v bottom-left origin). */
export interface Uv { u: number; v: number }

/** A user-supplied texture image for one component's imported model. */
interface TextureImage { name: string; dataUrl: string; width: number; height: number }

const asTextureImage = (value: unknown): TextureImage | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<TextureImage>;
  return typeof candidate.name === 'string' && typeof candidate.dataUrl === 'string'
    && candidate.dataUrl.startsWith('data:image/') && candidate.dataUrl.length <= 3_000_000
    && typeof candidate.width === 'number' && Number.isFinite(candidate.width) && candidate.width > 0
    && typeof candidate.height === 'number' && Number.isFinite(candidate.height) && candidate.height > 0
    ? { name: candidate.name, dataUrl: candidate.dataUrl, width: candidate.width, height: candidate.height }
    : null;
};

/** Filler-aligned arrays: keep valid per-face lists, else fill with untextured/uncolored defaults. */
function alignedList<T>(value: unknown, length: number, isValid: (item: unknown) => boolean, filler: () => T): T[] {
  if (Array.isArray(value) && value.length === length && value.every(isValid)) return value as T[];
  return Array.from({ length }, filler);
}

/** Just the mesh: vertices, faces, texture coordinates, and per-face material names. */
export interface ModelGeometry { points: Point[]; faces: number[][]; uvs: Uv[]; faceUvIndices: (number[] | null)[]; faceMaterials: (string | null)[] }

/** A model the user imported (.obj), centered and scaled like the conceptual shapes. */
export interface ImportedModel extends ModelGeometry { name: string; colors: (string | null)[] }

/** Base color per conceptual category, reused to tint imported models. */
const MODEL_COLORS: Record<Shape, string> = {
  motor: '#818cf8', propeller: '#a5b4fc', wheel: '#475569', pipe: '#60a5fa',
  battery: '#fbbf24', sensor: '#2dd4bf', display: '#334155', board: '#2dd4bf',
  frame: '#94a3b8', organ: '#fda4af', cylinder: '#818cf8', box: '#60a5fa',
};

const modelsKey = (projectId: string) => `learnmate_assembly_3d_models:${projectId}`;
const texturesKey = (projectId: string) => `learnmate_assembly_3d_textures:${projectId}`;

/** Parse a minimal Wavefront OBJ: `v`, `vt`, `usemtl`, and `f` records; other records ignored. */
export function parseObj(text: string): ModelGeometry | null {
  if (!text || text.length > 8_000_000) return null;
  const points: Point[] = [];
  const uvs: Uv[] = [];
  const faces: number[][] = [];
  const faceUvIndices: (number[] | null)[] = [];
  const faceMaterials: (string | null)[] = [];
  let material: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^v\s/.test(line)) {
      const [x, y, z] = line.slice(2).trim().split(/\s+/).map(Number);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) points.push({ x, y, z });
    } else if (/^vt\s/.test(line)) {
      const [u, v] = line.slice(3).trim().split(/\s+/).map(Number);
      if (Number.isFinite(u) && Number.isFinite(v)) uvs.push({ u, v });
    } else if (/^usemtl\s/.test(line)) {
      material = line.slice(7).trim() || null;
    } else if (/^f\s/.test(line)) {
      const corners = line.slice(2).trim().split(/\s+/).map((token) => {
        const parts = token.split('/').map((part) => Number.parseInt(part, 10));
        const vertex = Number.isFinite(parts[0]) && parts[0] !== 0 ? (parts[0] > 0 ? parts[0] - 1 : points.length + parts[0]) : null;
        const texture = Number.isFinite(parts[1]) && parts[1] !== 0 ? (parts[1] > 0 ? parts[1] - 1 : uvs.length + parts[1]) : null;
        return { vertex, texture };
      }).filter((corner): corner is { vertex: number; texture: number | null } => corner.vertex !== null);
      const unique: Array<{ vertex: number; texture: number | null }> = [];
      const seen = new Set<number>();
    for (const corner of corners) {
      const vertex = corner.vertex as number;
      if (!Number.isInteger(vertex) || vertex < 0 || vertex >= points.length || seen.has(vertex)) continue;
      seen.add(vertex);
      unique.push(corner);
    }
      if (unique.length >= 3) {
        faces.push(unique.map((corner) => corner.vertex));
        faceUvIndices.push(unique.every((corner) => corner.texture !== null) ? unique.map((corner) => corner.texture as number) : null);
        faceMaterials.push(material);
      }
    }
  }
  if (!points.length || !faces.length || faces.length > MAX_MODEL_FACES) return null;
  // Center on the origin and scale so the largest dimension is ~90 units, matching the conceptual shapes.
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const point of points) {
    min.x = Math.min(min.x, point.x); max.x = Math.max(max.x, point.x);
    min.y = Math.min(min.y, point.y); max.y = Math.max(max.y, point.y);
    min.z = Math.min(min.z, point.z); max.z = Math.max(max.z, point.z);
  }
  const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  const scale = size > 0 ? 90 / size : 1;
  const round = (value: number, center: number) => Math.round((value - center) * scale * 100) / 100;
  // Drop texture coordinates that point outside the vt list; such faces render untextured.
  faceUvIndices.forEach((corners, index) => {
    if (corners && corners.some((uvIndex) => uvIndex < 0 || uvIndex >= uvs.length)) faceUvIndices[index] = null;
  });
  return { points: points.map((point) => ({ x: round(point.x, (min.x + max.x) / 2), y: round(point.y, (min.y + max.y) / 2), z: round(point.z, (min.z + max.z) / 2) })), faces, uvs, faceUvIndices, faceMaterials };
}

/** Parse an .mtl material library into CSS diffuse colors keyed by material name. `map_Kd` images are not read; a separate texture import covers those. */
export function parseMtl(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text || text.length > 2_000_000) return out;
  let current: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^newmtl\s/.test(line)) current = line.slice(7).trim() || null;
    else if (current && /^Kd\s/.test(line)) {
      const [r, g, b] = line.slice(3).trim().split(/\s+/).map((value) => Math.min(Math.max(Number.parseFloat(value), 0), 1));
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        out[current] = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
      }
    }
  }
  return out;
}

/** SVG matrix string mapping the source (texture-pixel) triangle exactly onto the dest (screen) triangle; null when the source is degenerate. */
export function textureMatrix(src: Array<{ x: number; y: number }>, dest: Array<{ x: number; y: number }>): string | null {
  if (src.length !== 3 || dest.length !== 3) return null;
  const det3 = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const base = [[src[0].x, src[0].y, 1], [src[1].x, src[1].y, 1], [src[2].x, src[2].y, 1]];
  const det = det3(base);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  const replaced = (column: number, values: number[]) => base.map((row, index) => row.map((value, j) => (j === column ? values[index] : value)));
  const round6 = (value: number) => Math.round(value * 1e6) / 1e6;
  // Solve each screen-axis system for [coefficient of sx, coefficient of sy, constant].
  const [a, c, e] = [dest[0].x, dest[1].x, dest[2].x].map((_, column) => det3(replaced(column, [dest[0].x, dest[1].x, dest[2].x])) / det);
  const [b, d, f] = [dest[0].y, dest[1].y, dest[2].y].map((_, column) => det3(replaced(column, [dest[0].y, dest[1].y, dest[2].y])) / det);
  if (![a, b, c, d, e, f].every(Number.isFinite)) return null;
  return `matrix(${round6(a)} ${round6(b)} ${round6(c)} ${round6(d)} ${round6(e)} ${round6(f)})`;
}

/** Accept from storage only entries that carry internally consistent, finite geometry. */
function sanitizeModels(value: unknown): Record<string, ImportedModel> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, ImportedModel> = {};
  for (const [id, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const model = entry as { name?: unknown; points?: unknown; faces?: unknown; uvs?: unknown; faceUvIndices?: unknown; colors?: unknown };
    if (typeof model.name !== 'string' || !Array.isArray(model.points) || !Array.isArray(model.faces)) continue;
    const rawPoints = model.points as unknown[];
    const validPoints = rawPoints.every((point) => {
      const candidate = point as Partial<Point> | null;
      return !!candidate && Number.isFinite(candidate.x) && Number.isFinite(candidate.y) && Number.isFinite(candidate.z);
    });
    if (!validPoints) continue;
    const validFaces = model.faces.every((face) => Array.isArray(face) && face.length >= 3 && face.every((index) => typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < rawPoints.length));
    if (!validFaces) continue;
    // Preserve uv indexing even if individual entries are damaged; faces mapping to them simply do not get textures.
    const uvs: Uv[] = (Array.isArray(model.uvs) ? model.uvs as unknown[] : []).map((uv) => {
      const candidate = uv as Partial<Uv> | null;
      return candidate && Number.isFinite(candidate.u) && Number.isFinite(candidate.v) ? { u: candidate.u as number, v: candidate.v as number } : { u: 0, v: 0 };
    });
    const faceUvIndices = alignedList<number[] | null>(model.faceUvIndices, model.faces.length, (item) => item === null || (Array.isArray(item) && item.length === 3 && item.every((uvIndex) => typeof uvIndex === 'number' && Number.isInteger(uvIndex) && uvIndex >= 0 && uvIndex < uvs.length)), () => null);
    const colors = alignedList<string | null>(model.colors, model.faces.length, (item) => item === null || typeof item === 'string', () => null);
    out[id] = { name: model.name, points: rawPoints as Point[], faces: model.faces as number[][], uvs, faceUvIndices, faceMaterials: alignedList<string | null>(null, model.faces.length, () => false, () => null), colors };
  }
  return out;
}

/** Infer a conceptual component category; labels take precedence over broad node types. */
export function componentShape(type: string, label: string): Shape {
  const name = label.toLowerCase();
  const category = type.toLowerCase();
  if (/\b(propeller|rotor|blade)\b/.test(name)) return 'propeller';
  if (/\b(motor|servo)\b/.test(name)) return 'motor';
  if (/\b(wheel|gear|pulley)\b/.test(name)) return 'wheel';
  if (/\b(pipe|tube|vessel|hose)\b/.test(name)) return 'pipe';
  if (/\b(battery|cell|power supply)\b/.test(name)) return 'battery';
  if (/\b(display|screen|monitor)\b/.test(name)) return 'display';
  if (/\b(sensor|detector)\b/.test(name)) return 'sensor';
  if (/\b(controller|circuit|board|processor|microcontroller)\b/.test(name)) return 'board';
  if (/\b(frame|chassis|skeleton|support)\b/.test(name)) return 'frame';
  if (/\b(heart|lung|kidney|organ)\b/.test(name)) return 'organ';
  if (category === 'sensor') return 'sensor';
  if (category === 'display') return 'display';
  if (category === 'microcontroller') return 'board';
  if (category === 'structural') return 'frame';
  if (category === 'organ') return 'organ';
  if (category === 'vessel') return 'pipe';
  if (/pump|cylinder/.test(name)) return 'cylinder';
  return 'box';
}

/** Build small colored primitives, without claiming actual dimensions or CAD geometry. */
export function geometry(shape: Shape): { points: Point[]; faces: number[][]; colors: string[] } {
  const points: Point[] = [];
  const faces: number[][] = [];
  const colors: string[] = [];
  const addFace = (indices: number[], color: string) => { faces.push(indices); colors.push(color); };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string) => {
    const start = points.length;
    points.push(
      { x: x - w, y: y - h, z: z - d }, { x: x + w, y: y - h, z: z - d },
      { x: x + w, y: y - h, z: z + d }, { x: x - w, y: y - h, z: z + d },
      { x: x - w, y: y + h, z: z - d }, { x: x + w, y: y + h, z: z - d },
      { x: x + w, y: y + h, z: z + d }, { x: x - w, y: y + h, z: z + d },
    );
    [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
      .forEach((face) => addFace(face.map((i) => i + start), color));
  };
  const cylinder = (x: number, y: number, z: number, radius: number, height: number, color: string, segments = 12) => {
    const start = points.length;
    for (const dy of [-height, height]) {
      for (let i = 0; i < segments; i++) {
        const angle = i * Math.PI * 2 / segments;
        points.push({ x: x + Math.cos(angle) * radius, y: y + dy, z: z + Math.sin(angle) * radius });
      }
    }
    addFace(Array.from({ length: segments }, (_, i) => start + i), color);
    addFace(Array.from({ length: segments }, (_, i) => start + segments + i), color);
    for (let i = 0; i < segments; i++) addFace([start + i, start + (i + 1) % segments, start + (i + 1) % segments + segments, start + i + segments], color);
  };
  switch (shape) {
    case 'motor':
      cylinder(0, 0, 0, 18, 13, '#818cf8');
      cylinder(0, -16, 0, 7, 3, '#475569');
      cylinder(0, -22, 0, 3, 4, '#cbd5e1');
      break;
    case 'propeller':
      box(0, 0, 0, 36, 2, 6, '#a5b4fc');
      box(0, 0, 0, 6, 2, 36, '#818cf8');
      cylinder(0, -3, 0, 7, 3, '#475569');
      break;
    case 'wheel':
      cylinder(0, 0, 0, 24, 7, '#475569', 16);
      cylinder(0, -8, 0, 11, 2, '#cbd5e1', 16);
      cylinder(0, -11, 0, 3, 2, '#64748b');
      break;
    case 'pipe':
      cylinder(0, 0, 0, 12, 27, '#60a5fa');
      cylinder(0, -27, 0, 16, 3, '#94a3b8');
      cylinder(0, 27, 0, 16, 3, '#94a3b8');
      break;
    case 'battery':
      box(0, 0, 0, 22, 17, 15, '#fbbf24');
      cylinder(-10, -20, 0, 4, 3, '#ef4444');
      cylinder(10, -20, 0, 4, 3, '#334155');
      break;
    case 'sensor':
      box(0, 3, 0, 22, 4, 18, '#2dd4bf');
      cylinder(0, -4, 0, 9, 4, '#334155');
      cylinder(0, -9, 0, 5, 2, '#93c5fd');
      box(-15, -3, 11, 4, 2, 3, '#fbbf24');
      break;
    case 'display':
      box(0, 0, 0, 34, 16, 4, '#334155');
      box(0, -1, -5, 29, 12, 1, '#67e8f9');
      box(0, 20, 0, 4, 4, 4, '#64748b');
      break;
    case 'board':
      box(0, 2, 0, 34, 4, 24, '#2dd4bf');
      box(0, -4, 0, 10, 3, 8, '#334155');
      box(-23, -4, -12, 5, 3, 4, '#fbbf24');
      box(23, -4, 12, 6, 3, 4, '#94a3b8');
      break;
    case 'frame':
      box(0, 0, -27, 46, 4, 5, '#94a3b8');
      box(0, 0, 27, 46, 4, 5, '#94a3b8');
      box(-41, 0, 0, 5, 4, 22, '#94a3b8');
      box(41, 0, 0, 5, 4, 22, '#94a3b8');
      box(0, 0, 0, 5, 4, 22, '#cbd5e1');
      break;
    case 'organ':
      cylinder(-9, 0, 0, 15, 12, '#fda4af');
      cylinder(9, 0, 0, 15, 12, '#fb7185');
      cylinder(0, -14, 0, 5, 4, '#e11d48');
      break;
    case 'cylinder':
      cylinder(0, 0, 0, 18, 12, '#818cf8');
      break;
    default:
      box(0, 0, 0, 29, 20, 24, '#60a5fa');
      box(0, -21, 0, 22, 1, 17, '#93c5fd');
  }
  return { points, faces, colors };
}

export default function Assembly3D({ project, nodes, edges }: { project: Project; nodes: Node[]; edges: Edge[] }) {
  const [yaw, setYaw] = useState(-35);
  const [pitch, setPitch] = useState(35);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [transforms, setTransforms] = useState<Record<string, ComponentTransform>>({});
  const [models, setModels] = useState<Record<string, ImportedModel>>({});
  const [textures, setTextures] = useState<Record<string, TextureImage>>({});
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelsNotStored, setModelsNotStored] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      try {
        const raw = window.localStorage.getItem(modelsKey(project.id));
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as { version?: unknown; models?: unknown };
        if (parsed.version !== 1) return;
        if (!cancelled) setModels(sanitizeModels(parsed.models));
      } catch {
        if (!cancelled) setModelsNotStored(true);
      }
      try {
        const rawTexture = window.localStorage.getItem(texturesKey(project.id));
        if (rawTexture && !cancelled) {
          const parsedTexture = JSON.parse(rawTexture) as { version?: unknown; textures?: unknown };
          const saved: Record<string, TextureImage> = {};
          if (parsedTexture.version === 1 && parsedTexture.textures && typeof parsedTexture.textures === 'object') {
            for (const [id, value] of Object.entries(parsedTexture.textures as Record<string, unknown>)) {
              const texture = asTextureImage(value);
              if (texture) saved[id] = texture;
            }
          }
          if (Object.keys(saved).length > 0 && !cancelled) setTextures(saved);
        }
      } catch {
        if (!cancelled) setModelsNotStored(true);
      }
    })();
    return () => { cancelled = true; };
  }, [project.id]);

  const scene = useMemo(() => {
    const components = nodes.flatMap((node) => {
      const part = project.nodes.find((item) => item.id === node.id);
      if (!part) return [];
      const label = typeof part.properties?.label === 'string' && part.properties.label.trim() ? part.properties.label : part.type;
      const shape = componentShape(part.type, label);
      const imported = models[part.id];
      const modelGeometry = imported
        ? { points: imported.points, faces: imported.faces, colors: imported.colors.map((color) => color ?? MODEL_COLORS[shape]) }
        : geometry(shape);
      return [{
        id: part.id, label, type: part.type, shape, model: imported ?? undefined, ...modelGeometry,
        uvs: imported ? imported.uvs : [],
        faceUvIndices: imported ? imported.faceUvIndices : [],
        texture: imported ? textures[part.id] : undefined,
        position: node.position,
      }];
    });
    if (!components.length) return { faces: [], clipPaths: [], labels: [], links: [], components: [] };
    const centerX = (Math.min(...components.map((c) => c.position.x)) + Math.max(...components.map((c) => c.position.x))) / 2;
    const centerZ = (Math.min(...components.map((c) => c.position.y)) + Math.max(...components.map((c) => c.position.y))) / 2;
    const range = Math.max(300, ...components.map((c) => Math.max(Math.abs(c.position.x - centerX), Math.abs(c.position.y - centerZ)) * 2));
    const scale = Math.min(1, 450 / range);
    const a = yaw * Math.PI / 180;
    const b = pitch * Math.PI / 180;
    const projectPoint = (point: Point) => {
      const x = point.x * Math.cos(a) - point.z * Math.sin(a);
      const z = point.x * Math.sin(a) + point.z * Math.cos(a);
      return { x: 350 + x * zoom, y: 200 + (point.y * Math.cos(b) - z * Math.sin(b)) * zoom, depth: point.y * Math.sin(b) + z * Math.cos(b) };
    };
    const centers = new Map<string, ReturnType<typeof projectPoint>>();
    const labels: Array<{ id: string; label: string; x: number; y: number }> = [];
    const faces: Array<{ id: string; key: string; points: string; depth: number; color: string; texture?: { dataUrl: string; width: number; height: number; matrix: string } }> = [];
    const clipPaths: Array<{ key: string; points: string }> = [];
    for (const component of components) {
      const transform = withDefaults(transforms[component.id]);
      const yawRad = transform.yaw * Math.PI / 180;
      const cosYaw = Math.cos(yawRad);
      const sinYaw = Math.sin(yawRad);
      const origin = { x: (component.position.x - centerX) * scale + transform.dx, y: -transform.dy, z: (component.position.y - centerZ) * scale + transform.dz };
      const center = projectPoint(origin);
      centers.set(component.id, center);
      labels.push({ id: component.id, label: component.label, x: center.x, y: center.y - 28 * zoom });
      const points = component.points.map((p) => {
        const x = p.x * cosYaw - p.z * sinYaw;
        const z = p.x * sinYaw + p.z * cosYaw;
        return projectPoint({ x: x + origin.x, y: p.y + origin.y, z: z + origin.z });
      });
      component.faces.forEach((face, index) => {
        const projected = face.map((i) => points[i]);
        const depth = projected.reduce((sum, p) => sum + p.depth, 0) / projected.length;
        faces.push({ id: component.id, key: `${component.id}-${index}`, points: projected.map((p) => `${p.x},${p.y}`).join(' '), depth, color: component.colors[index] });
        const texture = component.texture;
        const uvIndices = component.faceUvIndices[index];
        if (!texture || !uvIndices) return;
        // Fan-triangulate and map the texture with an exact per-triangle affine transform; a slight depth bias keeps the image above its backing face.
        for (let corner = 1; corner + 1 < face.length; corner++) {
          const triangle = [projected[0], projected[corner], projected[corner + 1]];
          const source = [uvIndices[0], uvIndices[corner], uvIndices[corner + 1]].map((uvIndex) => {
            const uv = component.uvs[uvIndex];
            return { x: uv.u * texture.width, y: (1 - uv.v) * texture.height };
          });
          const matrix = textureMatrix(source, triangle);
          if (!matrix) continue;
          const trianglePoints = triangle.map((p) => `${p.x},${p.y}`).join(' ');
          clipPaths.push({ key: `${component.id}-t${index}-${corner}`, points: trianglePoints });
          faces.push({ id: component.id, key: `${component.id}-t${index}-${corner}`, points: trianglePoints, depth: depth - 0.01, color: component.colors[index], texture: { dataUrl: texture.dataUrl, width: texture.width, height: texture.height, matrix } });
        }
      });
    }
    const links = edges.flatMap((edge) => {
      const source = centers.get(edge.source);
      const target = centers.get(edge.target);
      return source && target ? [{ id: edge.id, source, target }] : [];
    });
    return { faces: faces.sort((a, b) => b.depth - a.depth), clipPaths, labels, links, components };
  }, [project.nodes, nodes, edges, yaw, pitch, zoom, transforms, models, textures]);

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div><h5 className="font-semibold text-slate-900">3D assembly overview</h5><p className="mt-1 text-xs text-slate-600">Conceptual shapes follow the parts and positions on your bench. They are not accurate CAD, scale, dimensions, or a physics simulation. Select a part and import your own .obj model for a more accurate representation.</p></div>
      {nodes.length === 0 ? <p className="rounded-lg bg-white p-5 text-sm text-slate-500">Add components to the bench to see them here.</p> : <>
        <svg role="img" aria-label={`Conceptual 3D assembly of ${project.title}`} viewBox="0 0 700 400" className="h-72 w-full rounded-lg border border-slate-200 bg-white sm:h-96">
          {scene.clipPaths.length > 0 && <defs>{scene.clipPaths.map((clip) => <clipPath key={clip.key} id={`clip-${clip.key}`}><polygon points={clip.points} /></clipPath>)}</defs>}
          {scene.links.map((link) => <line key={link.id} x1={link.source.x} y1={link.source.y} x2={link.target.x} y2={link.target.y} stroke="#a5b4fc" strokeWidth="3" strokeDasharray="5 4" />)}
          {scene.faces.map((face) => face.texture ? (
            <g key={face.key} clipPath={`url(#clip-${face.key})`}>
              <image href={face.texture.dataUrl} x={0} y={0} width={face.texture.width} height={face.texture.height} preserveAspectRatio="none" transform={face.texture.matrix} onClick={() => setSelected(face.id)} />
              {selected === face.id && <polygon points={face.points} fill="none" stroke="#312e81" strokeWidth="2" />}
            </g>
          ) : (
            <polygon key={face.key} points={face.points} fill={face.color} fillOpacity={selected === face.id ? 1 : 0.8} stroke={selected === face.id ? '#312e81' : '#475569'} strokeWidth={selected === face.id ? 2 : 1} onClick={() => setSelected(face.id)} />
          ))}
          {scene.labels.map((label) => <text key={label.id} x={label.x} y={label.y} textAnchor="middle" fontSize="11" fontWeight="600" fill="#1e293b" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">{label.label}</text>)}
        </svg>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-600">Rotate <input className="block w-full accent-indigo-600" type="range" min="-180" max="180" value={yaw} onChange={(event) => setYaw(Number(event.target.value))} /></label>
          <label className="text-xs text-slate-600">Tilt <input className="block w-full accent-indigo-600" type="range" min="0" max="80" value={pitch} onChange={(event) => setPitch(Number(event.target.value))} /></label>
          <label className="text-xs text-slate-600">Zoom <input className="block w-full accent-indigo-600" type="range" min="0.5" max="2" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <h6 className="text-sm font-semibold text-slate-900">Component shape legend</h6>
          <p className="mt-1 text-xs text-slate-600">Names come from the blueprint. Shape categories are inferred from names and types, and may not match the real component. Dashed lines show connections on the bench, not physical wires.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {scene.components.map((component) => {
              const legend = SHAPE_LEGEND[component.shape];
              return (
                <li key={component.id}>
                  <button type="button" aria-pressed={selected === component.id} onClick={() => setSelected(component.id)} className={`w-full rounded-lg border p-2 text-left text-xs transition ${selected === component.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <span className="block font-semibold text-slate-900">{component.label}</span>
                    <span className="block text-indigo-700">{component.model ? `Imported model: ${component.model.name}` : `Conceptual shape: ${legend.label}`}</span>
                    {component.model && component.texture && <span className="block text-teal-700">Texture: {component.texture.name}</span>}
                    {!component.model && <span className="block text-slate-600">{legend.description}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {selected && (() => {
        const transform = withDefaults(transforms[selected]);
        const label = scene.labels.find((item) => item.id === selected)?.label ?? 'component';
        const setTransform = (patch: Partial<ComponentTransform>) => setTransforms((current) => ({ ...current, [selected]: withDefaults({ ...current[selected], ...patch }) }));
        const resetTransform = () => setTransforms((current) => { const next = { ...current }; delete next[selected]; return next; });
        const persist = (modelsValue: Record<string, ImportedModel>, texturesValue: Record<string, TextureImage>) => {
          try {
            window.localStorage.setItem(modelsKey(project.id), JSON.stringify({ version: 1, models: modelsValue }));
            window.localStorage.setItem(texturesKey(project.id), JSON.stringify({ version: 1, textures: texturesValue }));
            setModelsNotStored(false);
          } catch {
            setModelsNotStored(true);
          }
        };
        const handleModelFiles = async (files: File[]) => {
          const objFile = files.find((file) => /\.obj$/i.test(file.name));
          const mtlFile = files.find((file) => /\.mtl$/i.test(file.name));
          if (!objFile) { setModelError('Select an .obj file.'); return; }
          if (objFile.size > 4_000_000) { setModelError('The .obj file exceeds the 4 MB limit.'); return; }
          try {
            const parsed = parseObj(await objFile.text());
            if (!parsed) { setModelError('Could not use that model. Use a readable .obj with up to ' + MAX_MODEL_FACES.toLocaleString() + ' faces.'); return; }
            const materials = mtlFile ? parseMtl(await mtlFile.text()) : {};
            const next = { ...models, [selected]: { ...parsed, name: objFile.name, colors: parsed.faceMaterials.map((name) => (name && materials[name]) || null) } };
            const nextTextures = { ...textures };
            delete nextTextures[selected];
            setModels(next);
            setTextures(nextTextures);
            setModelError(null);
            persist(next, nextTextures);
          } catch {
            setModelError('Could not read that file.');
          }
        };
        const handleTextureFile = async (file: File) => {
          if (file.size > MAX_TEXTURE_BYTES) { setModelError('The texture exceeds the 1.5 MB limit.'); return; }
          try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === 'string') resolve(reader.result);
                else reject(new Error('empty'));
              };
              reader.onerror = () => reject(new Error('read failed'));
              reader.readAsDataURL(file);
            });
            const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
              const image = new window.Image();
              image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
              image.onerror = () => reject(new Error('decode failed'));
              image.src = dataUrl;
            });
            const nextTextures = { ...textures, [selected]: { name: file.name, dataUrl, width: dimensions.width, height: dimensions.height } };
            setTextures(nextTextures);
            setModelError(null);
            persist(models, nextTextures);
          } catch {
            setModelError('Could not read that image.');
          }
        };
        return (
          <div className="rounded-lg border border-indigo-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h6 className="text-sm font-semibold text-slate-900">Adjust “{label}”</h6>
              <button type="button" onClick={resetTransform} className="text-xs font-semibold text-indigo-700 underline">Reset this part</button>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-4">
              <label className="text-xs text-slate-600">Move X <input className="block w-full accent-indigo-600" type="range" min="-150" max="150" value={transform.dx} onChange={(event) => setTransform({ dx: Number(event.target.value) })} /></label>
              <label className="text-xs text-slate-600">Move Z <input className="block w-full accent-indigo-600" type="range" min="-150" max="150" value={transform.dz} onChange={(event) => setTransform({ dz: Number(event.target.value) })} /></label>
              <label className="text-xs text-slate-600">Lift <input className="block w-full accent-indigo-600" type="range" min="-120" max="120" value={transform.dy} onChange={(event) => setTransform({ dy: Number(event.target.value) })} /></label>
              <label className="text-xs text-slate-600">Rotate <input className="block w-full accent-indigo-600" type="range" min="-180" max="180" value={transform.yaw} onChange={(event) => setTransform({ yaw: Number(event.target.value) })} /></label>
            </div>
            <p className="mt-2 text-xs text-slate-500">Select another part in the legend or scene to adjust it. These tweaks reposition and reorient the 3D preview only; the bench layout and saved assembly stay unchanged.</p>
            <div className="mt-3 border-t border-indigo-100 pt-3" data-testid="model-import">
              <p className="text-xs font-semibold text-slate-700">3D model for this part</p>
              {models[selected] ? (
                <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-slate-600">Imported: {models[selected].name}{models[selected].colors.every((color) => color === null) ? '' : ' · with .mtl materials'}</span>
                  <button type="button" onClick={() => {
                    const next = { ...models };
                    delete next[selected];
                    const nextTextures = { ...textures };
                    delete nextTextures[selected];
                    setModels(next);
                    setTextures(nextTextures);
                    setModelError(null);
                    persist(next, nextTextures);
                  }} className="shrink-0 font-semibold text-red-700 underline">Remove model</button>
                </div>
              ) : <p className="mt-1 text-xs text-slate-500">Optional: import an .obj model (max {MAX_MODEL_FACES.toLocaleString()} faces, 4 MB) to replace the conceptual shape.</p>}
              <input type="file" multiple accept=".obj,.mtl" onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void handleModelFiles(files); }} className="mt-2 block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-indigo-700" />
              <p className="mt-1 text-xs text-slate-500">Select the model together with its .mtl file to apply material colors.</p>
              {models[selected] ? (models[selected].uvs.length > 0 && models[selected].faceUvIndices.some(Boolean) ? (
                <div className="mt-2 space-y-1">
                  <p className="text-xs font-semibold text-slate-700">Texture for this part</p>
                  {textures[selected] ? (
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-slate-600">Mapped: {textures[selected].name}</span>
                      <button type="button" onClick={() => { const nextTextures = { ...textures }; delete nextTextures[selected]; setTextures(nextTextures); setModelError(null); persist(models, nextTextures); }} className="shrink-0 font-semibold text-red-700 underline">Remove texture</button>
                    </div>
                  ) : <p className="text-xs text-slate-500">Optional: map an image (max 1.5 MB) using this model’s texture coordinates.</p>}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleTextureFile(file); }} className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-teal-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-teal-700" />
                </div>
              ) : <p className="mt-2 text-xs text-slate-500">This model has no texture coordinates, so image textures cannot be mapped. Diffuse colors from .mtl still apply.</p>) : null}
              {modelError && <p className="mt-1 text-xs text-red-700">{modelError}</p>}
              {modelsNotStored && <p className="mt-1 text-xs text-amber-800">Imported models and textures could not be saved in this browser; they last until the page is refreshed.</p>}
            </div>
          </div>
        );
      })()}
      </>}
    </section>
  );
}
