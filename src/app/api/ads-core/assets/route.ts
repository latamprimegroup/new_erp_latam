import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { AdsCoreAssetProductionStatus, AdsCoreVerificationTrack } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import {
  ADS_CORE_DUPLICATE_MSG,
  ADS_CORE_URL_HISTORICO_MSG,
  normalizeAdsCoreCnpj,
  normalizeAdsCoreSiteUrl,
} from '@/lib/ads-core-utils'
import { isSiteUrlOnlyInHistory } from '@/lib/ads-core-url-footprint'
import { consultarCnpjReceita } from '@/lib/receita-federal-mock'
import {
  ADS_CORE_RECEITA_NAO_ATIVA_MSG,
  buildAdsCoreCnaeIncongruenceQuestion,
  buildCnaeFuzzyText,
  isReceitaSituacaoAtiva,
  nicheCongruenceComplete,
  rootsFromConsulta,
} from '@/lib/ads-core-cnae'
import { assertProducerAllowedForAdsCoreNiche } from '@/lib/ads-core-producer-niche'
import { notifyProducerAdsCoreAssignment } from '@/lib/ads-core-assignment-notify'
import {
  assertCnpjAvailableForNewAsset,
  getUserDisplayName,
} from '@/lib/ads-core-cnpj-registry'
import { adsCoreUniqueViolationResponse } from '@/lib/ads-core-prisma-errors'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

function toPublicAsset(
  a: {
    id: string
    nicheId: string
    producerId: string | null
    adminId?: string | null
    cnpj: string
    razaoSocial: string | null
    nomeFantasia: string | null
    dataAbertura?: Date | null
    situacaoCadastral?: string | null
    endereco: string | null
    logradouro?: string | null
    numero?: string | null
    bairro?: string | null
    cidade?: string | null
    estado?: string | null
    cep?: string | null
    nomeSocio?: string | null
    cpfSocio?: string | null
    dataNascimentoSocio?: Date | null
    emailEmpresa: string | null
    telefone: string | null
    cnae: string | null
    cnaeDescricao: string | null
    statusReceita: string
    siteUrl: string | null
    congruenciaCheck?: boolean
    historicoUrls?: unknown
    docReviewFlags?: unknown
    g2ProducerObservacoes?: string | null
    producerAssignedAt?: Date | null
    g2FinalizedAt?: Date | null
    rejectionReason?: string | null
    producerSiteEditUnlocked?: boolean
    statusProducao: AdsCoreAssetProductionStatus
    verificationTrack: AdsCoreVerificationTrack
    docCnpjPath: string | null
    docRgFrentePath: string | null
    docRgVersoPath: string | null
    createdAt: Date
    niche: { name: string; briefingInstructions: string | null }
    producer?: { name: string | null; email: string | null } | null
  }
) {
  const flags =
    a.docReviewFlags && typeof a.docReviewFlags === 'object' && !Array.isArray(a.docReviewFlags)
      ? (a.docReviewFlags as Record<string, string>)
      : {}
  return {
    id: a.id,
    nicheId: a.nicheId,
    nicheName: a.niche.name,
    briefingInstructions: a.niche.briefingInstructions,
    producerId: a.producerId,
    producerName: a.producer?.name ?? null,
    producerEmail: a.producer?.email ?? null,
    adminId: a.adminId ?? null,
    cnpj: a.cnpj,
    razaoSocial: a.razaoSocial,
    nomeFantasia: a.nomeFantasia,
    dataAbertura: a.dataAbertura?.toISOString() ?? null,
    situacaoCadastral: a.situacaoCadastral ?? null,
    endereco: a.endereco,
    logradouro: a.logradouro ?? null,
    numero: a.numero ?? null,
    bairro: a.bairro ?? null,
    cidade: a.cidade ?? null,
    estado: a.estado ?? null,
    cep: a.cep ?? null,
    nomeSocio: a.nomeSocio ?? null,
    cpfSocio: a.cpfSocio ?? null,
    dataNascimentoSocio: a.dataNascimentoSocio?.toISOString() ?? null,
    emailEmpresa: a.emailEmpresa,
    telefone: a.telefone,
    cnae: a.cnae,
    cnaeDescricao: a.cnaeDescricao,
    statusReceita: a.statusReceita,
    siteUrl: a.siteUrl,
    congruenciaCheck: a.congruenciaCheck ?? false,
    historicoUrls: a.historicoUrls ?? [],
    docReviewFlags: flags,
    g2ProducerObservacoes: a.g2ProducerObservacoes ?? null,
    producerAssignedAt: a.producerAssignedAt?.toISOString() ?? null,
    g2FinalizedAt: a.g2FinalizedAt?.toISOString() ?? null,
    rejectionReason: a.rejectionReason ?? null,
    producerSiteEditUnlocked: a.producerSiteEditUnlocked ?? false,
    statusProducao: a.statusProducao,
    verificationTrack: a.verificationTrack,
    hasDocCnpj: !!a.docCnpjPath,
    hasDocRgFrente: !!a.docRgFrentePath,
    hasDocRgVerso: !!a.docRgVersoPath,
    createdAt: a.createdAt.toISOString(),
  }
}

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { role, id: userId } = auth.session.user
  if (!isGerente(role) && role !== 'PRODUCER') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const statusProducao = searchParams.get('statusProducao') as AdsCoreAssetProductionStatus | null
  const nicheId = searchParams.get('nicheId')
  const producerIdFilter = searchParams.get('producerId')
  const assignmentFilter = searchParams.get('assignmentFilter')

  const where: Record<string, unknown> = {}
  if (role === 'PRODUCER') {
    where.producerId = userId
  }
  if (statusProducao) where.statusProducao = statusProducao
  if (nicheId) where.nicheId = nicheId
  if (isGerente(role) && assignmentFilter === 'estoque') {
    where.producerId = null
    where.statusProducao = 'DISPONIVEL'
  } else if (isGerente(role) && assignmentFilter === 'atribuido') {
    where.producerId = { not: null }
    where.statusProducao = 'DISPONIVEL'
  } else if (isGerente(role) && producerIdFilter) {
    where.producerId = producerIdFilter
  }

  const paginated =
    searchParams.get('paginated') === '1' || searchParams.get('paginated') === 'true'

  if (paginated) {
    const page = Math.max(1, Math.min(Number(searchParams.get('page')) || 1, 10_000))
    const pageSize = Math.min(
      200,
      Math.max(1, Number(searchParams.get('pageSize')) || (role === 'PRODUCER' ? 100 : 150))
    )
    const skip = (page - 1) * pageSize

    const [total, rows] = await Promise.all([
      prisma.adsCoreAsset.count({ where }),
      prisma.adsCoreAsset.findMany({
        where,
        include: {
          niche: { select: { name: true, briefingInstructions: true } },
          producer: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ])

    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    return NextResponse.json({
      items: rows.map(toPublicAsset),
      total,
      page,
      pageSize,
      totalPages,
    })
  }

  const take = isGerente(role) ? Math.min(Number(searchParams.get('take')) || 1000, 2000) : 500

  const rows = await prisma.adsCoreAsset.findMany({
    where,
    include: {
      niche: { select: { name: true, briefingInstructions: true } },
      producer: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
    take,
  })

  return NextResponse.json(rows.map(toPublicAsset))
}

const postSchema = z.object({
  nicheId: z.string().min(1),
  cnpj: z.string().min(14),
  razaoSocial: z.string().optional(),
  nomeFantasia: z.string().optional(),
  endereco: z.string().optional(),
  emailEmpresa: z.string().email().optional().or(z.literal('')),
  telefone: z.string().optional(),
  cnae: z.string().optional(),
  cnaeDescricao: z.string().optional(),
  statusReceita: z.string().optional(),
  siteUrl: z.string().optional(),
  producerId: z.string().optional().nullable(),
  statusProducao: z
    .enum(['DISPONIVEL', 'EM_PRODUCAO', 'VERIFICACAO_G2', 'APROVADO', 'REPROVADO'])
    .optional(),
  /** Meta da demanda: G2 + Anunciante ou Anunciante + Operações Comerciais */
  verificationTrack: z.enum(['G2_ANUNCIANTE', 'ANUNCIANTE_COMERCIAL']).optional(),
  /** Só gerente: confirma cadastro mesmo com CNAE fora da lista do nicho (auditoria). */
  confirmIncongruent: z.boolean().optional(),
  dataAbertura: z.coerce.date().optional(),
  situacaoCadastral: z.string().max(120).optional(),
  logradouro: z.string().max(200).optional(),
  numero: z.string().max(20).optional(),
  bairro: z.string().max(120).optional(),
  cidade: z.string().max(120).optional(),
  estado: z.string().max(2).optional(),
  cep: z.string().max(12).optional(),
  nomeSocio: z.string().max(200).optional(),
  cpfSocio: z.string().max(14).optional(),
  dataNascimentoSocio: z.coerce.date().optional(),
  adminId: z.string().optional().nullable(),
})

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = postSchema.parse(await req.json())
    const cnpj = normalizeAdsCoreCnpj(body.cnpj)
    if (cnpj.length !== 14) {
      return NextResponse.json({ error: 'CNPJ deve conter 14 dígitos' }, { status: 400 })
    }

    const existingCnpj = await prisma.adsCoreAsset.findUnique({ where: { cnpj } })
    if (existingCnpj) {
      return NextResponse.json({ error: ADS_CORE_DUPLICATE_MSG }, { status: 400 })
    }

    const regGate = await assertCnpjAvailableForNewAsset(prisma, cnpj)
    if (regGate.blocked) {
      return NextResponse.json(
        { error: regGate.message, code: 'CNPJ_JA_PROCESSADO' },
        { status: 400 }
      )
    }

    const normSite = normalizeAdsCoreSiteUrl(body.siteUrl)
    if (normSite) {
      const existingSite = await prisma.adsCoreAsset.findFirst({
        where: { siteUrl: normSite },
      })
      if (existingSite) {
        return NextResponse.json({ error: ADS_CORE_DUPLICATE_MSG }, { status: 400 })
      }
      const inHistory = await isSiteUrlOnlyInHistory(prisma, normSite)
      if (inHistory) {
        return NextResponse.json({ error: ADS_CORE_URL_HISTORICO_MSG }, { status: 400 })
      }
    }

    const niche = await prisma.adsCoreNiche.findFirst({
      where: { id: body.nicheId, active: true },
      include: { allowedCnaes: { select: { code: true } } },
    })
    if (!niche) {
      return NextResponse.json({ error: 'Nicho inválido ou inativo' }, { status: 400 })
    }

    if (body.producerId) {
      const u = await prisma.user.findFirst({
        where: { id: body.producerId, role: 'PRODUCER' },
      })
      if (!u) return NextResponse.json({ error: 'Produtor não encontrado' }, { status: 400 })
      const allow = await assertProducerAllowedForAdsCoreNiche(prisma, body.nicheId, body.producerId)
      if (!allow.ok) return NextResponse.json({ error: allow.error }, { status: 400 })
    }

    const consulta = await consultarCnpjReceita(cnpj)
    if (!consulta) {
      return NextResponse.json(
        { error: 'Não foi possível consultar o CNPJ na Receita Federal. Tente novamente.' },
        { status: 502 }
      )
    }

    if (!isReceitaSituacaoAtiva(consulta.statusReceita)) {
      return NextResponse.json(
        {
          error: `${ADS_CORE_RECEITA_NAO_ATIVA_MSG} (situação: ${consulta.statusReceita})`,
          code: 'RECEITA_NAO_ATIVA',
        },
        { status: 400 }
      )
    }

    const allowedCodes = niche.allowedCnaes.map((a) => a.code)
    const fiscalRoots = rootsFromConsulta(consulta)
    const kwRaw = niche.congruenceKeywords
    const keywords = Array.isArray(kwRaw)
      ? kwRaw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : []
    const fuzzy = buildCnaeFuzzyText({
      razaoSocial: consulta.razaoSocial ?? body.razaoSocial,
      nomeFantasia: consulta.nomeFantasia ?? body.nomeFantasia,
      cnaeDescricao: consulta.cnaeDescricao ?? body.cnaeDescricao,
      cnaeSecundarios: consulta.cnaeSecundarios,
    })
    const congr = nicheCongruenceComplete(allowedCodes, fiscalRoots, keywords, fuzzy)
    if (!congr.ok && !body.confirmIncongruent) {
      return NextResponse.json(
        {
          error: buildAdsCoreCnaeIncongruenceQuestion(niche.name),
          code: 'CNAE_INCONGRUENTE',
          cnaeFiscais: fiscalRoots,
          allowedRoots: allowedCodes,
          keywordsConfigured: keywords.length,
        },
        { status: 400 }
      )
    }

    const producerLabel = await getUserDisplayName(
      prisma,
      body.producerId || auth.session.user.id
    )

    let adminIdSet: string | null = auth.session.user.id
    if (body.adminId !== undefined) {
      if (body.adminId === null) {
        adminIdSet = null
      } else {
        const adm = await prisma.user.findFirst({
          where: {
            id: body.adminId,
            role: { in: ['ADMIN', 'PRODUCTION_MANAGER'] },
          },
        })
        if (!adm) return NextResponse.json({ error: 'Gerente/admin inválido para adminId' }, { status: 400 })
        adminIdSet = body.adminId
      }
    }

    const vTrack = body.verificationTrack ?? 'G2_ANUNCIANTE'

    const asset = await prisma.$transaction(async (tx) => {
      const a = await tx.adsCoreAsset.create({
        data: {
          nicheId: body.nicheId,
          producerId: body.producerId || null,
          adminId: adminIdSet,
          verificationTrack: vTrack,
          cnpj,
          razaoSocial: consulta.razaoSocial ?? (body.razaoSocial?.trim() || null),
          nomeFantasia: consulta.nomeFantasia ?? (body.nomeFantasia?.trim() || null),
          dataAbertura: body.dataAbertura ?? null,
          situacaoCadastral: body.situacaoCadastral?.trim() || consulta.statusReceita || null,
          endereco: consulta.endereco ?? (body.endereco?.trim() || null),
          logradouro: body.logradouro?.trim() || consulta.logradouro || null,
          numero: body.numero?.trim() || consulta.numero || null,
          bairro: body.bairro?.trim() || consulta.bairro || null,
          cidade: body.cidade?.trim() || consulta.cidade || null,
          estado: body.estado?.trim()?.toUpperCase() || consulta.estado || null,
          cep: (() => {
            const fromBody = body.cep?.replace(/\D/g, '') ?? ''
            if (fromBody.length) return fromBody
            return consulta.cep?.replace(/\D/g, '') || null
          })(),
          nomeSocio: body.nomeSocio?.trim() || null,
          cpfSocio: (() => {
            const d = body.cpfSocio?.replace(/\D/g, '') ?? ''
            return d.length ? d : null
          })(),
          dataNascimentoSocio: body.dataNascimentoSocio ?? null,
          emailEmpresa: consulta.emailEmpresa ?? (body.emailEmpresa?.trim() || null),
          telefone: consulta.telefone ?? (body.telefone?.trim() || null),
          cnae: consulta.cnae ?? (body.cnae?.trim() || null),
          cnaeDescricao: consulta.cnaeDescricao ?? (body.cnaeDescricao?.trim() || null),
          statusReceita: consulta.statusReceita,
          siteUrl: normSite,
          congruenciaCheck: congr.ok,
          historicoUrls: normSite
            ? [
                {
                  at: new Date().toISOString(),
                  userId: auth.session.user.id,
                  old: null,
                  new: normSite,
                },
              ]
            : [],
          statusProducao: (body.statusProducao || 'DISPONIVEL') as AdsCoreAssetProductionStatus,
          createdById: auth.session.user.id,
          producerAssignedAt: body.producerId ? new Date() : null,
        } as never,
        include: { niche: { select: { name: true, briefingInstructions: true } } },
      })
      await tx.adsCoreCnpjRegistry.create({
        data: {
          cnpj,
          producerId: body.producerId || null,
          producerName: producerLabel,
          processedAt: new Date(),
          source: 'ATIVO',
        },
      })
      return a
    })

    await audit({
      userId: auth.session.user.id,
      action: body.confirmIncongruent && !congr.ok ? 'ads_core_asset_created_cnae_override' : 'ads_core_asset_created',
      entity: 'AdsCoreAsset',
      entityId: asset.id,
      details: { cnpj, congruenciaOk: congr.ok, byCode: congr.byCode, byKeyword: congr.byKeyword, fiscalRoots },
    })

    if (body.producerId) {
      void notifyProducerAdsCoreAssignment({
        producerId: body.producerId,
        assetId: asset.id,
        cnpj: asset.cnpj,
        nicheName: asset.niche.name,
      })
    }

    return NextResponse.json(toPublicAsset(asset))
  } catch (e) {
    const dup = adsCoreUniqueViolationResponse(e)
    if (dup) return dup
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
