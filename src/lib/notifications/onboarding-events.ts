/**
 * Notificações de onboarding - push para colaboradores participantes
 */
import { sendPush } from './channels/push'
import { notify } from './index'

export async function notifyOnboardingParticipants(
  participantUserIds: string[],
  meetingId: string,
  clientName: string,
  scheduledAt: Date,
  title: string
): Promise<void> {
  const dateStr = scheduledAt.toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  const pushTitle = '📅 Onboarding agendado'
  const pushBody = `${title} — ${clientName} em ${dateStr}`
  const link = `/dashboard/onboarding?meeting=${meetingId}`

  for (const userId of participantUserIds) {
    await notify({
      userId,
      title: pushTitle,
      message: pushBody,
      link,
      channels: ['IN_APP'],
    })
    await sendPush({
      userId,
      title: '📅 ' + pushTitle,
      body: pushBody,
      link,
      tag: 'onboarding-agenda',
      data: { meetingId },
    })
  }
}
