import { NextRequest, NextResponse } from 'next/server'
import { TrackerLandingVaultStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * GET — Redireciona para o destino principal da landing (token opaco).
 * Query: t=<token> — outros parâmetros são repostos no destino se ainda não existirem.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t')?.trim()
  if (!token) {
    return NextResponse.json({ error: 'Parâmetro t obrigatório' }, { status: 400 })
  }

  const row = await prisma.trackerLandingToken.findFirst({
    where: {
      token,
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      vault: { status: { not: TrackerLandingVaultStatus.ARCHIVED } },
    },
    include: { vault: true },
  })

  if (!row) {
    return NextResponse.json({ error: 'Token inválido ou expirado' }, { status: 404 })
  }

  let dest: URL
  try {
    dest = new URL(row.vault.primaryUrl)
  } catch {
    return NextResponse.json({ error: 'Destino mal configurado' }, { status: 500 })
  }

  req.nextUrl.searchParams.forEach((value, key) => {
    if (key === 't') return
    if (!dest.searchParams.has(key)) {
      dest.searchParams.append(key, value)
    }
  })

  return NextResponse.redirect(dest.toString(), 302)
}
