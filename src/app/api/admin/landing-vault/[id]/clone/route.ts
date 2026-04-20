import { NextResponse } from 'next/server'
import { TrackerLandingVaultStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { buildScriptHygieneHints, formatHygieneHints } from '@/lib/landing-vault/script-hygiene'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const src = await prisma.trackerLandingVault.findUnique({ where: { id } })
  if (!src) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const hints = formatHygieneHints(buildScriptHygieneHints(src.primaryUrl, src.secondaryUrl))

  const row = await prisma.trackerLandingVault.create({
    data: {
      name: `${src.name.slice(0, 180)} (cópia)`,
      primaryUrl: src.primaryUrl,
      secondaryUrl: src.secondaryUrl,
      stack: src.stack,
      status: TrackerLandingVaultStatus.DRAFT,
      scriptHygieneNotes: hints || undefined,
      conversionSnapshot: src.conversionSnapshot === null ? undefined : (src.conversionSnapshot as object),
      opsNotes: src.opsNotes,
    },
  })

  return NextResponse.json({ id: row.id })
}
