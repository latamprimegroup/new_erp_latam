import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { maskCnpj, maskEmail } from '@/lib/gatekeeper/masking'

/**
 * GET — Lista recente de UNIs (VaultIndustrialUnit) para comando / kit operador.
 */
export async function GET(req: Request) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const take = Math.min(100, Math.max(1, Number(searchParams.get('take') || '40') || 40))

  const rows = await prisma.vaultIndustrialUnit.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    include: {
      inventoryGmail: { select: { id: true, email: true } },
      inventoryCnpj: {
        select: { id: true, cnpj: true, razaoSocial: true, situacaoRf: true, nicheInferred: true, nicheOperatorTag: true },
      },
      identityInventory: { select: { id: true, fullName: true, cpf: true } },
      warmupLot: { select: { id: true, name: true, status: true, internalMaturityPct: true } },
    },
  })

  return NextResponse.json({
    units: rows.map((u) => ({
      id: u.id,
      status: u.status,
      createdAt: u.createdAt.toISOString(),
      adsPowerProfileId: u.adsPowerProfileId,
      geoTransition: u.geoTransition,
      anchorCity: u.anchorCity,
      anchorState: u.anchorState,
      provisionError: u.provisionError,
      gmailMasked: maskEmail(u.inventoryGmail.email),
      cnpjMasked: maskCnpj(u.inventoryCnpj.cnpj),
      razaoSocial: u.inventoryCnpj.razaoSocial,
      nicheLabel: (u.inventoryCnpj.nicheOperatorTag || u.inventoryCnpj.nicheInferred || '').trim() || null,
      situacaoRf: u.inventoryCnpj.situacaoRf,
      identityId: u.identityInventoryId,
      identityNamePreview: u.identityInventory
        ? `${u.identityInventory.fullName.trim().slice(0, 2)}***`
        : null,
      warmupLotId: u.warmupLotId,
      warmupLot: u.warmupLot
        ? {
            id: u.warmupLot.id,
            name: u.warmupLot.name,
            status: u.warmupLot.status,
            internalMaturityPct: u.warmupLot.internalMaturityPct,
          }
        : null,
    })),
  })
}
