import type { VirtualLabProtocol } from '@/types/lab';

// Ensure geometryParameterId names a real simulator parameter. If the AI omits it or
// names an unknown id, point it at the first parameter so the 3D preview always links.
export function normalizeGeometryParameter(lab: VirtualLabProtocol): void {
  const params = lab.simulationWorkbench?.parameters ?? [];
  const id = lab.simulationWorkbench?.geometryParameterId;
  if (params.length === 0) return;
  if (!id || !params.some((p) => p.id === id)) {
    lab.simulationWorkbench.geometryParameterId = params[0].id;
  }
}

// Map a parameter's value onto the 20-60 mm enclosure height used by the 3D preview.
export function previewHeightFor(value: number, min: number, max: number): number {
  return 20 + (40 * (value - min)) / (max - min || 1);
}
