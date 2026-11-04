import type { NextConfig } from 'next';

// Sentry error capture runs through src/instrumentation*.ts. Source-map upload is set up with the
// production Sentry project in M22.
const nextConfig: NextConfig = {
  typedRoutes: true,
  transpilePackages: [
    '@trading/backtest',
    '@trading/backtest-engine',
    '@trading/core',
    '@trading/db',
    '@trading/contract',
    '@trading/importer',
    '@trading/indicators',
    '@trading/market-data',
    '@trading/news',
    '@trading/tracker',
  ],
  serverExternalPackages: ['@googleapis/drive', 'dukascopy-node', 'lzma'],
  // Live vs backtest moved from the Tracker to the Backtest Lab (4 Nov 2026); old links keep working (query kept).
  async redirects() {
    return [{ source: '/tracker/live-vs-backtest', destination: '/backtest/live-vs-backtest', permanent: true }];
  },
};

export default nextConfig;
