import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { LeadAuditLogsClient } from './LeadAuditLogsClient'

export default async function LeadAuditPage() {
  const session = await getServerSession(authOptions)
  const canBan = session?.user?.role !== 'FINANCE'

  return (
    <div className="space-y-4 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Logs de leads e auditoria</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Módulo 09 — caixa-preta do tráfego Ads Ativos: GCLID/UTMs, rede (ASN/ISP), UA bruto, heurísticas de abuso e
          exportação de IPs para análise ou exclusões. Os dados dependem do edge reportar campos no ingest.
        </p>
      </div>
      <LeadAuditLogsClient canBan={canBan} />
    </div>
  )
}
