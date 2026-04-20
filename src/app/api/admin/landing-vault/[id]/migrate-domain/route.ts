import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { hostFromHttpUrl } from '@/lib/landing-vault/urls'
import { buildScriptHygieneHints, formatHygieneHints } from '@/lib/landing-vault/script-hygiene'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

/**
 * POST — Atualiza o URL principal e regista migração de host (operacional).
 * Body: { newPrimaryUrl: string, note?: string }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const vault = await prisma.trackerLandingVault.findUnique({ where: { id } })
  if (!vault) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let body: { newPrimaryUrl?: string; note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const newPrimaryUrl =
    typeof body.newPrimaryUrl === 'string' ? body.newPrimaryUrl.trim().slice(0, 2000) : ''
  if (!newPrimaryUrl) {
    return NextResponse.json({ error: 'newPrimaryUrl obrigatório' }, { status: 400 })
  }

  const fromHost = hostFromHttpUrl(vault.primaryUrl)
  const toHost = hostFromHttpUrl(newPrimaryUrl)
  if (!toHost) {
    return NextResponse.json({ error: 'newPrimaryUrl inválido' }, { status: 400 })
  }

  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) || null : null

  await prisma.$transaction([
    prisma.trackerLandingDomainMigration.create({
      data: {
        vaultId: id,
        fromHost: fromHost || '(desconhecido)',
        toHost,
        note,
      },
    }),
    prisma.trackerLandingVault.update({
      where: { id },
      data: {
        primaryUrl: newPrimaryUrl,
        scriptHygieneNotes: formatHygieneHints(
          buildScriptHygieneHints(newPrimaryUrl, vault.secondaryUrl)
        ),
      },
    }),
  ])

  return NextResponse.json({ ok: true, toHost })
}
