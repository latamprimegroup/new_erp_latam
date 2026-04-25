import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  getQuickSaleKycFileMeta,
  getQuickSaleKycMeta,
  setQuickSaleKycFileMeta,
} from '@/lib/smart-delivery-system'
import {
  saveQuickSaleKycFile,
  validateQuickSaleKycFile,
} from '@/lib/quick-sale-kyc'

export const runtime = 'nodejs'

const KYC_FLOW = 'PENDING_KYC'

export async function GET(req: NextRequest) {
  const checkoutId = req.nextUrl.searchParams.get('checkoutId')
  if (!checkoutId) {
    return NextResponse.json({ error: 'checkoutId é obrigatório.' }, { status: 400 })
  }

  const checkout = await prisma.quickSaleCheckout.findUnique({
    where: { id: checkoutId },
    select: {
      id: true,
      status: true,
      listing: { select: { slug: true, title: true } },
      deliveryFlowStatus: true,
      deliveryStatusNote: true,
      updatedAt: true,
    },
  }).catch(() => null)

  if (!checkout) {
    return NextResponse.json({ error: 'Checkout não encontrado.' }, { status: 404 })
  }

  const kycMeta = await getQuickSaleKycMeta(checkoutId)
  const fileMeta = await getQuickSaleKycFileMeta(checkoutId)

  return NextResponse.json({
    checkoutId,
    status: checkout.status,
    flowStatus: checkout.deliveryFlowStatus,
    canUpload: checkout.status === 'PAID' && checkout.deliveryFlowStatus === KYC_FLOW,
    listing: checkout.listing,
    note: checkout.deliveryStatusNote,
    updatedAt: checkout.updatedAt,
    kyc: {
      riskReasons: kycMeta?.riskReasons ?? [],
      minValueForKyc: kycMeta?.minValueForKyc ?? null,
      fileMeta,
    },
  })
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  if (!form) {
    return NextResponse.json({ error: 'FormData inválido.' }, { status: 400 })
  }

  const checkoutId = String(form.get('checkoutId') ?? '').trim()
  if (!checkoutId) {
    return NextResponse.json({ error: 'checkoutId é obrigatório.' }, { status: 400 })
  }

  const document = form.get('document')
  const selfie = form.get('selfie')

  if (!(document instanceof File) || !(selfie instanceof File)) {
    return NextResponse.json({ error: 'Envie documento e selfie.' }, { status: 422 })
  }

  const checkout = await prisma.quickSaleCheckout.findUnique({
    where: { id: checkoutId },
    select: {
      id: true,
      status: true,
      deliveryFlowStatus: true,
      listingId: true,
    },
  }).catch(() => null)

  if (!checkout) {
    return NextResponse.json({ error: 'Checkout não encontrado.' }, { status: 404 })
  }
  if (checkout.status !== 'PAID') {
    return NextResponse.json({ error: 'Checkout ainda não foi pago.' }, { status: 409 })
  }
  if (checkout.deliveryFlowStatus !== KYC_FLOW) {
    return NextResponse.json({ error: 'Este checkout não exige KYC pendente.' }, { status: 409 })
  }

  const documentValidation = validateQuickSaleKycFile(document, 'document')
  if (!documentValidation.ok) {
    return NextResponse.json({ error: documentValidation.error }, { status: 422 })
  }
  const selfieValidation = validateQuickSaleKycFile(selfie, 'selfie')
  if (!selfieValidation.ok) {
    return NextResponse.json({ error: selfieValidation.error }, { status: 422 })
  }

  const [documentPath, selfiePath] = await Promise.all([
    saveQuickSaleKycFile(checkout.id, 'document', document),
    saveQuickSaleKycFile(checkout.id, 'selfie', selfie),
  ])

  await setQuickSaleKycFileMeta(checkout.id, {
    documentPath,
    selfiePath,
    mimeType: `${document.type || 'application/octet-stream'}|${selfie.type || 'application/octet-stream'}`,
  })

  await prisma.quickSaleCheckout.update({
    where: { id: checkout.id },
    data: {
      deliveryStatusNote: 'Documentos KYC recebidos. Aguardando aprovação manual da equipe.',
    },
  }).catch(() => {})

  await prisma.auditLog.create({
    data: {
      action: 'QUICK_SALE_KYC_SUBMITTED',
      entity: 'QuickSaleCheckout',
      entityId: checkout.id,
      userId: null,
      details: {
        checkoutId: checkout.id,
        listingId: checkout.listingId,
        documentPath,
        selfiePath,
      },
    },
  }).catch(() => {})

  return NextResponse.json({
    ok: true,
    checkoutId: checkout.id,
    fileMeta: {
      documentPath,
      selfiePath,
    },
  })
}
