import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('manager and admin layouts expose dedicated markets routes', () => {
  const routes = fs.readFileSync('src/app/router/routes.ts', 'utf8');
  const router = fs.readFileSync('src/app/router/Router.tsx', 'utf8');
  const managerLayout = fs.readFileSync('src/app/layouts/ManagerLayout/ManagerLayout.tsx', 'utf8');
  const adminLayout = fs.readFileSync('src/app/layouts/SuperAdminLayout/SuperAdminLayout.tsx', 'utf8');

  assert.match(routes, /MARKETS/);
  assert.match(router, /MarketsPage/);
  assert.match(managerLayout, /nav\.markets/);
  assert.match(adminLayout, /nav\.markets/);
});
