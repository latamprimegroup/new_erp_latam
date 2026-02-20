/**
 * Agente Deploy — orquestrador completo de publicação e atualização
 * Pensa → Valida → Salva → Testa
 */
import { execSync } from 'child_process'
import { prisma } from '../prisma'
import { checkEnvironment, checkDatabase, getSimpleMessage } from './diagnostics'
import { setVersion, getCurrentVersion } from './version'

export type DeployStep =
  | 'ENV_CHECK'
  | 'DB_CONNECT'
  | 'DB_MIGRATE'
  | 'DB_SEED'
  | 'VALIDATE'
  | 'DONE'

export type DeployStepResult = {
  step: DeployStep
  ok: boolean
  message: string
  userMessage: string
  details?: Record<string, unknown>
}

export type DeployStatus = {
  canDeploy: boolean
  currentVersion: string
  steps: DeployStepResult[]
  nextStep: DeployStep | null
  productionActive: boolean
}

/**
 * Executa verificação inicial (sem alterar nada)
 */
export async function runInitialCheck(): Promise<DeployStatus> {
  const steps: DeployStepResult[] = []
  let nextStep: DeployStep | null = 'ENV_CHECK'

  // 1. Ambiente
  const env = checkEnvironment()
  steps.push({
    step: 'ENV_CHECK',
    ok: env.ok,
    message: env.ok ? 'Ambiente configurado' : env.messages.join(' '),
    userMessage: env.ok ? '✔ Variáveis de ambiente ok' : `⚠ ${getSimpleMessage(env)}`,
    details: { missing: env.missing },
  })
  if (!env.ok) {
    return {
      canDeploy: false,
      currentVersion: '0',
      steps,
      nextStep: null,
      productionActive: false,
    }
  }

  nextStep = 'DB_CONNECT'

  // 2. Conexão banco
  const dbCheck = await checkDatabase(prisma)
  steps.push({
    step: 'DB_CONNECT',
    ok: dbCheck.ok,
    message: dbCheck.message,
    userMessage: dbCheck.ok ? '✔ Conexão com banco ok' : `⚠ ${dbCheck.suggestion || dbCheck.message}`,
  })
  if (!dbCheck.ok) {
    return {
      canDeploy: false,
      currentVersion: '0',
      steps,
      nextStep: null,
      productionActive: false,
    }
  }

  nextStep = 'DB_MIGRATE'

  // 3. Verificar se tabelas existem
  let tablesExist = false
  try {
    const result = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'public'
    `
    tablesExist = Number(result[0]?.count ?? 0) > 0
  } catch {
    tablesExist = false
  }

  let version = { version: '0.1.0', deployAt: null as string | null, lastMigration: null as string | null }
  try {
    version = await getCurrentVersion()
  } catch {
    // Tabelas ainda não existem
  }
  const productionActive = !!version.deployAt && tablesExist

  steps.push({
    step: 'DB_MIGRATE',
    ok: tablesExist,
    message: tablesExist ? 'Banco estruturado' : 'Banco vazio — precisa rodar migração',
    userMessage: tablesExist ? '✔ Banco de dados pronto' : '⏳ Banco precisa ser criado',
    details: { tablesExist },
  })

  if (!tablesExist) {
    return {
      canDeploy: true,
      currentVersion: version.version,
      steps,
      nextStep: 'DB_MIGRATE',
      productionActive: false,
    }
  }

  nextStep = 'DB_SEED'

  // 4. Admin existe?
  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
  const needsSeed = adminCount === 0
  steps.push({
    step: 'DB_SEED',
    ok: !needsSeed,
    message: needsSeed ? 'Nenhum admin — precisa criar usuário inicial' : 'Admin existe',
    userMessage: needsSeed ? '⏳ Criar usuário administrador' : '✔ Administrador já existe',
    details: { adminCount },
  })

  return {
    canDeploy: true,
    currentVersion: version.version,
    steps,
    nextStep: needsSeed ? 'DB_SEED' : 'VALIDATE',
    productionActive,
  }
}

/**
 * Executa migração do banco (prisma db push)
 * Nota: em ambientes serverless (Vercel) pode falhar — use deploy via CI ou rode localmente
 */
export async function runDbMigration(): Promise<DeployStepResult> {
  try {
    execSync('npx prisma generate', {
      cwd: process.cwd(),
      stdio: 'pipe',
      encoding: 'utf-8',
    })
    execSync('npx prisma db push --accept-data-loss', {
      cwd: process.cwd(),
      stdio: 'pipe',
      encoding: 'utf-8',
    })
    await setVersion('0.1.0', new Date())
    return {
      step: 'DB_MIGRATE',
      ok: true,
      message: 'Migração aplicada',
      userMessage: '✔ Banco de dados criado com sucesso',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const hint =
      'Em alguns provedores, rode manualmente: npx prisma db push'
    return {
      step: 'DB_MIGRATE',
      ok: false,
      message: msg,
      userMessage: `Erro ao criar banco. ${hint}`,
      details: { error: msg },
    }
  }
}

/**
 * Cria usuário admin inicial
 */
export async function runSeedAdmin(email: string, password: string): Promise<DeployStepResult> {
  try {
    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.hash(password, 12)
    await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        name: 'Administrador',
        role: 'ADMIN',
      },
    })
    return {
      step: 'DB_SEED',
      ok: true,
      message: 'Admin criado',
      userMessage: '✔ Usuário administrador criado',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      step: 'DB_SEED',
      ok: false,
      message: msg,
      userMessage: 'Erro ao criar admin. Pode já existir.',
      details: { error: msg },
    }
  }
}

/**
 * Marca sistema como Produção Ativa
 */
export async function markProductionActive(): Promise<void> {
  const v = await getCurrentVersion()
  if (!v.deployAt) await setVersion(v.version, new Date())
}
