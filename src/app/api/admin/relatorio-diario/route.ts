import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { getRelatorioDiarioCompleto } from '@/lib/relatorio-diario'
import { sendRelatorioDiarioParaAdmins } from '@/lib/notifications/relatorio-diario-notify'

/**
 * GET - Retorna relatório diário completo (para dashboard)
 */
export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  try {
    const relatorio = await getRelatorioDiarioCompleto()
    return NextResponse.json(relatorio)
  } catch (e) {
    console.error('Relatorio diario error:', e)
    return NextResponse.json({ error: 'Erro ao gerar relatório' }, { status: 500 })
  }
}

/**
 * POST - Dispara envio do relatório para todos os admins (push + in-app)
 */
export async function POST() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  try {
    const { sent, total } = await sendRelatorioDiarioParaAdmins()
    return NextResponse.json({ ok: true, sent, total })
  } catch (e) {
    console.error('Relatorio diario send error:', e)
    return NextResponse.json({ error: 'Erro ao enviar' }, { status: 500 })
  }
}
