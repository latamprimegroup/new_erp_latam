import { NextRequest, NextResponse } from 'next/server'
import { PurchasedAssetType, PurchasePaymentMethod } from '@prisma/client'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

const ALLOWED_ROLES = ['ADMIN', 'PRODUCTION_MANAGER', 'PURCHASING'] as const

// ─── GET: Listar entradas ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireRoles([...ALLOWED_ROLES])
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const assetType = searchParams.get('assetType')
  const take = Math.min(100, Math.max(10, Number(searchParams.get('limit') || '50')))
  const skip = Math.max(0, Number(searchParams.get('skip') || '0'))

  const where: Record<string, unknown> = {}
  if (status && ['PENDENTE', 'CONFIRMADA', 'CANCELADA'].includes(status)) {
    where.status = status
  }
  if (assetType && Object.values(PurchasedAssetType).includes(assetType as PurchasedAssetType)) {
    where.assetType = assetType
  }

  const [entries, total] = await Promise.all([
    prisma.purchaseEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        items: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.purchaseEntry.count({ where }),
  ])

  // Totais para o resumo
  const [totalSpent, pendingCount] = await Promise.all([
    prisma.purchaseEntry.aggregate({
      where: { status: { not: 'CANCELADA' } },
      _sum: { totalCost: true },
    }),
    prisma.purchaseEntry.count({ where: { status: 'PENDENTE' } }),
  ])

  return NextResponse.json({
    entries,
    total,
    summary: {
      totalSpent: Number(totalSpent._sum.totalCost ?? 0),
      pendingCount,
    },
  })
}

// ─── POST: Registrar nova entrada ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireRoles([...ALLOWED_ROLES])
  if (!auth.ok) return auth.response

  const body = await req.json()
  const {
    supplierId,
    supplierName,
    assetType,
    platform,
    items: itemsInput,
    unitCost,
    totalCost,
    paymentMethod,
    paymentProofUrl,
    notes,
  } = body

  // Validações básicas
  if (!assetType || !Object.values(PurchasedAssetType).includes(assetType)) {
    return NextResponse.json({ error: 'Tipo de ativo inválido' }, { status: 400 })
  }
  if (!paymentMethod || !Object.values(PurchasePaymentMethod).includes(paymentMethod)) {
    return NextResponse.json({ error: 'Forma de pagamento inválida' }, { status: 400 })
  }
  if (!totalCost || isNaN(Number(totalCost)) || Number(totalCost) <= 0) {
    return NextResponse.json({ error: 'Valor total inválido' }, { status: 400 })
  }
  if (!Array.isArray(itemsInput) || itemsInput.length === 0) {
    return NextResponse.json({ error: 'Pelo menos um ativo deve ser informado' }, { status: 400 })
  }
  if (!supplierId && !supplierName) {
    return NextResponse.json({ error: 'Informe o fornecedor ou o nome do fornecedor' }, { status: 400 })
  }

  // Verifica se o fornecedor existe quando ID fornecido
  if (supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } })
    if (!supplier) return NextResponse.json({ error: 'Fornecedor não encontrado' }, { status: 404 })
  }

  const entry = await prisma.purchaseEntry.create({
    data: {
      supplierId: supplierId || null,
      supplierName: supplierId ? null : (supplierName || null),
      assetType: assetType as PurchasedAssetType,
      platform: platform || null,
      quantity: itemsInput.length,
      unitCost: unitCost ? Number(unitCost) : null,
      totalCost: Number(totalCost),
      paymentMethod: paymentMethod as PurchasePaymentMethod,
      paymentProofUrl: paymentProofUrl || null,
      notes: notes || null,
      status: 'PENDENTE',
      createdById: auth.session.user.id,
      items: {
        create: (itemsInput as { assetIdentifier: string; assetLabel?: string; notes?: string }[]).map((item) => ({
          assetIdentifier: String(item.assetIdentifier).trim(),
          assetLabel: item.assetLabel ? String(item.assetLabel).trim() : null,
          notes: item.notes ? String(item.notes).trim() : null,
        })),
      },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      items: true,
    },
  })

  return NextResponse.json(entry, { status: 201 })
}
