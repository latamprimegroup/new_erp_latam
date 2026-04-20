import { NextResponse } from 'next/server'
import { z } from 'zod'
import { headers } from 'next/headers'
import type { AdsCoreAssetProductionStatus, AdsCoreVerificationTrack } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import { appendUrlHistory } from '@/lib/ads-core-url-history'
import {
  getUserDisplayName,
  tagCnpjRegistryRejection,
  touchCnpjRegistryOnDelete,
} from '@/lib/ads-core-cnpj-registry'
import { touchAdsCoreEmProducaoOnOpen } from '@/lib/ads-core-producer-touch'
import { assertProducerAllowedForAdsCoreNiche } from '@/lib/ads-core-producer-niche'
import { notifyProducerAdsCoreAssignment } from '@/lib/ads-core-assignment-notify'
import { adsCoreUniqueViolationResponse } from '@/lib/ads-core-prisma-errors'
import { finalizeAdsCoreRgStockIfTerminal } from '@/lib/ads-core-rg-stock'
import {
  ADS_CORE_DUPLICATE_MSG,
  ADS_CORE_URL_HISTORICO_MSG,
  normalizeAdsCoreCnpj,
  normalizeAdsCoreSiteUrl,
} from '@/lib/ads-core-utils'
import { isSiteUrlOnlyInHistory } from '@/lib/ads-core-url-footprint'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

type AssetWithNiche = {
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
  statusProducao: AdsCoreAssetProductionStatus
  verificationTrack: AdsCoreVerificationTrack
  docCnpjPath: string | null
  docRgFrentePath: string | null
  docRgVersoPath: string | null
  createdAt: Date
  producerAssignedAt?: Date | null
  g2FinalizedAt?: Date | null
  rejectionReason?: string | null
  producerSiteEditUnlocked?: boolean
  niche: { name: string; briefingInstructions: string | null }
  producer?: { name: string | null; email: string | null } | null
}

function toPublicAsset(a: AssetWithNiche) {
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

function canRead(role: string | undefined, userId: string, asset: { producerId: string | null }) {
  if (isGerente(role)) return true
  if (role === 'PRODUCER' && asset.producerId === userId) return true
  return false
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { id } = await params
  const asset = await prisma.adsCoreAsset.findUnique({
    where: { id },
    include: {
      niche: { select: { name: true, briefingInstructions: true } },
      producer: { select: { name: true, email: true } },
    },
  })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })
  if (!canRead(auth.session.user.role, auth.session.user.id, asset)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const h = await headers()
  const ipGet =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined

  await audit({
    userId: auth.session.user.id,
    action: 'ads_core_asset_viewed',
    entity: 'AdsCoreAsset',
    entityId: id,
    details: { role: auth.session.user.role },
    ip: ipGet,
  })

  await touchAdsCoreEmProducaoOnOpen(prisma, {
    assetId: id,
    userId: auth.session.user.id,
    role: auth.session.user.role,
    ip: ipGet,
  })

  const refreshed = await prisma.adsCoreAsset.findUnique({
    where: { id },
    include: {
      niche: { select: { name: true, briefingInstructions: true } },
      producer: { select: { name: true, email: true } },
    },
  })
  if (!refreshed) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })

  return NextResponse.json(toPublicAsset(refreshed as AssetWithNiche))
}

const docReviewFlagSchema = z.enum(['legivel', 'rejeitado'])
const adminPatchSchema = z.object({
  nicheId: z.string().optional(),
  producerId: z.string().optional().nullable(),
  adminId: z.string().optional().nullable(),
  cnpj: z.string().optional(),
  razaoSocial: z.string().optional().nullable(),
  nomeFantasia: z.string().optional().nullable(),
  dataAbertura: z.coerce.date().optional().nullable(),
  situacaoCadastral: z.string().optional().nullable(),
  endereco: z.string().optional().nullable(),
  logradouro: z.string().optional().nullable(),
  numero: z.string().optional().nullable(),
  bairro: z.string().optional().nullable(),
  cidade: z.string().optional().nullable(),
  estado: z.string().optional().nullable(),
  cep: z.string().optional().nullable(),
  nomeSocio: z.string().optional().nullable(),
  cpfSocio: z.string().optional().nullable(),
  dataNascimentoSocio: z.coerce.date().optional().nullable(),
  emailEmpresa: z.string().optional().nullable(),
  telefone: z.string().optional().nullable(),
  cnae: z.string().optional().nullable(),
  cnaeDescricao: z.string().optional().nullable(),
  statusReceita: z.string().optional().nullable(),
  siteUrl: z.string().optional().nullable(),
  statusProducao: z
    .enum(['DISPONIVEL', 'EM_PRODUCAO', 'VERIFICACAO_G2', 'APROVADO', 'REPROVADO'])
    .optional(),
  verificationTrack: z.enum(['G2_ANUNCIANTE', 'ANUNCIANTE_COMERCIAL']).optional(),
  docReviewFlags: z
    .object({
      cnpj: docReviewFlagSchema.optional(),
      'rg-frente': docReviewFlagSchema.optional(),
      'rg-verso': docReviewFlagSchema.optional(),
    })
    .optional(),
  /** Obrigatório (mín. 5 caracteres) quando statusProducao = REPROVADO */
  rejectionReason: z.string().max(8000).optional().nullable(),
  /** Admin reabre edição de URL para o produtor em ativo aprovado */
  producerSiteEditUnlocked: z.boolean().optional(),
})

const producerPatchSchema = z.object({
  siteUrl: z.string().optional().nullable(),
  statusProducao: z.enum(['EM_PRODUCAO', 'VERIFICACAO_G2']).optional(),
  g2ProducerObservacoes: z.string().max(8000).optional().nullable(),
  /** Obrigatórios (todos true) quando statusProducao = VERIFICACAO_G2 — checklist de conformidade G2 */
  g2ChecklistEmailCartao: z.boolean().optional(),
  g2ChecklistEnderecoSite: z.boolean().optional(),
  g2ChecklistRgQsa: z.boolean().optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  const { id } = await params
  const asset = await prisma.adsCoreAsset.findUnique({
    where: { id },
    include: {
      niche: { select: { name: true, briefingInstructions: true } },
      producer: { select: { name: true, email: true } },
    },
  })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })

  const { role, id: userId } = auth.session.user

  if (isGerente(role)) {
    try {
      const data = adminPatchSchema.parse(await req.json())
      if (asset.statusProducao === 'APROVADO') {
        const touchedKeys = Object.keys(data).filter(
          (k) => (data as Record<string, unknown>)[k] !== undefined
        )
        const allowWhenConsumido = new Set<string>([
          'adminId',
          'docReviewFlags',
          'producerSiteEditUnlocked',
        ])
        if (role === 'ADMIN') allowWhenConsumido.add('producerId')
        const forbidden = touchedKeys.filter((k) => !allowWhenConsumido.has(k))
        if (forbidden.length > 0) {
          return NextResponse.json(
            {
              error: `Ativo aprovado (consumido na produção / G2 OK). Não é permitido alterar: ${forbidden.join(', ')}. Permitido: revisão de documentos, adminId, reabrir edição de URL para o produtor${
                role === 'ADMIN' ? ' e transferência de colaborador (producerId).' : '. Transferência de colaborador: apenas ADMIN.'
              }`,
            },
            { status: 403 }
          )
        }
      }
      const updateData: Record<string, unknown> = {}
      let assignmentNominalAudit:
        | { cnpj: string; produtorId: string; produtorNome: string; gerenteNome: string }
        | undefined
      const h = await headers()
      const ip =
        h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined
      let siteAudit:
        | { prev: string | null; next: string | null }
        | undefined

      if (data.nicheId !== undefined) {
        const n = await prisma.adsCoreNiche.findFirst({
          where: { id: data.nicheId, active: true },
        })
        if (!n) return NextResponse.json({ error: 'Nicho inválido' }, { status: 400 })
        updateData.nicheId = data.nicheId
        if (data.nicheId !== asset.nicheId) {
          updateData.congruenciaCheck = false
        }
      }
      if (data.producerId !== undefined) {
        const hadProducer = asset.producerId != null
        const changing = (data.producerId || null) !== (asset.producerId || null)
        if (hadProducer && changing && data.producerId != null && role !== 'ADMIN') {
          return NextResponse.json(
            {
              error:
                'Apenas administradores podem transferir um ativo já atribuído a outro produtor.',
            },
            { status: 403 }
          )
        }
        if (data.producerId) {
          const u = await prisma.user.findFirst({
            where: { id: data.producerId, role: 'PRODUCER' },
          })
          if (!u) return NextResponse.json({ error: 'Produtor não encontrado' }, { status: 400 })
          const effectiveNiche = data.nicheId !== undefined ? data.nicheId : asset.nicheId
          const allow = await assertProducerAllowedForAdsCoreNiche(
            prisma,
            effectiveNiche,
            data.producerId
          )
          if (!allow.ok) return NextResponse.json({ error: allow.error }, { status: 400 })
        }
        const fromPool = asset.producerId === null && data.producerId !== null
        if (fromPool) {
          const r = await prisma.adsCoreAsset.updateMany({
            where: { id, producerId: null },
            data: { producerId: data.producerId, producerAssignedAt: new Date() },
          })
          if (r.count === 0) {
            return NextResponse.json(
              {
                error:
                  'Este ativo já foi atribuído a outro colaborador. Recarregue a lista e tente novamente.',
              },
              { status: 409 }
            )
          }
          const gerenteNome = await getUserDisplayName(prisma, userId)
          const produtorNome = await getUserDisplayName(prisma, data.producerId as string)
          assignmentNominalAudit = {
            cnpj: asset.cnpj,
            produtorId: data.producerId as string,
            produtorNome,
            gerenteNome,
          }
        } else {
          updateData.producerId = data.producerId
          if (data.producerId && asset.producerId === null) {
            updateData.producerAssignedAt = new Date()
          }
        }
      }
      if (data.adminId !== undefined) {
        if (data.adminId === null) {
          updateData.adminId = null
        } else {
          const adm = await prisma.user.findFirst({
            where: { id: data.adminId, role: { in: ['ADMIN', 'PRODUCTION_MANAGER'] } },
          })
          if (!adm) return NextResponse.json({ error: 'Gerente/admin inválido' }, { status: 400 })
          updateData.adminId = data.adminId
        }
      }
      if (data.cnpj !== undefined) {
        const cnpj = normalizeAdsCoreCnpj(data.cnpj)
        if (cnpj.length !== 14) {
          return NextResponse.json({ error: 'CNPJ inválido' }, { status: 400 })
        }
        const taken = await prisma.adsCoreAsset.findFirst({
          where: { cnpj, id: { not: id } },
        })
        if (taken) return NextResponse.json({ error: ADS_CORE_DUPLICATE_MSG }, { status: 400 })
        updateData.cnpj = cnpj
      }
      if (data.razaoSocial !== undefined) updateData.razaoSocial = data.razaoSocial
      if (data.nomeFantasia !== undefined) updateData.nomeFantasia = data.nomeFantasia
      if (data.dataAbertura !== undefined) updateData.dataAbertura = data.dataAbertura
      if (data.situacaoCadastral !== undefined) updateData.situacaoCadastral = data.situacaoCadastral
      if (data.endereco !== undefined) updateData.endereco = data.endereco
      if (data.logradouro !== undefined) updateData.logradouro = data.logradouro
      if (data.numero !== undefined) updateData.numero = data.numero
      if (data.bairro !== undefined) updateData.bairro = data.bairro
      if (data.cidade !== undefined) updateData.cidade = data.cidade
      if (data.estado !== undefined) updateData.estado = data.estado?.toUpperCase() || null
      if (data.cep !== undefined) {
        updateData.cep = data.cep ? data.cep.replace(/\D/g, '') : null
      }
      if (data.nomeSocio !== undefined) updateData.nomeSocio = data.nomeSocio
      if (data.cpfSocio !== undefined) {
        updateData.cpfSocio = data.cpfSocio ? data.cpfSocio.replace(/\D/g, '') : null
      }
      if (data.dataNascimentoSocio !== undefined) {
        updateData.dataNascimentoSocio = data.dataNascimentoSocio
      }
      if (data.emailEmpresa !== undefined) updateData.emailEmpresa = data.emailEmpresa
      if (data.telefone !== undefined) updateData.telefone = data.telefone
      if (data.cnae !== undefined) updateData.cnae = data.cnae
      if (data.cnaeDescricao !== undefined) updateData.cnaeDescricao = data.cnaeDescricao
      if (data.statusReceita !== undefined) updateData.statusReceita = data.statusReceita
      if (data.verificationTrack !== undefined) updateData.verificationTrack = data.verificationTrack
      if (data.siteUrl !== undefined) {
        const norm = normalizeAdsCoreSiteUrl(data.siteUrl)
        const prev = asset.siteUrl
        if ((prev ?? null) !== (norm ?? null)) {
          if (norm) {
            const taken = await prisma.adsCoreAsset.findFirst({
              where: { siteUrl: norm, id: { not: id } },
            })
            if (taken) {
              return NextResponse.json({ error: ADS_CORE_DUPLICATE_MSG }, { status: 400 })
            }
            const inHist = await isSiteUrlOnlyInHistory(prisma, norm, id)
            if (inHist) {
              return NextResponse.json({ error: ADS_CORE_URL_HISTORICO_MSG }, { status: 400 })
            }
          }
          updateData.siteUrl = norm
          updateData.historicoUrls = appendUrlHistory(
            (asset as AssetWithNiche).historicoUrls,
            {
              at: new Date().toISOString(),
              userId,
              old: prev,
              new: norm,
            }
          )
          siteAudit = { prev, next: norm }
        }
      }
      if (data.statusProducao !== undefined) {
        const next = data.statusProducao
        const cur = asset.statusProducao
        if (next === 'REPROVADO') {
          const reason = (data.rejectionReason ?? '').trim()
          if (reason.length < 5) {
            return NextResponse.json(
              { error: 'Informe o motivo da reprovação (mín. 5 caracteres).' },
              { status: 400 }
            )
          }
          updateData.rejectionReason = reason
          updateData.producerSiteEditUnlocked = false
        } else if (next === 'APROVADO') {
          updateData.rejectionReason = null
          updateData.producerSiteEditUnlocked = false
        }
        if (next === 'VERIFICACAO_G2' && cur !== 'VERIFICACAO_G2') {
          updateData.g2FinalizedAt = new Date()
        }
        updateData.statusProducao = next
      }
      if (data.producerSiteEditUnlocked !== undefined) {
        updateData.producerSiteEditUnlocked = data.producerSiteEditUnlocked
      }
      if (data.docReviewFlags !== undefined) {
        const prev =
          (asset as AssetWithNiche).docReviewFlags &&
          typeof (asset as AssetWithNiche).docReviewFlags === 'object' &&
          !Array.isArray((asset as AssetWithNiche).docReviewFlags)
            ? ((asset as AssetWithNiche).docReviewFlags as Record<string, string>)
            : {}
        updateData.docReviewFlags = { ...prev, ...data.docReviewFlags }
      }

      const includeRel = {
        niche: { select: { name: true, briefingInstructions: true } },
        producer: { select: { name: true, email: true } },
      } as const
      const hasFieldUpdates = Object.keys(updateData).length > 0
      const updated = hasFieldUpdates
        ? await prisma.adsCoreAsset.update({
            where: { id },
            data: updateData as never,
            include: includeRel,
          })
        : await prisma.adsCoreAsset.findUnique({
            where: { id },
            include: includeRel,
          })
      if (!updated) {
        return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })
      }
      if (siteAudit) {
        await audit({
          userId,
          action: 'ads_core_site_url_changed',
          entity: 'AdsCoreAsset',
          entityId: id,
          oldValue: { siteUrl: siteAudit.prev },
          newValue: { siteUrl: siteAudit.next },
          ip,
          details: { origem: 'admin' },
        })
      }
      if (assignmentNominalAudit) {
        await audit({
          userId,
          action: 'ads_core_atribuicao_nominal',
          entity: 'AdsCoreAsset',
          entityId: id,
          ip,
          details: {
            message: `Gerente ${assignmentNominalAudit.gerenteNome} atribuiu CNPJ ${assignmentNominalAudit.cnpj} para Produtor ${assignmentNominalAudit.produtorNome}`,
            cnpj: assignmentNominalAudit.cnpj,
            produtorId: assignmentNominalAudit.produtorId,
            produtorNome: assignmentNominalAudit.produtorNome,
            gerenteNome: assignmentNominalAudit.gerenteNome,
          },
        })
      }
      await audit({
        userId,
        action: 'ads_core_asset_updated',
        entity: 'AdsCoreAsset',
        entityId: id,
        details: { fields: Object.keys(updateData) },
      })
      await finalizeAdsCoreRgStockIfTerminal(prisma, id, updated.statusProducao)
      if (data.statusProducao === 'REPROVADO' && updated.rejectionReason) {
        const pname = await getUserDisplayName(prisma, updated.producerId)
        await tagCnpjRegistryRejection(
          prisma,
          updated.cnpj,
          updated.producerId,
          pname,
          updated.rejectionReason
        )
        await audit({
          userId,
          action: 'ads_core_asset_reprovado',
          entity: 'AdsCoreAsset',
          entityId: id,
          ip,
          details: {
            motivoResumo: updated.rejectionReason.slice(0, 280),
            cnpj: updated.cnpj,
          },
        })
      }
      if (
        updated.producerId &&
        (asset.producerId ?? null) !== (updated.producerId ?? null)
      ) {
        void notifyProducerAdsCoreAssignment({
          producerId: updated.producerId,
          assetId: updated.id,
          cnpj: updated.cnpj,
          nicheName: (updated as AssetWithNiche).niche.name,
        })
      }
      return NextResponse.json(toPublicAsset(updated as AssetWithNiche))
    } catch (e) {
      const dup = adsCoreUniqueViolationResponse(e)
      if (dup) return dup
      if (e instanceof z.ZodError) {
        return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
      }
      throw e
    }
  }

  if (role === 'PRODUCER' && asset.producerId === userId) {
    try {
      const data = producerPatchSchema.parse(await req.json())
      const terminal =
        asset.statusProducao === 'APROVADO' || asset.statusProducao === 'REPROVADO'
      const unlocked = !!(asset as AssetWithNiche).producerSiteEditUnlocked
      if (terminal && !unlocked) {
        return NextResponse.json(
          {
            error:
              'Ativo finalizado — visualização e cópia permitidas; edição bloqueada até o gerente reabrir a demanda.',
          },
          { status: 403 }
        )
      }
      if (terminal && unlocked) {
        const forbidden =
          data.statusProducao !== undefined ||
          data.g2ProducerObservacoes !== undefined ||
          data.g2ChecklistEmailCartao !== undefined ||
          data.g2ChecklistEnderecoSite !== undefined ||
          data.g2ChecklistRgQsa !== undefined
        if (forbidden) {
          return NextResponse.json(
            { error: 'Com a demanda reaberta, só é permitido alterar a URL do site.' },
            { status: 400 }
          )
        }
      }
      const updateData: Record<string, unknown> = {}
      const h = await headers()
      const ip =
        h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined
      let siteAudit:
        | { prev: string | null; next: string | null }
        | undefined

      if (data.siteUrl !== undefined) {
        const norm = normalizeAdsCoreSiteUrl(data.siteUrl)
        const prev = asset.siteUrl
        if ((prev ?? null) !== (norm ?? null)) {
          if (norm) {
            const taken = await prisma.adsCoreAsset.findFirst({
              where: { siteUrl: norm, id: { not: id } },
            })
            if (taken) {
              return NextResponse.json({ error: ADS_CORE_DUPLICATE_MSG }, { status: 400 })
            }
            const inHist = await isSiteUrlOnlyInHistory(prisma, norm, id)
            if (inHist) {
              return NextResponse.json({ error: ADS_CORE_URL_HISTORICO_MSG }, { status: 400 })
            }
          }
          updateData.siteUrl = norm
          updateData.historicoUrls = appendUrlHistory(
            (asset as AssetWithNiche).historicoUrls,
            {
              at: new Date().toISOString(),
              userId,
              old: prev,
              new: norm,
            }
          )
          siteAudit = { prev, next: norm }
        }
      }
      if (data.statusProducao !== undefined) {
        const next = data.statusProducao
        const cur = asset.statusProducao
        if (
          next === 'VERIFICACAO_G2' &&
          cur !== 'DISPONIVEL' &&
          cur !== 'EM_PRODUCAO'
        ) {
          return NextResponse.json(
            {
              error:
                'Só é possível marcar Verificação G2 a partir de Aguardando início ou Em produção.',
            },
            { status: 400 }
          )
        }
        if (next === 'VERIFICACAO_G2') {
          if (
            !data.g2ChecklistEmailCartao ||
            !data.g2ChecklistEnderecoSite ||
            !data.g2ChecklistRgQsa
          ) {
            return NextResponse.json(
              {
                error:
                  'Marque os três itens do checklist de conformidade G2 (e-mail cartão × cadastro, endereço site × Receita, RG × QSA) antes de finalizar.',
              },
              { status: 400 }
            )
          }
          updateData.g2ProducerObservacoes = data.g2ProducerObservacoes?.trim() || null
          if (cur !== 'VERIFICACAO_G2') {
            updateData.g2FinalizedAt = new Date()
          }
        }
        updateData.statusProducao = next
      }
      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: 'Nenhum campo permitido' }, { status: 400 })
      }
      const updated = await prisma.adsCoreAsset.update({
        where: { id },
        data: updateData as never,
        include: {
          niche: { select: { name: true, briefingInstructions: true } },
          producer: { select: { name: true, email: true } },
        },
      })
      if (siteAudit) {
        await audit({
          userId,
          action: 'ads_core_site_url_changed',
          entity: 'AdsCoreAsset',
          entityId: id,
          oldValue: { siteUrl: siteAudit.prev },
          newValue: { siteUrl: siteAudit.next },
          ip,
          details: { origem: 'produtor' },
        })
      }
      await audit({
        userId,
        action: 'ads_core_asset_updated_producer',
        entity: 'AdsCoreAsset',
        entityId: id,
        details: updateData as Record<string, unknown>,
      })
      if (data.statusProducao === 'VERIFICACAO_G2') {
        await audit({
          userId,
          action: 'ads_core_g2_verificacao_finalizada',
          entity: 'AdsCoreAsset',
          entityId: id,
          ip,
          details: {
            checklistEmailCartao: !!data.g2ChecklistEmailCartao,
            checklistEnderecoSite: !!data.g2ChecklistEnderecoSite,
            checklistRgQsa: !!data.g2ChecklistRgQsa,
            temObservacoes: !!(data.g2ProducerObservacoes && data.g2ProducerObservacoes.trim()),
          },
        })
      }
      await finalizeAdsCoreRgStockIfTerminal(prisma, id, updated.statusProducao)
      return NextResponse.json(toPublicAsset(updated as AssetWithNiche))
    } catch (e) {
      const dup = adsCoreUniqueViolationResponse(e)
      if (dup) return dup
      if (e instanceof z.ZodError) {
        return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
      }
      throw e
    }
  }

  return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  const { id } = await params
  const existing = await prisma.adsCoreAsset.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })
  }
  const whoName = await getUserDisplayName(
    prisma,
    existing.producerId || existing.createdById
  )
  await touchCnpjRegistryOnDelete(prisma, existing.cnpj, existing.producerId, whoName)
  const terminalRg = ['APROVADO', 'REPROVADO', 'VERIFICACAO_G2'].includes(existing.statusProducao)
  await prisma.adsCoreRgStock.updateMany({
    where: { assetId: id },
    data: terminalRg
      ? { status: 'UTILIZADO', assetId: null, assignedAt: null }
      : { status: 'DISPONIVEL', assetId: null, assignedAt: null },
  })
  try {
    await prisma.adsCoreAsset.delete({ where: { id } })
  } catch {
    return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })
  }
  await audit({
    userId: auth.session.user.id,
    action: 'ads_core_asset_deleted',
    entity: 'AdsCoreAsset',
    entityId: id,
    details: { cnpj: existing.cnpj },
  })
  return NextResponse.json({ ok: true })
}
