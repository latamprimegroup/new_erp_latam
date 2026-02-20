import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { runDbMigration } from '@/lib/agent/deploy'
import { prisma } from '@/lib/prisma'

async function allowMigrateWithoutAuth(): Promise<boolean> {
  try {
    const r = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'`
    const tableCount = Number(r[0]?.count ?? 0)
    if (tableCount === 0) return true
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
    return adminCount === 0 && !!process.env.SETUP_TOKEN
  } catch {
    return false
  }
}

/**
 * POST - Executa migração do banco (prisma db push)
 * Permitido sem auth: quando DB está vazio (primeira instalação) ou com SETUP_TOKEN quando 0 admins
 */
export async function POST() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) {
    const canProceed = await allowMigrateWithoutAuth()
    if (!canProceed) return auth.response
  }

  try {
    const result = await runDbMigration()
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, step: result.step, message: result.userMessage, details: result.details },
        { status: 400 }
      )
    }
    return NextResponse.json({ ok: true, message: result.userMessage })
  } catch (err) {
    console.error('Deploy migrate error:', err)
    return NextResponse.json(
      { ok: false, message: 'Erro ao migrar banco' },
      { status: 500 }
    )
  }
}
