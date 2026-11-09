import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGeometryParameter, previewHeightFor } from './lab-geometry';
import type { VirtualLabProtocol } from '@/types/lab';

function labWith(geometryParameterId: string | undefined): VirtualLabProtocol {
  return {
    simulationWorkbench: {
      engineName: 'test',
      description: '',
      formulaDisplay: '',
      geometryParameterId,
      parameters: [
        { id: 'a', label: 'A', unit: '', defaultValue: 1, min: 0, max: 2, step: 1, description: '' },
        { id: 'b', label: 'B', unit: '', defaultValue: 1, min: 0, max: 2, step: 1, description: '' },
      ],
      telemetryOutputs: [],
    },
  } as unknown as VirtualLabProtocol;
}

test('keeps a valid geometryParameterId', () => {
  const lab = labWith('b');
  normalizeGeometryParameter(lab);
  assert.equal(lab.simulationWorkbench.geometryParameterId, 'b');
});

test('falls back to the first parameter when the id is missing', () => {
  const lab = labWith(undefined);
  normalizeGeometryParameter(lab);
  assert.equal(lab.simulationWorkbench.geometryParameterId, 'a');
});

test('falls back to the first parameter when the id is unknown', () => {
  const lab = labWith('nope');
  normalizeGeometryParameter(lab);
  assert.equal(lab.simulationWorkbench.geometryParameterId, 'a');
});

test('maps parameter range onto the 20-60 mm preview height', () => {
  assert.equal(previewHeightFor(0, 0, 10), 20);
  assert.equal(previewHeightFor(10, 0, 10), 60);
  assert.equal(previewHeightFor(5, 0, 10), 40);
});

test('does not divide by zero when min equals max', () => {
  assert.equal(previewHeightFor(3, 3, 3), 20);
});
