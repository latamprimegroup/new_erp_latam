// @ts-check
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  fallbacks: { document: '/~offline' },
  // Força o SW a activar imediatamente e limpar caches antigos a cada novo deploy
  skipWaiting: true,
  clientsClaim: true,
  reloadOnOnline: true,
  runtimeCaching: [
    // /api/* → NetworkOnly: nunca cachear respostas de API (dados sempre frescos)
    {
      urlPattern: /^https?:\/\/.*\/api\/.*/i,
      handler: 'NetworkOnly',
    },
    // Páginas da app → NetworkFirst com 5s timeout, fallback cache
    {
      urlPattern: /^https?:\/\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-cache',
        networkTimeoutSeconds: 5,
        expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
      },
    },
  ],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // TypeScript e ESLint são verificados no CI (GitHub Actions).
  // No build de produção (Vercel) não bloqueamos por erros de tipo para garantir deploys contínuos.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverComponentsExternalPackages: [
      'next-auth',
      '@aws-sdk/client-s3',
      '@aws-sdk/s3-request-presigner',
      '@google-cloud/storage',
      'playwright-core',
    ],
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https:",
      "frame-src 'self' https: blob:",
      "frame-ancestors 'none'",
    ].join('; ')
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
}

// Em dev, não usa PWA (evita travamento no startup). Em prod, aplica normalmente.
const config = process.env.NODE_ENV === 'development' ? nextConfig : withPWA(nextConfig)
module.exports = config
