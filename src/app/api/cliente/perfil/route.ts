import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeGtmId } from '@/lib/gtm'
import { getLocaleFromRequest, apiErrorJson, translateApiError } from '@/lib/api-i18n'

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  country: z.string().optional(),
  notifyEmail: z.boolean().optional(),
  notifyWhatsapp: z.boolean().optional(),
  photo: z.union([z.string().url(), z.literal('')]).optional().nullable(),
  gtmId: z.union([z.string().max(32), z.literal('')]).optional(),
  widgetNiche: z.union([z.string().max(200), z.literal('')]).optional(),
  taxId: z.union([z.string().max(32), z.literal('')]).optional(),
  companyName: z.union([z.string().max(200), z.literal('')]).optional(),
  jobTitle: z.union([z.string().max(120), z.literal('')]).optional(),
  telegramUsername: z.union([z.string().max(64), z.literal('')]).optional(),
  timezone: z.union([z.string().max(64), z.literal('')]).optional(),
  adsPowerEmail: z.union([z.string().max(150), z.literal('')]).optional(),
  operationNiche: z.union([z.string().max(48), z.literal('')]).optional(),
  preferredCurrency: z.enum(['BRL', 'USD']).optional(),
  preferredPaymentMethod: z.union([z.string().max(32), z.literal('')]).optional(),
})

export async function GET(req: NextRequest) {
  const locale = getLocaleFromRequest(req)
  const session = await getServerSession(authOptions)
  if (!session) return apiErrorJson(locale, 'UNAUTHORIZED', 401)
  if (session.user?.role !== 'CLIENT') {
    return apiErrorJson(locale, 'FORBIDDEN', 403)
  }

  const [user, client] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user!.id },
      select: { id: true, email: true, name: true, phone: true, photo: true },
    }),
    prisma.clientProfile.findUnique({
      where: { userId: session.user!.id },
      include: {
        accountManager: { select: { name: true, email: true } },
      },
    }),
  ])

  if (!user || !client) return apiErrorJson(locale, 'PROFILE_NOT_FOUND', 404)

  return NextResponse.json({
    ...user,
    clientProfileId: client.id,
    clientCode: client.clientCode,
    whatsapp: client.whatsapp,
    country: client.country,
    notifyEmail: client.notifyEmail,
    notifyWhatsapp: client.notifyWhatsapp,
    gtmId: client.gtmId,
    widgetNiche: client.widgetNiche,
    taxId: client.taxId,
    companyName: client.companyName,
    jobTitle: client.jobTitle,
    telegramUsername: client.telegramUsername,
    timezone: client.timezone,
    adsPowerEmail: client.adsPowerEmail,
    operationNiche: client.operationNiche,
    preferredCurrency: client.preferredCurrency,
    preferredPaymentMethod: client.preferredPaymentMethod,
    clientStatus: client.clientStatus,
    leadAcquisitionSource: client.leadAcquisitionSource,
    totalSpent: client.totalSpent != null ? Number(client.totalSpent) : null,
    lastPurchaseAt: client.lastPurchaseAt?.toISOString() ?? null,
    accountManager: client.accountManager
      ? { name: client.accountManager.name, email: client.accountManager.email }
      : null,
  })
}

export async function PATCH(req: NextRequest) {
  const locale = getLocaleFromRequest(req)
  const session = await getServerSession(authOptions)
  if (!session) return apiErrorJson(locale, 'UNAUTHORIZED', 401)
  if (session.user?.role !== 'CLIENT') {
    return apiErrorJson(locale, 'FORBIDDEN', 403)
  }

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    const userData: { name?: string | null; phone?: string | null; photo?: string | null } = {}
    if (data.name !== undefined) userData.name = data.name
    if (data.phone !== undefined) userData.phone = data.phone.trim() === '' ? null : data.phone
    if (data.photo !== undefined) {
      userData.photo = data.photo === '' || data.photo == null ? null : data.photo
    }
    if (Object.keys(userData).length > 0) {
      await prisma.user.update({
        where: { id: session.user!.id },
        data: userData,
      })
    }

    const client = await prisma.clientProfile.findUnique({
      where: { userId: session.user!.id },
    })
    if (client) {
      const clientData: {
        whatsapp?: string | null
        country?: string | null
        notifyEmail?: boolean
        notifyWhatsapp?: boolean
        gtmId?: string | null
        widgetNiche?: string | null
        taxId?: string | null
        companyName?: string | null
        jobTitle?: string | null
        telegramUsername?: string | null
        timezone?: string | null
        adsPowerEmail?: string | null
        operationNiche?: string | null
        preferredCurrency?: string
        preferredPaymentMethod?: string | null
      } = {}
      if (data.whatsapp !== undefined) {
        clientData.whatsapp = data.whatsapp.trim() === '' ? null : data.whatsapp
      }
      if (data.country !== undefined) {
        clientData.country = data.country.trim() === '' ? null : data.country
      }
      if (data.notifyEmail !== undefined) clientData.notifyEmail = data.notifyEmail
      if (data.notifyWhatsapp !== undefined) clientData.notifyWhatsapp = data.notifyWhatsapp
      if (data.gtmId !== undefined) {
        const raw = data.gtmId.trim()
        if (raw === '') {
          clientData.gtmId = null
        } else {
          const n = normalizeGtmId(raw)
          if (!n) {
            return NextResponse.json(
              {
                error:
                  locale === 'pt-BR'
                    ? 'GTM ID inválido. Use o formato GTM-XXXXXXX (container do Google Tag Manager).'
                    : locale === 'es'
                      ? 'GTM ID no válido. Use el formato GTM-XXXXXXX (contenedor de Google Tag Manager).'
                      : 'Invalid GTM ID. Use format GTM-XXXXXXX (Google Tag Manager container).',
              },
              { status: 400 }
            )
          }
          clientData.gtmId = n
        }
      }
      if (data.widgetNiche !== undefined) {
        clientData.widgetNiche = data.widgetNiche.trim() === '' ? null : data.widgetNiche.trim().slice(0, 200)
      }
      const trimOrNull = (s: string | undefined, max: number) => {
        if (s === undefined) return undefined
        const t = s.trim()
        return t === '' ? null : t.slice(0, max)
      }
      if (data.taxId !== undefined) clientData.taxId = trimOrNull(data.taxId, 32)
      if (data.companyName !== undefined) clientData.companyName = trimOrNull(data.companyName, 200)
      if (data.jobTitle !== undefined) clientData.jobTitle = trimOrNull(data.jobTitle, 120)
      if (data.telegramUsername !== undefined) {
        clientData.telegramUsername = trimOrNull(data.telegramUsername, 64)
      }
      if (data.timezone !== undefined) clientData.timezone = trimOrNull(data.timezone, 64)
      if (data.adsPowerEmail !== undefined) {
        clientData.adsPowerEmail = trimOrNull(data.adsPowerEmail, 150)
      }
      if (data.operationNiche !== undefined) {
        clientData.operationNiche = trimOrNull(data.operationNiche, 48)
      }
      if (data.preferredCurrency !== undefined) clientData.preferredCurrency = data.preferredCurrency
      if (data.preferredPaymentMethod !== undefined) {
        clientData.preferredPaymentMethod = trimOrNull(data.preferredPaymentMethod, 32)
      }
      if (Object.keys(clientData).length > 0) {
        await prisma.clientProfile.update({
          where: { id: client.id },
          data: clientData,
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json(
      { error: translateApiError(locale, 'GENERIC') },
      { status: 500 }
    )
  }
}
