import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { sendPush } from '@/lib/notifications/channels/push'

/**
 * POST - Envia notificação de teste para o admin logado
 */
export async function POST() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const userId = auth.session!.user!.id

  const sent = await sendPush({
    userId,
    title: '🧪 Teste ERP Ads Ativos',
    body: 'Notificações push funcionando no seu iPhone!',
    link: '/dashboard',
    tag: 'test',
  })

  if (sent === 0) {
    return NextResponse.json(
      { ok: false, message: 'Nenhum dispositivo inscrito. Ative as notificações primeiro.' },
      { status: 400 }
    )
  }

  return NextResponse.json({ ok: true, message: 'Notificação enviada' })
}
