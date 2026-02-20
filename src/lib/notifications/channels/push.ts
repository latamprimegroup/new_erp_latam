/**
 * Canal Web Push — notificações no iPhone/PWA (iOS 16.4+)
 * Requer: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY no .env
 */
import webpush from 'web-push'
import { prisma } from '@/lib/prisma'

export type PushPayload = {
  userId: string
  title: string
  body: string
  link?: string
  tag?: string
  data?: Record<string, unknown>
}

function getVapidKeys(): { publicKey: string; privateKey: string } | null {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return null
  return { publicKey: pub, privateKey: priv }
}

export async function sendPush(payload: PushPayload): Promise<number> {
  const keys = getVapidKeys()
  if (!keys) return 0

  webpush.setVapidDetails(
    process.env.NEXTAUTH_URL || 'mailto:admin@adsativos.com',
    keys.publicKey,
    keys.privateKey
  )

  const pref = await prisma.notificationPreference.findUnique({
    where: { userId: payload.userId },
  })
  if (pref?.notifyPush === false) return 0

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: payload.userId },
  })
  if (subs.length === 0) return 0

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || 'erp-ads-ativos',
    data: {
      url: payload.link || '/dashboard',
      ...payload.data,
    },
  })

  let sent = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys as { p256dh: string; auth: string },
        },
        pushPayload,
        { TTL: 86400 }
      )
      sent++
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 410 || (err as { statusCode?: number }).statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
      }
    }
  }
  return sent
}
