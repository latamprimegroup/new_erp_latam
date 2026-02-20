import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { markProductionActive } from '@/lib/agent/deploy'

/**
 * POST - Marca sistema como Produção Ativa
 */
export async function POST() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  try {
    await markProductionActive()
    return NextResponse.json({ ok: true, message: 'ERP em produção ativa' })
  } catch (err) {
    console.error('Deploy complete error:', err)
    return NextResponse.json(
      { ok: false, message: 'Erro ao finalizar' },
      { status: 500 }
    )
  }
}
