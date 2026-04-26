// build-fingerprint: 2026-04-26T23:00:00Z — fix definitivo categoria + webhook + carrinho
import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Analytics } from '@vercel/analytics/react'

// Versão do build — gerada em tempo de build pelo CI
const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION ?? new Date().toISOString()

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
})

const APP_NAME = 'ERP Ads Ativos'
const APP_DESCRIPTION = 'Sistema de gestão de produção, estoque, vendas e entregas de contas de anúncios'

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s - ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: APP_NAME,
  },
  formatDetection: { telephone: false },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: 'summary',
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
}

// Evita prerender estático que causa "useContext null" e "preload is not a function"
export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  themeColor: '#0D1B2A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

const themeScript = `
(function(){
  const k='erp-ads-theme';
  const s=localStorage.getItem(k);
  const d=window.matchMedia('(prefers-color-scheme:dark)').matches;
  if(s==='dark'||(!s&&d)) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
})();
`

const versionScript = `console.log('%c War Room OS %c Build: ${BUILD_VERSION} ', 'background:#10b981;color:#fff;font-weight:bold;padding:2px 6px;border-radius:3px 0 0 3px', 'background:#1e293b;color:#10b981;padding:2px 6px;border-radius:0 3px 3px 0');`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={plusJakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: versionScript }} />
        <meta name="x-build-version" content={BUILD_VERSION} />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  )
}
