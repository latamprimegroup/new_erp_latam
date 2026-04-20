import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { appPublicBaseUrl } from '@/lib/landing-vault/public-base-url'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

/** POST — Gera token opaco para redirecionamento (link curto interno). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const vault = await prisma.trackerLandingVault.findUnique({ where: { id } })
  if (!vault) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  let expiresInDays: number | null = null
  try {
    const body = await req.json()
    if (typeof body?.expiresInDays === 'number' && body.expiresInDays > 0) {
      expiresInDays = Math.min(365, Math.floor(body.expiresInDays))
    }
  } catch {
    /* optional body */
  }

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt =
    expiresInDays != null
      ? new Date(Date.now() + expiresInDays * 86_400_000)
      : null

  await prisma.trackerLandingToken.create({
    data: {
      vaultId: id,
      token,
      expiresAt,
    },
  })

  const base = appPublicBaseUrl()
  const redirectUrl = base ? `${base}/api/public/landing-vault/go?t=${encodeURIComponent(token)}` : null

  return NextResponse.json({
    token,
    redirectUrl,
    expiresAt: expiresAt?.toISOString() ?? null,
    warning: base ? null : 'Defina NEXT_PUBLIC_APP_URL ou NEXTAUTH_URL para URL completa do redirecionamento.',
  })
}
