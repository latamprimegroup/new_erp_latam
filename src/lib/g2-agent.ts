/**
 * Agente G2 — validações, aprovação, meta
 */
import { prisma } from './prisma'
import { isAssetConsumed, hashAsset, registerAssetConsumed, type UniqueAssetType } from './unique-asset'

export const REQUIRED_DOC_TYPES = ['RG_FRENTE', 'RG_VERSO', 'CARTAO_CNPJ'] as const

/** Verifica se a conta tem documentos obrigatórios para aprovação */
export async function getApprovalReadiness(productionG2Id: string): Promise<{
  canApprove: boolean
  missingDocs: string[]
  score: number
  blockers: string[]
}> {
  const docs = await prisma.documentAsset.findMany({
    where: { productionG2Id },
  })

  const missingDocs: string[] = []
  for (const t of REQUIRED_DOC_TYPES) {
    if (!docs.some((d) => d.type === t)) {
      missingDocs.push(t)
    }
  }

  const blockers: string[] = []
  if (missingDocs.length > 0) {
    blockers.push(`Documentos obrigatórios faltando: ${missingDocs.join(', ')}`)
  }

  const hasAllDocs = missingDocs.length === 0
  const score = hasAllDocs ? 100 : Math.max(0, 100 - missingDocs.length * 25)

  return {
    canApprove: hasAllDocs,
    missingDocs,
    score,
    blockers,
  }
}

/** Valida ativos únicos antes de consumir (G2) */
export async function validateUniqueAssetsForG2(
  productionG2Id: string,
  params: {
    emailGoogle?: string
    recoveryEmail?: string
    googleAdsCustomerId?: string
    cnpjNumber?: string
    paymentProfileId?: string
  }
): Promise<{ ok: boolean; error?: string }> {
  if (params.emailGoogle) {
    const consumed = await isAssetConsumed('EMAIL_GOOGLE', params.emailGoogle, productionG2Id)
    if (consumed) return { ok: false, error: 'Email Google já utilizado em outra conta' }
  }
  if (params.recoveryEmail) {
    const consumed = await isAssetConsumed('RECOVERY_EMAIL', params.recoveryEmail, productionG2Id)
    if (consumed) return { ok: false, error: 'Email de recuperação já utilizado em outra conta' }
  }
  if (params.googleAdsCustomerId) {
    const consumed = await isAssetConsumed('GOOGLE_ADS_ID', params.googleAdsCustomerId, productionG2Id)
    if (consumed) return { ok: false, error: 'ID Google Ads já utilizado em outra conta' }
  }
  if (params.cnpjNumber) {
    const consumed = await isAssetConsumed('CNPJ', params.cnpjNumber, productionG2Id)
    if (consumed) return { ok: false, error: 'CNPJ já utilizado em outra conta' }
  }
  if (params.paymentProfileId) {
    const consumed = await isAssetConsumed('PAYMENT_PROFILE', params.paymentProfileId, productionG2Id)
    if (consumed) return { ok: false, error: 'Perfil de pagamento já utilizado em outra conta' }
  }
  return { ok: true }
}

/** Registra ativos consumidos após aprovação/envio ao estoque */
export async function registerG2AssetsConsumed(
  productionG2Id: string,
  params: {
    emailGoogle?: string
    recoveryEmail?: string
    googleAdsCustomerId?: string
    cnpjNumber?: string
    paymentProfileId?: string
  }
): Promise<void> {
  const tasks: Promise<unknown>[] = []
  if (params.emailGoogle) {
    tasks.push(registerAssetConsumed('EMAIL_GOOGLE', params.emailGoogle, productionG2Id))
  }
  if (params.recoveryEmail) {
    tasks.push(registerAssetConsumed('RECOVERY_EMAIL', params.recoveryEmail, productionG2Id))
  }
  if (params.googleAdsCustomerId) {
    tasks.push(registerAssetConsumed('GOOGLE_ADS_ID', params.googleAdsCustomerId, productionG2Id))
  }
  if (params.cnpjNumber) {
    tasks.push(registerAssetConsumed('CNPJ', params.cnpjNumber, productionG2Id))
  }
  if (params.paymentProfileId) {
    tasks.push(registerAssetConsumed('PAYMENT_PROFILE', params.paymentProfileId, productionG2Id))
  }
  await Promise.all(tasks)
}

/** Motor de meta: produção atual, projeção, ritmo necessário */
export async function getMetaEngine(producerId?: string): Promise<{
  metaMaxima: number
  producaoAtual: number
  producaoDiariaMedia: number
  diasRestantes: number
  producaoDiariaNecessaria: number
  projecao: number
  metaEmRisco: boolean
  percentual: number
}> {
  const config = await prisma.systemSetting.findMany({
    where: { key: { in: ['producao_meta_mensal', 'producao_meta_elite'] } },
  })
  const metaMap = Object.fromEntries(config.map((c) => [c.key, c.value]))
  const metaMaxima = parseInt(metaMap.producao_meta_mensal || '330', 10)

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  const diasNoMes = endOfMonth.getDate()
  const diaAtual = now.getDate()
  const diasRestantes = Math.max(0, diasNoMes - diaAtual)
  const diasDecorridos = diaAtual

  const whereBase = {
    validatedAt: { not: null as const, gte: startOfMonth, lte: endOfMonth },
    deletedAt: null,
  }

  const whereProd = {
    ...whereBase,
    status: 'APPROVED' as const,
    ...(producerId ? { producerId } : {}),
  }
  const whereG2 = {
    ...whereBase,
    status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] } as const,
    ...(producerId ? { creatorId: producerId } : {}),
  }

  const [prodCount, g2Count] = await Promise.all([
    prisma.productionAccount.count({ where: whereProd }),
    prisma.productionG2.count({ where: whereG2 }),
  ])

  const producaoAtual = prodCount + g2Count
  const producaoDiariaMedia = diasDecorridos > 0 ? producaoAtual / diasDecorridos : 0
  const producaoDiariaNecessaria =
    diasRestantes > 0 ? Math.ceil((metaMaxima - producaoAtual) / diasRestantes) : 0
  const projecao = producaoAtual + producaoDiariaMedia * diasRestantes
  const metaEmRisco = projecao < metaMaxima * 0.9
  const percentual = metaMaxima > 0 ? Math.round((producaoAtual / metaMaxima) * 100) : 0

  return {
    metaMaxima,
    producaoAtual,
    producaoDiariaMedia: Math.round(producaoDiariaMedia * 10) / 10,
    diasRestantes,
    producaoDiariaNecessaria,
    projecao: Math.round(projecao),
    metaEmRisco,
    percentual,
  }
}

/** Ranking de produtores por produção validada no mês */
export async function getProducerRanking(): Promise<
  { producerId: string; name: string | null; count: number; rank: number }[]
> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const [prodGroup, g2Group] = await Promise.all([
    prisma.productionAccount.groupBy({
      by: ['producerId'],
      where: {
        status: 'APPROVED',
        validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
        deletedAt: null,
      },
      _count: { id: true },
    }),
    prisma.productionG2.groupBy({
      by: ['creatorId'],
      where: {
        status: { in: ['APROVADA', 'ENVIADA_ESTOQUE'] },
        validatedAt: { not: null, gte: startOfMonth, lte: endOfMonth },
        deletedAt: null,
      },
      _count: { id: true },
    }),
  ])

  const map = new Map<string, number>()
  for (const p of prodGroup) {
    map.set(p.producerId, (map.get(p.producerId) ?? 0) + p._count.id)
  }
  for (const g of g2Group) {
    map.set(g.creatorId, (map.get(g.creatorId) ?? 0) + g._count.id)
  }

  const userIds = [...map.keys()]
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

  const sorted = [...map.entries()]
    .map(([id, count]) => ({ producerId: id, name: userMap[id] ?? null, count }))
    .sort((a, b) => b.count - a.count)

  return sorted.map((r, i) => ({ ...r, rank: i + 1 }))
}
