import { NextResponse } from 'next/server'
import { VaultGmailStatus } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { maskCnpj, maskCpf, maskEmail } from '@/lib/gatekeeper/masking'

const ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'] as const

/**
 * GET — Catálogo mascarado para criar UNI (Módulo 11), mesmo conteúdo que geo-provision/catalog.
 */
export async function GET() {
  const auth = await requireRoles([...ROLES])
  if (!auth.ok) return auth.response

  const [gmails, cnpjs, identities, proxies] = await Promise.all([
    prisma.inventoryGmail.findMany({
      where: { status: VaultGmailStatus.AVAILABLE },
      select: { id: true, email: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.inventoryCnpj.findMany({
      select: {
        id: true,
        cnpj: true,
        geofencing: true,
        razaoSocial: true,
        nicheInferred: true,
        nicheOperatorTag: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.inventoryId.findMany({
      select: { id: true, fullName: true, cpf: true, partnerLegalName: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.geoProxyPoolEntry.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: {
        id: true,
        provider: true,
        label: true,
        proxyHost: true,
        proxyPort: true,
        city: true,
        stateUf: true,
      },
    }),
  ])

  return NextResponse.json({
    gmails: gmails.map((g) => ({ id: g.id, emailMasked: maskEmail(g.email) })),
    cnpjs: cnpjs.map((c) => {
      const geo = c.geofencing as { cidade?: string } | null
      const nicheLabel = (c.nicheOperatorTag || c.nicheInferred || '').trim() || null
      return {
        id: c.id,
        cnpjMasked: maskCnpj(c.cnpj),
        cidade: geo?.cidade ?? null,
        razaoSocial: c.razaoSocial,
        nicheLabel,
      }
    }),
    identities: identities.map((i) => {
      const fn = i.fullName.trim()
      const nameMasked = fn.length > 2 ? `${fn.slice(0, 2)}***` : '***'
      return {
        id: i.id,
        nameMasked,
        cpfMasked: maskCpf(i.cpf),
        partnerLegalName: i.partnerLegalName,
      }
    }),
    proxies: proxies.map((p) => ({
      id: p.id,
      label: p.label,
      provider: p.provider,
      endpoint: `${p.proxyHost}:${p.proxyPort}`,
      city: p.city,
      stateUf: p.stateUf,
    })),
  })
}
