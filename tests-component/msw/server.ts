import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Single MSW server instance shared across the component test suite.
// Per-test handlers are layered on top via server.use(...) and torn down
// by the resetHandlers() call in setup.ts.
export const server = setupServer(...handlers);
