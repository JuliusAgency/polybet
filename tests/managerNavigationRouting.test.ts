import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = '/home/dmitriy/Projects/JuliusAgency/polybet/polybet';
const routerFile = path.join(projectRoot, 'src/app/router/Router.tsx');

test('manager router uses explicit page modules and maps activity route to UserActivityPage', () => {
  const source = readFileSync(routerFile, 'utf8');

  assert.match(
    source,
    /import UserActivityPage from '@\/pages\/manager\/UserActivityPage\/UserActivityPage';/,
  );
  assert.match(source, /<Route path="activity" element={<UserActivityPage \/>} \/>/);
  assert.match(
    source,
    /import UsersManagementPage from '@\/pages\/manager\/UsersManagementPage\/UsersManagementPage';/,
  );
  assert.match(
    source,
    /import ReportsPage from '@\/pages\/manager\/ReportsPage\/ReportsPage';/,
  );
});
