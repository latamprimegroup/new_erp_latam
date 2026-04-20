import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { tcpProbeHostPort } from '@/lib/ads-tracker/proxy-tcp-probe'
import { appendUniActivityLog } from '@/lib/ads-tracker/uni-activity-log'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

/** POST — TCP probe ao host:port do proxy (não é teste HTTP completo). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const u = await prisma.vaultIndustrialUnit.findUnique({
    where: { id },
    include: { matchedProxy: true },
  })
  if (!u) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  if (!u.matchedProxy) {
    return NextResponse.json({ error: 'UNI sem proxy associado' }, { status: 400 })
  }

  const port = Number.parseInt(u.matchedProxy.proxyPort.replace(/\D/g, ''), 10) || 0
  if (!port) {
    return NextResponse.json({ error: 'Porta inválida' }, { status: 400 })
  }

  const r = await tcpProbeHostPort(u.matchedProxy.proxyHost, port, 5000)
  const now = new Date()

  await prisma.vaultIndustrialUnit.update({
    where: { id },
    data: {
      lastProxyProbeAt: now,
      lastProxyProbeOk: r.ok,
      lastProxyProbeMs: r.ms,
    },
  })

  const msg = r.ok
    ? `Probe proxy OK (${r.ms} ms)`
    : `Probe proxy falhou: ${r.error || 'desconhecido'}`
  await appendUniActivityLog(prisma, id, 'probe', msg)

  return NextResponse.json({
    ok: r.ok,
    ms: r.ms,
    error: r.error ?? null,
    datacenterBlacklistNote:
      'Lista pública de datacenter não está integrada — use política no edge / fornecedor do proxy.',
  })
}
