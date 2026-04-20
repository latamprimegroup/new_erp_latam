/**
 * Controle de versão do ERP — histórico, deploy, migrações
 */
import { prisma } from '../prisma'

const VERSION_KEY = 'erp_version'
const DEPLOY_AT_KEY = 'erp_deploy_at'
const LAST_MIGRATION_KEY = 'erp_last_migration'

export async function getCurrentVersion(): Promise<{
  version: string
  deployAt: string | null
  lastMigration: string | null
}> {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: [VERSION_KEY, DEPLOY_AT_KEY, LAST_MIGRATION_KEY] } },
  })
  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]))
  return {
    version: map[VERSION_KEY] || '0.1.0',
    deployAt: map[DEPLOY_AT_KEY] || null,
    lastMigration: map[LAST_MIGRATION_KEY] || null,
  }
}

/** Apenas versão da app (ex.: após migração), sem marcar produção ativa. */
export async function setAppVersion(version: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: VERSION_KEY },
    create: { key: VERSION_KEY, value: version },
    update: { value: version },
  })
}

export async function setVersion(version: string, deployAt?: Date): Promise<void> {
  const now = deployAt || new Date()
  await prisma.$transaction([
    prisma.systemSetting.upsert({
      where: { key: VERSION_KEY },
      create: { key: VERSION_KEY, value: version },
      update: { value: version },
    }),
    prisma.systemSetting.upsert({
      where: { key: DEPLOY_AT_KEY },
      create: { key: DEPLOY_AT_KEY, value: now.toISOString() },
      update: { value: now.toISOString() },
    }),
  ])
}

export async function setLastMigration(name: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: LAST_MIGRATION_KEY },
    create: { key: LAST_MIGRATION_KEY, value: name },
    update: { value: name },
  })
}
