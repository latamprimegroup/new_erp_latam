import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { TrackerOfferPlatform } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createTrackerOfferForMentoradoShield } from '@/lib/mentorado/shield-offer-factory'
import { buildTrackingUrl } from '@/lib/ads-tracker/build-tracking-url'
import { defaultGoogleBlueprint } from '@/lib/ads-tracker/traffic-source-types'
import { mentoradoShieldPayBaseUrl, trackerOfferPostbackUrl } from '@/lib/ads-tracker/offer-urls'

const NICHE = z.enum(['SAUDE', 'FINANCEIRO', 'BLACK', 'ECOMMERCE', 'EDUCACAO', 'GERAL'])
const PROFILE = z.enum(['SAFE', 'MONEY'])

const schema = z.object({
  uniId: z.string().min(32).max(36),
  destinationUrl: z
    .string()
    .min(12)
    .max(2000)
    .refine((s) => {
      try {
        const u = new URL(s.includes('://') ? s : `https://${s}`)
        return u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        return false
      }
    }, 'URL inválida'),
  protectionNiche: NICHE,
  shieldProfile: PROFILE,
  platform: z.nativeEnum(TrackerOfferPlatform),
  label: z.string().max(200).optional(),
})

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const client = await prisma.clientProfile.findUnique({
    where: { userId: session.user!.id },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })

  let body: z.infer<typeof schema>
  try {
    body = schema.parse(await req.json())
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const access = await prisma.clientMentoradoUniAccess.findFirst({
    where: { clientId: client.id, uniId: body.uniId },
  })
  if (!access) {
    return NextResponse.json({ error: 'UNI não autorizada para a sua conta.' }, { status: 403 })
  }

  const uni = await prisma.vaultIndustrialUnit.findUnique({
    where: { id: body.uniId },
    select: { id: true, primaryDomainHost: true },
  })
  if (!uni) return NextResponse.json({ error: 'UNI não encontrada' }, { status: 404 })

  const dest = body.destinationUrl.includes('://') ? body.destinationUrl : `https://${body.destinationUrl}`
  const offerName =
    (body.label?.trim() || `Shield · ${body.protectionNiche}`).slice(0, 200)

  const { offerId, paySlug, postbackPublicToken } = await createTrackerOfferForMentoradoShield({
    name: offerName,
    checkoutTargetUrl: dest,
    platform: body.platform,
  })

  const link = await prisma.mentoradoShieldTrackerLink.create({
    data: {
      clientId: client.id,
      uniId: uni.id,
      label: body.label?.trim() || null,
      destinationUrl: dest,
      protectionNiche: body.protectionNiche,
      shieldProfile: body.shieldProfile,
      offerId,
    },
  })

  const payBase =
    mentoradoShieldPayBaseUrl({
      paySlug,
      uniPrimaryHost: uni.primaryDomainHost,
      shieldProfile: body.shieldProfile,
      protectionNiche: body.protectionNiche,
    }) || ''
  const adsPack = payBase ? buildTrackingUrl(payBase, defaultGoogleBlueprint(), {}, {}) : null

  return NextResponse.json({
    id: link.id,
    shieldPayUrl: payBase || null,
    adsFinalUrl: adsPack?.url || null,
    adsWarnings: adsPack?.warnings || [],
    postbackUrl: trackerOfferPostbackUrl(postbackPublicToken),
    offerId,
  })
}
