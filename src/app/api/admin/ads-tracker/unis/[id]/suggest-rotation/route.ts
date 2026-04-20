import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

/**
 * GET — Heurística: muitos eventos Shield BLOCKED com esta UNI → sugerir rotação de proxy.
 * Integração Hospeda Info: preparar no edge / manual até existir API credenciada.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const u = await prisma.vaultIndustrialUnit.findUnique({ where: { id }, select: { id: true, killedAt: true } })
  if (!u) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const blocked = await prisma.trafficShieldAccessLog.count({
    where: { uniId: id, verdict: 'BLOCKED', createdAt: { gte: since } },
  })

  const suggest = blocked >= 8 || (!u.killedAt && blocked >= 5)

  return NextResponse.json({
    blocked24h: blocked,
    suggestRotation: suggest,
    message: suggest
      ? 'Volume elevado de tráfego retido (Shield) nesta UNI — avalie trocar o endpoint de proxy no fornecedor e atualizar o pool.'
      : 'Sem sinal forte para rotação automática nas últimas 24h.',
    hospedaInfoNote:
      'Quando existir API da Hospeda Info, o ERP pode abrir ticket ou pedir novo IP a partir deste endpoint.',
  })
}
