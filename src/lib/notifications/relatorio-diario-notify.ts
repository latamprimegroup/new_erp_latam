/**
 * Envia relatório diário para todos os admins (push + in-app)
 */
import { prisma } from '../prisma'
import { notify } from './index'
import { sendPush } from './channels/push'
import { getRelatorioDiarioCompleto, formatarParaPush } from '../relatorio-diario'

export async function sendRelatorioDiarioParaAdmins(): Promise<{ sent: number; total: number }> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true },
  })

  const rel = await getRelatorioDiarioCompleto()
  const { title, body } = formatarParaPush(rel)

  let sent = 0
  for (const admin of admins) {
    try {
      await notify({
        userId: admin.id,
        type: 'RELATORIO_DIARIO',
        title,
        message: rel.resumo,
        link: '/dashboard/admin/relatorio-diario',
        metadata: { relatorio: rel },
        priority: 'HIGH',
        channels: ['IN_APP'],
      })
      const pushSent = await sendPush({
        userId: admin.id,
        title: '📊 ' + title,
        body,
        link: '/dashboard/admin/relatorio-diario',
        tag: 'relatorio-diario',
        data: { data: rel.data },
      })
      if (pushSent > 0) sent++
    } catch (e) {
      console.error('Relatorio diario notify error:', e)
    }
  }

  return { sent, total: admins.length }
}
