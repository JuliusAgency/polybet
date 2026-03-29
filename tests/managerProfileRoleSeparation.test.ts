import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const pageFile = path.resolve('src/pages/super-admin/ManagerProfilePage/ManagerProfilePage.tsx');
const enFile = path.resolve('src/shared/i18n/locales/en/translation.json');
const heFile = path.resolve('src/shared/i18n/locales/he/translation.json');

const pageSource = readFileSync(pageFile, 'utf8');
const enSource = readFileSync(enFile, 'utf8');
const heSource = readFileSync(heFile, 'utf8');

test('manager profile page separates manager identity from managed users and exposes effective bet limit controls', () => {
  assert.match(pageSource, /t\('managerProfile\.managerSectionTitle'\)/);
  assert.match(pageSource, /t\('managerProfile\.managerRoleBadge'\)/);
  assert.match(pageSource, /t\('managerProfile\.managedUsersSectionTitle'\)/);
  assert.match(pageSource, /t\('managerProfile\.userRoleBadge'\)/);
  assert.match(pageSource, /t\('managerProfile\.effectiveBetLimit'\)/);
  assert.match(pageSource, /t\('managerProfile\.effectiveBetLimitHelp'\)/);
  assert.match(pageSource, /t\('managerProfile\.limitInputLabel'\)/);
  assert.match(pageSource, /t\('managerProfile\.setLimit'\)/);
  assert.match(pageSource, /t\('managerProfile\.clearLimit'\)/);
  assert.match(pageSource, /useBetLimitSettings\(/);
  assert.match(pageSource, /useSetManagerBetLimit\(/);
  assert.match(pageSource, /useSetUserBetLimit\(/);
  assert.match(pageSource, /managerProfile\.managerSectionTitle[\s\S]*managerProfile\.managedUsersSectionTitle/s);
  assert.doesNotMatch(pageSource, /\{manager && \([\s\S]*<table className="w-full text-sm">[\s\S]*managerProfile\.managedUsersSectionTitle/s);
});

test('manager profile translations define the split IA and effective limit copy in English and Hebrew', () => {
  for (const source of [enSource, heSource]) {
    assert.match(source, /"managerSectionTitle"\s*:/);
    assert.match(source, /"managerRoleBadge"\s*:/);
    assert.match(source, /"managedUsersSectionTitle"\s*:/);
    assert.match(source, /"userRoleBadge"\s*:/);
    assert.match(source, /"effectiveBetLimit"\s*:/);
    assert.match(source, /"effectiveBetLimitHelp"\s*:/);
    assert.match(source, /"limitInputLabel"\s*:/);
    assert.match(source, /"setLimit"\s*:/);
    assert.match(source, /"clearLimit"\s*:/);
  }
});
