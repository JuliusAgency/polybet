import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  walkAsks,
  serializeSide,
  type BookLevel,
} from '../supabase/functions/quote-bet/walkAsks.ts';

// Regression guard for the bet-quote book walk (Task B).
//
// The DISPLAYED quote (BetSlip) walks the full freshly-fetched CLOB book; the
// EXECUTABLE quote (place_bet -> quote_bet_payout) walks only the levels we
// persist into market_outcome_books via serializeSide(). If serializeSide
// truncates below the depth a stake consumes, the user sees a payout the server
// cannot honor. These tests pin both the walk arithmetic and the shown ==
// executable invariant for a deep order.

// Reconstruct a BookLevel[] from the flat [p0,s0,p1,s1,...] persisted form so we
// can re-walk exactly what quote_bet_payout would walk in SQL.
function flatToLevels(flat: number[]): BookLevel[] {
  const levels: BookLevel[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    levels.push({ price: String(flat[i]), size: String(flat[i + 1]) });
  }
  return levels;
}

// 15 ascending ask levels, 10 shares each. First 10 levels hold ~$54.5 of depth,
// so a $70 stake must consume ~13 levels — past the old TOP_N_LEVELS = 10 cap.
function deepBook(): BookLevel[] {
  const levels: BookLevel[] = [];
  for (let i = 0; i < 15; i++) {
    const price = 0.5 + i * 0.01; // 0.50 .. 0.64
    levels.push({ price: price.toFixed(2), size: '10' });
  }
  return levels;
}

test('walkAsks fills a single deep level at its price (Knicks-style top-of-book)', () => {
  // Mirrors the live Knicks "Yes" book: a huge best level absorbs the whole stake.
  const book: BookLevel[] = [
    { price: '0.535', size: '31874.3' },
    { price: '0.54', size: '4051' },
  ];
  const r = walkAsks(book, 10000);
  assert.equal(r.partial, false);
  // 10000 / 0.535 = 18691.58...
  assert.ok(Math.abs(r.shares - 18691.59) < 0.5, `shares=${r.shares}`);
  assert.ok(Math.abs(r.avgPrice - 0.535) < 1e-6, `avg=${r.avgPrice}`);
});

test('persisted depth (serializeSide) covers a stake that eats past 10 levels', () => {
  const book = deepBook();
  const stake = 70; // needs ~13 levels

  const full = walkAsks(book, stake);
  assert.equal(full.partial, false, 'full book should fully fill $70');

  // Re-walk exactly what quote_bet_payout would walk: the persisted, serialized book.
  const persisted = flatToLevels(serializeSide(book, false));
  const executable = walkAsks(persisted, stake);

  // shown == executable: the persisted depth must not truncate the fill.
  assert.equal(executable.partial, false, 'persisted book must fully fill $70 too');
  assert.ok(
    Math.abs(executable.shares - full.shares) < 1e-6,
    `executable shares ${executable.shares} != displayed ${full.shares}`
  );
  assert.ok(Math.abs(executable.avgPrice - full.avgPrice) < 1e-9);
});

test('serializeSide keeps full realistic depth and stays price-sorted ascending', () => {
  const flat = serializeSide(deepBook(), false);
  // 15 levels * 2 numbers, none dropped at the 100-level cap.
  assert.equal(flat.length, 30);
  for (let i = 2; i < flat.length; i += 2) {
    assert.ok(flat[i] >= flat[i - 2], 'asks must be ascending by price');
  }
});
