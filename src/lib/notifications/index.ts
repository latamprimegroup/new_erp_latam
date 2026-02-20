import { prisma } from '../prisma'
import { sendInApp } from './channels/in-app'
import { sendWhatsApp } from './channels/whatsapp'
import { sendEmail } from './channels/email'
import { getDailyTasksForUser } from './daily-tasks'

export type NotificationPayload = {
  userId: string
  type?: string
  title: string
  message: string
  link?: string
  metadata?: Record<string, unknown>
  priority?: string
  channels?: ('IN_APP' | 'EMAIL' | 'WHATSAPP')[]
}

/**
 * Envia notificação para um usuário pelos canais configurados
 */
/**
 * Compatibilidade com código legado - envia apenas in-app
 */
export async function notifyUser(
  userId: string,
  title: string,
  message: string,
  link?: string
): Promise<void> {
  await notify({ userId, title, message, link, channels: ['IN_APP'] })
}

export async function notify(payload: NotificationPayload): Promise<void> {
  const channels = payload.channels || ['IN_APP']

  if (channels.includes('IN_APP')) {
    await sendInApp({
      userId: payload.userId,
      type: payload.type || 'GENERIC',
      title: payload.title,
      message: payload.message,
      link: payload.link,
      metadata: payload.metadata,
      priority: payload.priority,
    })
  }

  if (channels.includes('WHATSAPP') || channels.includes('EMAIL')) {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { phone: true, email: true },
    })

    if (channels.includes('WHATSAPP') && user?.phone) {
      await sendWhatsApp({
        phone: user.phone,
        message: `*${payload.title}*\n\n${payload.message}${payload.link ? `\n\n${payload.link}` : ''}`,
      })
    }

    if (channels.includes('EMAIL') && user?.email) {
      await sendEmail({
        to: user.email,
        subject: payload.title,
        html: `<p>${payload.message.replace(/\n/g, '<br>')}</p>${payload.link ? `<p><a href="${payload.link}">Acessar</a></p>` : ''}`,
        text: payload.message,
      })
    }
  }
}

/**
 * Envia digest diário para um usuário (tarefas do dia)
 */
export async function sendDailyDigestToUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true, phone: true, email: true },
  })

  if (!user || user.role === 'CLIENT') return false

  const pref = await prisma.notificationPreference.findUnique({
    where: { userId },
  })

  const tasks = await getDailyTasksForUser(user.id, user.role, user.name || undefined)

  const channels: ('IN_APP' | 'EMAIL' | 'WHATSAPP')[] = ['IN_APP']
  if (pref?.notifyWhatsapp !== false && user.phone) channels.push('WHATSAPP')
  if (pref?.notifyEmail !== false && user.email) channels.push('EMAIL')

  await notify({
    userId: user.id,
    type: 'DAILY_DIGEST',
    title: `Seu resumo do dia — ${tasks.role}`,
    message: tasks.message,
    link: tasks.link,
    metadata: { tasks: tasks.tasks, role: tasks.role },
    priority: 'HIGH',
    channels,
  })

  return true
}

const DIGEST_BATCH_SIZE = 8

/**
 * Envia digest diário para todos os colaboradores (exceto CLIENT).
 * Processa em lotes paralelos para escalar com muitos usuários.
 */
export async function sendDailyDigestToAll(): Promise<{ sent: number; total: number }> {
  const allStaff = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'PRODUCER', 'DELIVERER', 'FINANCE', 'COMMERCIAL', 'MANAGER', 'PLUG_PLAY'] } },
    select: { id: true },
  })

  let sent = 0
  for (let i = 0; i < allStaff.length; i += DIGEST_BATCH_SIZE) {
    const batch = allStaff.slice(i, i + DIGEST_BATCH_SIZE)
    const results = await Promise.all(batch.map((u) => sendDailyDigestToUser(u.id)))
    sent += results.filter(Boolean).length
  }

  return { sent, total: allStaff.length }
}
