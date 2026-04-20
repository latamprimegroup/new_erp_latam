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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const row = await prisma.trackerLandingVault.findUnique({
    where: { id },
    include: { _count: { select: { tokens: true, migrations: true } } },
  })
  if (!row) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  return NextResponse.json({
    landing: {
      ...row,
      hygieneHintsLive: formatHygieneHints(buildScriptHygieneHints(row.primaryUrl, row.secondaryUrl)),
      lastProbeAt: row.lastProbeAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const prev = await prisma.trackerLandingVault.findUnique({ where: { id } })
  if (!prev) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const n = body.name.trim().slice(0, 200)
    if (n) data.name = n
  }
  if (typeof body.primaryUrl === 'string') data.primaryUrl = body.primaryUrl.trim().slice(0, 2000)
  if (body.secondaryUrl === null) data.secondaryUrl = null
  else if (typeof body.secondaryUrl === 'string') {
    data.secondaryUrl = body.secondaryUrl.trim().slice(0, 2000) || null
  }
  if (typeof body.stack === 'string' && stackOk(body.stack)) data.stack = body.stack
  if (typeof body.status === 'string' && statusOk(body.status)) data.status = body.status
  if (body.conversionSnapshot !== undefined) data.conversionSnapshot = body.conversionSnapshot as object
  if (body.opsNotes === null) data.opsNotes = null
  else if (typeof body.opsNotes === 'string') data.opsNotes = body.opsNotes.trim().slice(0, 800) || null

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Sem alterações' }, { status: 400 })
  }

  const nextPrimary = (data.primaryUrl as string) || prev.primaryUrl
  const nextSecondary =
    data.secondaryUrl !== undefined ? (data.secondaryUrl as string | null) : prev.secondaryUrl

  data.scriptHygieneNotes = formatHygieneHints(buildScriptHygieneHints(nextPrimary, nextSecondary))

  const row = await prisma.trackerLandingVault.update({
    where: { id },
    data: data as object,
  })

  return NextResponse.json({ ok: true, id: row.id })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  try {
    await prisma.trackerLandingVault.delete({ where: { id } })
  } catch {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
