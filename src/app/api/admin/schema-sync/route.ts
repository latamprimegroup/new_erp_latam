import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/schema-sync
 * Dispara `prisma db push` manualmente — apenas ADMIN.
 * Útil quando o schema.prisma evoluiu mas o build não executou a migração.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Apenas administradores podem sincronizar o schema' }, { status: 403 })
  }

  const url = process.env.DATABASE_URL
  if (!url || url.startsWith('mysql://ci:')) {
    return NextResponse.json({ error: 'DATABASE_URL não configurada' }, { status: 500 })
  }

  try {
    const start = Date.now()
    execSync('npx prisma db push --accept-data-loss', {
      stdio: 'pipe',
      timeout: 55_000,
    })
    return NextResponse.json({
      ok: true,
      message: 'Schema sincronizado com sucesso',
      durationMs: Date.now() - start,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[schema-sync] Erro:', message)
    return NextResponse.json({ error: `Falha ao sincronizar: ${message.slice(0, 500)}` }, { status: 500 })
  }
}

/**
 * GET /api/admin/schema-sync
 * Retorna o status do banco (tabelas presentes) sem modificar nada.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const checks: Record<string, boolean> = {}
  const tables = [
    'users', 'production_accounts', 'orders', 'financial_transactions',
    'commercial_leads', 'intelligence_campaign_spends', 'rma_tickets',
    'login_audit_logs',
  ]

  try {
    const { prisma } = await import('@/lib/prisma')
    for (const table of tables) {
      try {
        await prisma.$queryRawUnsafe(`SELECT 1 FROM \`${table}\` LIMIT 1`)
        checks[table] = true
      } catch {
        checks[table] = false
      }
    }
    const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([t]) => t)
    return NextResponse.json({ ok: missing.length === 0, checks, missing })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
