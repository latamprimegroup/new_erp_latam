import { prisma } from '@/lib/prisma'

export async function getOrCreateTrafficShieldSettings() {
  return prisma.trafficShieldSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  })
}
