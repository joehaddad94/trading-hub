/**
 * Module boundary rules — tech-architecture.md §3.
 * Run from the repo root: `pnpm boundaries`.
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-module-imports',
      comment: 'A module must not import another module. Shared code goes to shell/, lib/ or a package.',
      severity: 'error',
      from: { path: '^apps/web/src/modules/([^/]+)/' },
      to: {
        path: '^apps/web/src/modules/([^/]+)/',
        pathNot: '^apps/web/src/modules/$1/',
      },
    },
    {
      name: 'packages-not-depend-on-apps',
      comment: 'packages/* must not import from apps/*.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'packages-no-next-or-react',
      comment: 'packages/* must not depend on Next.js or React.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: 'node_modules/(next|react|react-dom)/' },
    },
    {
      name: 'pure-packages-no-io',
      comment: 'core, contract, indicators and backtest-engine are pure: no DB, network or server-only code.',
      severity: 'error',
      from: { path: '^packages/(core|contract|indicators|backtest-engine)/' },
      to: {
        path: [
          '^packages/(db|importer|market-data)/',
          'node_modules/(drizzle-orm|postgres|@supabase|@googleapis|server-only)/',
        ],
      },
    },
    {
      name: 'db-access-only-on-server',
      comment: 'Only modules/*/server, lib/ and route handlers may reach the database package.',
      severity: 'error',
      from: {
        path: '^apps/web/src/',
        pathNot: ['^apps/web/src/modules/[^/]+/server/', '^apps/web/src/lib/', '^apps/web/src/app/api/'],
      },
      to: { path: ['^packages/db/', 'node_modules/(drizzle-orm|postgres)/'] },
    },
    {
      name: 'not-to-unresolvable',
      comment: 'Imports must resolve — an undeclared dependency would otherwise slip past the rules above.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(\\.next|dist|coverage|node_modules)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
  },
};
