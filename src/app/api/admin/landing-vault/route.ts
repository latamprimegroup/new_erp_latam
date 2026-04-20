import { NextResponse } from 'next/server'
import { TrackerLandingVaultStack, TrackerLandingVaultStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildScriptHygieneHints, formatHygieneHints } from '@/lib/landing-vault/script-hygiene'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

function stackOk(s: string): s is TrackerLandingVaultStack {
  return Object.values(TrackerLandingVaultStack).includes(s as TrackerLandingVaultStack)
}

function statusOk(s: string): s is TrackerLandingVaultStatus {
  return Object.values(TrackerLandingVaultStatus).includes(s as TrackerLandingVaultStatus)
}

export async function GET(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const includeArchived = searchParams.get('includeArchived') === '1'

  const rows = await prisma.trackerLandingVault.findMany({
    where: includeArchived ? {} : { status: { not: TrackerLandingVaultStatus.ARCHIVED } },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: { _count: { select: { tokens: true } } },
  })

  return NextResponse.json({
    landings: rows.map((r) => ({
      id: r.id,
      name: r.name,
      primaryUrl: r.primaryUrl,
      secondaryUrl: r.secondaryUrl,
      stack: r.stack,
      status: r.status,
      lastProbeMsPrimary: r.lastProbeMsPrimary,
      lastProbeMsSecondary: r.lastProbeMsSecondary,
      lastProbeAt: r.lastProbeAt?.toISOString() ?? null,
      scriptHygieneNotes: r.scriptHygieneNotes,
      hygieneHintsLive: formatHygieneHints(buildScriptHygieneHints(r.primaryUrl, r.secondaryUrl)),
      conversionSnapshot: r.conversionSnapshot,
      opsNotes: r.opsNotes,
      tokenCount: r._count.tokens,
      updatedAt: r.updatedAt.toISOString(),
    })),
  })
}

export async function POST(req: Request) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  let body: {
    name?: string
    primaryUrl?: string
    secondaryUrl?: string | null
    stack?: string
    status?: string
    conversionSnapshot?: unknown
    opsNotes?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : ''
  const primaryUrl = typeof body.primaryUrl === 'string' ? body.primaryUrl.trim().slice(0, 2000) : ''
  if (!name || !primaryUrl) {
    return NextResponse.json({ error: 'name e primaryUrl obrigatórios' }, { status: 400 })
  }

  let secondaryUrl: string | null =
    typeof body.secondaryUrl === 'string' ? body.secondaryUrl.trim().slice(0, 2000) || null : null
  if (secondaryUrl === '') secondaryUrl = null
  if (!secondaryUrl) {
    return NextResponse.json({ error: 'secondaryUrl obrigatório (destino secundário documentado)' }, { status: 400 })
  }

  const stack = body.stack && stackOk(body.stack) ? body.stack : TrackerLandingVaultStack.HTML_PLAIN
  const status =
    body.status && statusOk(body.status) ? body.status : TrackerLandingVaultStatus.DRAFT

  const hints = formatHygieneHints(buildScriptHygieneHints(primaryUrl, secondaryUrl))

  const row = await prisma.trackerLandingVault.create({
    data: {
      name,
      primaryUrl,
      secondaryUrl,
      stack,
      status,
      scriptHygieneNotes: hints || undefined,
      conversionSnapshot:
        body.conversionSnapshot !== undefined
          ? (body.conversionSnapshot as object)
          : undefined,
      opsNotes:
        typeof body.opsNotes === 'string' ? body.opsNotes.trim().slice(0, 800) || null : null,
    },
  })

  return NextResponse.json({ id: row.id })
}
