import type { Prisma } from '@prisma/client'
import { prisma } from '../../prisma'

export type InAppPayload = {
  userId: string
  type: string
  title: string
  message: string
  link?: string
  metadata?: Record<string, unknown>
  priority?: string
}

export async function sendInApp(payload: InAppPayload): Promise<string | null> {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: payload.userId,
        type: payload.type,
        channel: 'IN_APP',
        title: payload.title,
        message: payload.message,
        link: payload.link || null,
        metadata: (payload.metadata || undefined) as Prisma.InputJsonValue | undefined,
        priority: payload.priority || 'NORMAL',
        sentAt: new Date(),
      },
    })
    return notification.id
  } catch (e) {
    console.error('InApp notification error:', e)
    return null
  }
}
