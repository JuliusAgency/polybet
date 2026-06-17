import test from 'node:test';
import assert from 'node:assert/strict';
import { projectMarker } from '../src/widgets/WorldCupMap/Globe/projection.ts';

const SIZE = 400;
const C = SIZE / 2;

test('projectMarker: zoom scales a marker offset linearly from the centre', () => {
  const lat = 46;
  const lng = 2;
  const phi = 0.7;
  const theta = -0.18;

  const at1 = projectMarker(lat, lng, phi, theta, SIZE, 0.92, 1);
  const at2 = projectMarker(lat, lng, phi, theta, SIZE, 0.92, 2);

  // Same visibility, and the screen offset from centre doubles at scale 2.
  assert.equal(at1.visible, at2.visible);
  const dx1 = at1.x - C;
  const dy1 = at1.y - C;
  const dx2 = at2.x - C;
  const dy2 = at2.y - C;
  assert.ok(Math.abs(dx2 - 2 * dx1) < 1e-9, 'x offset should double');
  assert.ok(Math.abs(dy2 - 2 * dy1) < 1e-9, 'y offset should double');
});

test('projectMarker: default scale = 1 (back-compat)', () => {
  const a = projectMarker(46, 2, 0.7, -0.18, SIZE, 0.92);
  const b = projectMarker(46, 2, 0.7, -0.18, SIZE, 0.92, 1);
  assert.deepEqual(a, b);
});

test('projectMarker: a front-facing point stays on the near hemisphere', () => {
  // lng = -90 faces the viewer at phi=0; centre of the front hemisphere.
  const p = projectMarker(0, -90, 0, 0, SIZE, 1, 1);
  assert.equal(p.visible, true);
  assert.ok(Math.abs(p.x - C) < 1e-6 && Math.abs(p.y - C) < 1e-6, 'sits at centre');
});
