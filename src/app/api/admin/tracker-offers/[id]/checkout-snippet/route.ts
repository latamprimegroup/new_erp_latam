import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { appPublicBaseUrl } from '@/lib/landing-vault/public-base-url'
import { configFromSettings } from '@/lib/ads-tracker/checkout-defaults'
import { buildAppendParamsSnippet } from '@/lib/ads-tracker/checkout-snippet'

const READ_ROLES = ['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'FINANCE'] as const

/**
 * Snippet JS para colar na landing: propaga parâmetros para links com data-ads-checkout-tunnel.
 * GET ?format=text|attachment
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles([...READ_ROLES])
  if (!auth.ok) return auth.response

  const { id } = await params
  const offer = await prisma.trackerOffer.findUnique({
    where: { id },
    include: { checkoutSettings: true },
  })
  if (!offer) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const base = appPublicBaseUrl()
  const payBase = base ? `${base}/pay/${encodeURIComponent(offer.paySlug)}` : `/pay/${offer.paySlug}`
  const cfg = configFromSettings(offer.checkoutSettings)
  let js = buildAppendParamsSnippet({ paramKeys: cfg.forwardedParamKeys, payBaseUrl: payBase })
  const defer = offer.checkoutSettings?.pixelBackupDelayMs
  if (defer != null && defer > 0) {
    js += `\n/* Ads Ativos: atraso sugerido para scripts de backup no browser: ${defer}ms — aplicar manualmente e cumprir políticas das plataformas. */\n`
  }

  const { searchParams } = new URL(req.url)
  if (searchParams.get('format') === 'json') {
    return NextResponse.json({ javascript: js, payBaseUrl: payBase, paramKeys: cfg.forwardedParamKeys })
  }

  return new NextResponse(js, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}
