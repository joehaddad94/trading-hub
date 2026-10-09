import type { NextConfig } from 'next';

// Sentry error capture runs through src/instrumentation*.ts. Source-map upload is set up with the
// production Sentry project in M22.
const nextConfig: NextConfig = {
  typedRoutes: true,
  transpilePackages: [
    '@trading/core',
    '@trading/db',
    '@trading/contract',
    '@trading/importer',
    '@trading/market-data',
    '@trading/news',
    '@trading/tracker',
  ],
  serverExternalPackages: ['@googleapis/drive', 'dukascopy-node'],
};

export default nextConfig;
