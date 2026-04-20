import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { AdsCoreAssetProductionStatus, AdsCoreVerificationTrack, Prisma } from '@prisma/client'
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
import {
  buildAdsCoreCnaeIncongruenceQuestion,
  buildCnaeFuzzyText,
  isReceitaSituacaoAtiva,
  nicheCongruenceComplete,
  rootsFromConsulta,
} from '@/lib/ads-core-cnae'
import { formatAdsCoreProcessedAt, getUserDisplayName } from '@/lib/ads-core-cnpj-registry'
import { assertProducerAllowedForAdsCoreNiche } from '@/lib/ads-core-producer-niche'
import { parseAdsCoreVerificationTrack } from '@/lib/ads-core-verification-track'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

/** Uma linha CSV com campos entre aspas e vírgulas no meio do texto (ex.: endereço). */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (c === ',' && !inQuotes) {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur.trim())
  return out.map((s) => s.replace(/^"|"$/g, '').replace(/""/g, '"'))
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []
  const header = parseCsvLine(lines[0]!).map((h) => h.trim().toLowerCase())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!)
    const row: Record<string, string> = {}
    header.forEach((h, j) => {
      row[h] = cells[j] ?? ''
    })
    rows.push(row)
  }
  return rows
}

function normRowKeys(row: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase().replace(/\s/g, ''), v])
  )
}

const rowSchema = z.object({
  nicheid: z.string().min(1),
  cnpj: z.string().min(8),
  razaosocial: z.string().optional(),
  nomefantasia: z.string().optional(),
  endereco: z.string().optional(),
  emailempresa: z.string().optional(),
  telefone: z.string().optional(),
  cnae: z.string().optional(),
  cnaedescricao: z.string().optional(),
  cnaesecundarios: z.string().optional(),
  statusreceita: z.string().optional(),
  siteurl: z.string().optional(),
  producerid: z.string().optional(),
  statusproducao: z.string().optional(),
  verificationtrack: z.string().optional(),
})

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function loadExistingSet(values: string[], field: 'cnpj' | 'siteUrl'): Promise<Set<string>> {
  const set = new Set<string>()
  const unique = [...new Set(values.filter(Boolean))]
  for (const ch of chunkArray(unique, 400)) {
    if (field === 'cnpj') {
      const rows = await prisma.adsCoreAsset.findMany({
        where: { cnpj: { in: ch } },
        select: { cnpj: true },
      })
      for (const r of rows) {
        if (r.cnpj) set.add(r.cnpj)
      }
    } else {
      const rows = await prisma.adsCoreAsset.findMany({
        where: { siteUrl: { in: ch } },
        select: { siteUrl: true },
      })
      for (const r of rows) {
        if (r.siteUrl) set.add(r.siteUrl)
      }
    }
  }
  return set
}

const CREATE_CHUNK = 250

export async function POST(req: Request) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response
  if (!isGerente(auth.session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const bodySchema = z.object({
    csv: z.string().min(10),
  })
  try {
    const { csv } = bodySchema.parse(await req.json())
    const rawRows = parseCsv(csv)
    const errors: { line: number; error: string }[] = []

    type Candidate = {
      line: number
      nicheId: string
      producerId: string | null
      cnpj: string
      normSite: string | null
      status: AdsCoreAssetProductionStatus
      razaoSocial: string | null
      nomeFantasia: string | null
      endereco: string | null
      emailEmpresa: string | null
      telefone: string | null
      cnae: string | null
      cnaeDescricao: string | null
      cnaeSecundarios: string[]
      statusReceita: string
      verificationTrack: AdsCoreVerificationTrack
    }

    const candidates: Candidate[] = []
    const allowed: AdsCoreAssetProductionStatus[] = [
      'DISPONIVEL',
      'EM_PRODUCAO',
      'VERIFICACAO_G2',
      'APROVADO',
      'REPROVADO',
    ]

    const nicheIdsNeeded = new Set<string>()
    const producerIdsNeeded = new Set<string>()

    for (let i = 0; i < rawRows.length; i++) {
      const line = i + 2
      try {
        const r = rowSchema.parse(normRowKeys(rawRows[i]))
        const cnpj = normalizeAdsCoreCnpj(r.cnpj)
        if (cnpj.length !== 14) {
          errors.push({ line, error: 'CNPJ inválido' })
          continue
        }
        const status = (r.statusproducao || 'DISPONIVEL').toUpperCase() as AdsCoreAssetProductionStatus
        if (!allowed.includes(status)) {
          errors.push({ line, error: 'statusProducao inválido' })
          continue
        }
        nicheIdsNeeded.add(r.nicheid)
        if (r.producerid) producerIdsNeeded.add(r.producerid)
        const normSite = normalizeAdsCoreSiteUrl(r.siteurl || undefined) || null
        const secRaw = r.cnaesecundarios?.trim() || ''
        const cnaeSecundarios = secRaw
          ? secRaw.split(/[;|]/).map((s) => s.trim()).filter(Boolean)
          : []
        const statusRec = (r.statusreceita?.trim() || 'ATIVA').toUpperCase()
        const verificationTrack = parseAdsCoreVerificationTrack(r.verificationtrack)
        candidates.push({
          line,
          nicheId: r.nicheid,
          producerId: r.producerid || null,
          cnpj,
          normSite,
          status,
          razaoSocial: r.razaosocial?.trim() || null,
          nomeFantasia: r.nomefantasia?.trim() || null,
          endereco: r.endereco?.trim() || null,
          emailEmpresa: r.emailempresa?.trim() || null,
          telefone: r.telefone?.trim() || null,
          cnae: r.cnae?.trim() || null,
          cnaeDescricao: r.cnaedescricao?.trim() || null,
          cnaeSecundarios,
          statusReceita: statusRec,
          verificationTrack,
        })
      } catch {
        errors.push({ line, error: 'Linha inválida' })
      }
    }

    const nicheRows = await prisma.adsCoreNiche.findMany({
      where: { id: { in: [...nicheIdsNeeded] }, active: true },
      include: { allowedCnaes: { select: { code: true } } },
    })
    const validNicheIds = new Set(nicheRows.map((n) => n.id))
    function parseKw(raw: unknown): string[] {
      if (raw == null) return []
      if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean)
      return []
    }
    const nicheNameById = new Map(nicheRows.map((n) => [n.id, n.name]))
    const nicheMetaMap = new Map(
      nicheRows.map((n) => [
        n.id,
        {
          allowedCodes: n.allowedCnaes.map((a) => a.code),
          keywords: parseKw(n.congruenceKeywords),
        },
      ])
    )
    const validProducerIds = new Set(
      (
        await prisma.user.findMany({
          where: { id: { in: [...producerIdsNeeded] }, role: 'PRODUCER' },
          select: { id: true },
        })
      ).map((u) => u.id)
    )

    const validated: Candidate[] = []
    for (const c of candidates) {
      if (!validNicheIds.has(c.nicheId)) {
        errors.push({ line: c.line, error: 'Nicho inválido' })
        continue
      }
      if (c.producerId && !validProducerIds.has(c.producerId)) {
        errors.push({ line: c.line, error: 'Produtor inválido' })
        continue
      }
      if (c.producerId) {
        const allow = await assertProducerAllowedForAdsCoreNiche(prisma, c.nicheId, c.producerId)
        if (!allow.ok) {
          errors.push({ line: c.line, error: allow.error })
          continue
        }
      }
      validated.push(c)
    }

    const seenCnpj = new Set<string>()
    const seenSite = new Set<string>()
    const deduped: Candidate[] = []
    for (const c of validated) {
      if (seenCnpj.has(c.cnpj)) {
        errors.push({ line: c.line, error: 'CNPJ duplicado no arquivo' })
        continue
      }
      seenCnpj.add(c.cnpj)
      if (c.normSite) {
        if (seenSite.has(c.normSite)) {
          errors.push({ line: c.line, error: 'Site duplicado no arquivo' })
          continue
        }
        seenSite.add(c.normSite)
      }
      deduped.push(c)
    }

    const cnpjList = deduped.map((c) => c.cnpj)
    const siteList = deduped.map((c) => c.normSite).filter((s): s is string => !!s)

    const [dbCnpj, dbSite, regRows, producersList] = await Promise.all([
      loadExistingSet(cnpjList, 'cnpj'),
      loadExistingSet(siteList, 'siteUrl'),
      prisma.adsCoreCnpjRegistry.findMany({
        where: { cnpj: { in: cnpjList } },
      }),
      prisma.user.findMany({
        where: { role: 'PRODUCER' },
        select: { id: true, name: true, email: true },
      }),
    ])

    const dupCnpjKeys = [...new Set(deduped.filter((c) => dbCnpj.has(c.cnpj)).map((c) => c.cnpj))]
    const cnpjDuplicateOwners =
      dupCnpjKeys.length > 0
        ? await prisma.adsCoreAsset.findMany({
            where: { cnpj: { in: dupCnpjKeys } },
            select: { cnpj: true, producer: { select: { name: true, email: true } } },
          })
        : []
    const ownerByCnpj = new Map(
      cnpjDuplicateOwners.map((r) => [r.cnpj, r.producer])
    )

    const regMap = new Map(regRows.map((r) => [r.cnpj, r]))
    const prodLabel = new Map(
      producersList.map((u) => [u.id, (u.name || u.email || '—').trim()])
    )
    const managerName = await getUserDisplayName(prisma, auth.session.user.id)

    const toCreate: Prisma.AdsCoreAssetCreateManyInput[] = []
    for (const c of deduped) {
      if (dbCnpj.has(c.cnpj)) {
        const p = ownerByCnpj.get(c.cnpj)
        const label = p ? (p.name || p.email || '').trim() : ''
        errors.push({
          line: c.line,
          error: label
            ? `Linha ignorada: CNPJ já cadastrado no sistema (colaborador vinculado: ${label}).`
            : ADS_CORE_DUPLICATE_MSG,
        })
        continue
      }
      const regHit = regMap.get(c.cnpj)
      if (regHit) {
        errors.push({
          line: c.line,
          error: `Este ativo já foi processado por ${regHit.producerName || 'um produtor'} em ${formatAdsCoreProcessedAt(regHit.processedAt)}.`,
        })
        continue
      }
      if (c.normSite && dbSite.has(c.normSite)) {
        errors.push({ line: c.line, error: ADS_CORE_DUPLICATE_MSG })
        continue
      }
      if (c.normSite) {
        const inHist = await isSiteUrlOnlyInHistory(prisma, c.normSite)
        if (inHist) {
          errors.push({ line: c.line, error: ADS_CORE_URL_HISTORICO_MSG })
          continue
        }
      }
      if (!isReceitaSituacaoAtiva(c.statusReceita)) {
        errors.push({
          line: c.line,
          error: `Situação Receita deve ser ATIVA (recebido: ${c.statusReceita})`,
        })
        continue
      }
      const meta = nicheMetaMap.get(c.nicheId)
      const allowed = meta?.allowedCodes ?? []
      const keywords = meta?.keywords ?? []
      const roots = rootsFromConsulta({ cnae: c.cnae, cnaeSecundarios: c.cnaeSecundarios })
      const fuzzy = buildCnaeFuzzyText({
        razaoSocial: c.razaoSocial,
        nomeFantasia: c.nomeFantasia,
        cnaeDescricao: c.cnaeDescricao,
        cnaeSecundarios: c.cnaeSecundarios,
      })
      const congr = nicheCongruenceComplete(allowed, roots, keywords, fuzzy)
      if (!congr.ok) {
        const nLabel = nicheNameById.get(c.nicheId) || 'este nicho'
        errors.push({
          line: c.line,
          error: buildAdsCoreCnaeIncongruenceQuestion(nLabel) + ' Importação em lote exige linhas já congruentes.',
        })
        continue
      }
      toCreate.push({
        nicheId: c.nicheId,
        producerId: c.producerId,
        adminId: auth.session.user.id,
        cnpj: c.cnpj,
        razaoSocial: c.razaoSocial,
        nomeFantasia: c.nomeFantasia,
        endereco: c.endereco,
        emailEmpresa: c.emailEmpresa,
        telefone: c.telefone,
        cnae: c.cnae,
        cnaeDescricao: c.cnaeDescricao,
        statusReceita: c.statusReceita,
        siteUrl: c.normSite,
        congruenciaCheck: congr.ok,
        historicoUrls: c.normSite
          ? [
              {
                at: new Date().toISOString(),
                userId: auth.session.user.id,
                old: null,
                new: c.normSite,
              },
            ]
          : [],
        statusProducao: c.status,
        verificationTrack: c.verificationTrack,
        createdById: auth.session.user.id,
        producerAssignedAt: c.producerId ? new Date() : null,
      } as never)
    }

    let ok = 0
    if (toCreate.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const ch of chunkArray(toCreate, CREATE_CHUNK)) {
          const r = await tx.adsCoreAsset.createMany({ data: ch })
          ok += r.count
          await tx.adsCoreCnpjRegistry.createMany({
            data: ch.map((row) => {
              const cnpj = row.cnpj as string
              const pid = (row.producerId as string | null) ?? null
              return {
                cnpj,
                producerId: pid,
                producerName: pid ? prodLabel.get(pid) || '—' : managerName,
                processedAt: new Date(),
                source: 'ATIVO',
              }
            }),
            skipDuplicates: true,
          })
        }
      })
    }

    await audit({
      userId: auth.session.user.id,
      action: 'ads_core_bulk_import',
      entity: 'AdsCoreAsset',
      details: { ok, failed: errors.length, rowsInFile: rawRows.length },
    })

    return NextResponse.json({ ok: true, imported: ok, failed: errors.length, errors })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0].message }, { status: 400 })
    }
    throw e
  }
}
