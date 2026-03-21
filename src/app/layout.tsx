import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" className={plusJakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
