import test from 'node:test';
import assert from 'node:assert/strict';
import { getButtonClassName } from '../src/shared/ui/Button/className.ts';

test('getButtonClassName adds disabled styles for disabled buttons', () => {
  const className = getButtonClassName({
    variant: 'primary',
    disabled: true,
  });

  assert.match(className, /cursor-not-allowed/);
  assert.match(className, /opacity-60/);
  assert.doesNotMatch(className, /hover:bg-blue-700/);
});

test('getButtonClassName keeps interactive styles for enabled buttons', () => {
  const className = getButtonClassName({
    variant: 'primary',
    disabled: false,
  });

  assert.match(className, /cursor-pointer/);
  assert.match(className, /hover:bg-blue-700/);
});
