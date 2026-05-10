import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Source-level guards covering the user-visible Yes/No / long-tail behaviour:
// EventDetailPage sorts multi-market events, all four card components route
// through the canonical helpers, and OutcomeButtons accepts the longTail prop.
// These tests catch regressions where someone reverts one site to
// `market_outcomes[0]` indexing and ships a Yes/No swap again.

test('EventDetailPage sorts multi-market events by yes-probability', () => {
  const src = fs.readFileSync('src/pages/user/EventDetailPage/EventDetailPage.tsx', 'utf8');
  assert.match(src, /sortMarketsByYesDesc/);
  assert.match(src, /rawMarkets\.length > 1 \? sortMarketsByYesDesc/);
});

test('Card components use getOrderedOutcomes / getYesProbability', () => {
  const files = [
    'src/widgets/EventCard/EventCard.tsx',
    'src/widgets/MarketCard/MarketCard.tsx',
    'src/pages/user/EventDetailPage/components/EventMarketRow/EventMarketRow.tsx',
  ];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /getOrderedOutcomes/, `${file} must use getOrderedOutcomes`);
    assert.match(src, /getYesProbability|isLongTailMarket/, `${file} must read Yes via helper`);
    // Make sure the legacy [0] indexing didn't sneak back into the outcome
    // mapping (defensive — false positives are easy to silence by renaming).
    assert.doesNotMatch(
      src,
      /market\.market_outcomes\[0\]/,
      `${file} should not index market_outcomes[0] directly`
    );
  }
});

test('OutcomeButtons accepts longTail prop and applies dim treatment', () => {
  const src = fs.readFileSync('src/shared/ui/OutcomeButtons/OutcomeButtons.tsx', 'utf8');
  assert.match(src, /longTail\?: boolean/);
  assert.match(src, /longTail\s*=\s*false/);
  // The dim path should set Yes to a muted neutral colour and intensify No.
  assert.match(src, /color: 'var\(--color-text-muted\)'/);
});
