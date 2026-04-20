import Link from 'next/link'
import { getServerSession } from 'next-auth/next'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'

const ROLES = new Set(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'])

export default async function AdsTrackerLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ROLES.has(session.user.role)) {
    redirect('/dashboard')
  }

  const financeOnly = session.user.role === 'FINANCE'

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3">
        {!financeOnly && (
          <Link
            href="/dashboard/ads-tracker"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80"
          >
            Módulo 01 — Central
          </Link>
        )}
        <Link
          href="/dashboard/ads-tracker/finance"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80"
        >
          Módulo 02 — ROI &amp; caixa
        </Link>
        {!financeOnly && (
          <Link
            href="/dashboard/ads-tracker/shield"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80"
          >
            Módulo 03 — Traffic Shield
          </Link>
        )}
        {!financeOnly && (
          <Link
            href="/dashboard/ads-tracker/landings"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80"
          >
            Módulo 04 — Landings
          </Link>
        )}
        <Link
          href="/dashboard/ads-tracker/offers"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80"
        >
          Módulo 05 — Ofertas
        </Link>
        <Link
          href="/dashboard/ads-tracker/checkout"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80"
        >
          Módulo 06 — Checkout
        </Link>
        <Link
          href="/dashboard/ads-tracker/traffic-sources"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80"
        >
          Módulo 07 — Fontes
        </Link>
        <Link
          href="/dashboard/ads-tracker/conversion-events"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80"
        >
          Módulo 08 — Conversões
        </Link>
        <Link
          href="/dashboard/ads-tracker/lead-audit"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80"
        >
          Módulo 09 — Logs de leads
        </Link>
        <Link
          href="/dashboard/ads-tracker/s2s-postback-logs"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80"
        >
          Módulo 10 — S2S postbacks
        </Link>
        {!financeOnly && (
          <Link
            href="/dashboard/ads-tracker/uni-management"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80"
          >
            Módulo 11 — UNIs
          </Link>
        )}
        <Link
          href="/dashboard/ads-tracker/domain-reputation"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80"
        >
          Módulo 13 — Domínios (Safe Browsing)
        </Link>
        <Link
          href="/dashboard/ads-tracker/ltv-attribution"
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80"
        >
          Módulo 14 — LTV por lead
        </Link>
      </nav>
      {children}
    </div>
  )
}
