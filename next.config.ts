import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Fluent's packages re-export thousands of modules; load only the ones the app imports.
    optimizePackageImports: ['@fluentui/react-components', '@fluentui/react-icons'],
  },
  // Baseline security headers for every page. No Content-Security-Policy: Fluent (Griffel) injects
  // inline styles, and email HTML is already isolated in a sandboxed frame with its own CSP.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
