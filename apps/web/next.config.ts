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
  // lzma-purejs loads through amdefine, which breaks when bundled; Node requires it as-is.
  serverExternalPackages: ['@googleapis/drive', 'dukascopy-node', 'lzma-purejs'],
};

export default nextConfig;
