/**
 * GET - Status de todas as integrações (área de conexões)
 */
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar'
import { isGoogleAdsConfigured } from '@/lib/google-ads'
import { getSmsProvider } from '@/lib/sms'

function isWhatsAppEnvConfigured(): boolean {
  const url = process.env.WHATSAPP_API_URL?.trim()
  const key = process.env.WHATSAPP_API_KEY?.trim()
  if (!url || !key) return false
  if (url.includes('evolution') && !process.env.WHATSAPP_INSTANCE_ID?.trim()) return false
  return true
}

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const joinchatRow = await prisma.systemSetting.findUnique({
    where: { key: 'joinchat_id' },
    select: { value: true },
  })

  const integracoes = [
    {
      id: 'google-ads',
      nome: 'Google Ads API',
      descricao: 'Sincronização de gastos e Customer ID',
      conectado: isGoogleAdsConfigured(),
      envVars: ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID'],
    },
    {
      id: 'google-calendar',
      nome: 'Google Calendar',
      descricao: 'Agenda de onboarding',
      conectado: isGoogleCalendarConfigured(),
      envVars: ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CALENDAR_REFRESH_TOKEN'],
    },
    {
      id: '5sim',
      nome: '5sim (SMS)',
      descricao: 'Aluguel de números para validação',
      conectado: !!getSmsProvider(),
      envVars: ['FIVESIM_API_KEY'],
    },
    {
      id: 'whatsapp',
      nome: 'WhatsApp',
      descricao: 'Notificações e mensagens',
      conectado: isWhatsAppEnvConfigured(),
      envVars: ['WHATSAPP_API_URL', 'WHATSAPP_API_KEY', 'WHATSAPP_INSTANCE_ID'],
    },
    {
      id: 'email',
      nome: 'Email (Resend)',
      descricao: 'Envio de emails transacionais',
      conectado: !!(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim()),
      envVars: ['RESEND_API_KEY', 'EMAIL_FROM'],
    },
    {
      id: 'push',
      nome: 'Push (PWA)',
      descricao: 'Notificações no celular',
      conectado: !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
      envVars: ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'],
    },
    {
      id: 'airtable',
      nome: 'Airtable',
      descricao: 'Integração opcional',
      conectado: !!(process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID),
      envVars: ['AIRTABLE_API_KEY', 'AIRTABLE_BASE_ID'],
    },
    {
      id: 'banco-inter',
      nome: 'Banco Inter',
      descricao: 'PIX e pagamentos (OAuth2 + mTLS)',
      conectado: !!(
        (process.env.INTER_CLIENT_ID || process.env.BANCO_INTER_CLIENT_ID) &&
        (process.env.INTER_PIX_KEY)
      ),
      envVars: ['INTER_CLIENT_ID', 'INTER_CLIENT_SECRET', 'INTER_ACCOUNT_NUMBER', 'INTER_PIX_KEY', 'INTER_CERT_CRT', 'INTER_CERT_KEY'],
      dashboardHref: '/dashboard/admin/inter-health',
    },
    {
      id: 'utmify',
      nome: 'Utmify',
      descricao: 'Rastreamento S2S de conversões PIX',
      conectado: !!(process.env.UTMIFY_API_TOKEN || process.env.UTMIFY_API_KEY_ALT),
      envVars: ['UTMIFY_API_TOKEN'],
    },
    {
      id: 'gtm',
      nome: 'Google Tag Manager',
      descricao:
        'Fallback ERP: NEXT_PUBLIC_GTM_ID. Por cliente: ClientProfile.gtm_id (Meu Perfil). Evento dataLayer: whatsapp_click.',
      conectado: !!process.env.NEXT_PUBLIC_GTM_ID,
      envVars: ['NEXT_PUBLIC_GTM_ID (opcional se todos usarem GTM próprio)'],
      dashboardHref: '/dashboard/gtm-conversao',
    },
    {
      id: 'joinchat',
      nome: 'Join.Chat / WhatsApp widget',
      descricao:
        'Telefone + nicho em Configurações (global) ou Meu Perfil (cliente). Bundle legado só se não houver número válido.',
      conectado: !!joinchatRow?.value?.trim(),
      envVars: ['joinchat_id (opcional)', 'whatsapp_number', 'widget_niche'],
    },
    {
      id: 'provisioning-cloudflare',
      nome: 'Provisioning Engine (Cloudflare + landers)',
      descricao:
        'Fila de domínios em massa: zona DNS, proxy laranja, SSL strict, webhook CyberPanel/SSH. Painel: /dashboard/admin/provisioning',
      conectado: !!process.env.CLOUDFLARE_API_TOKEN?.trim(),
      envVars: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'PROVISIONING_SERVER_WEBHOOK_URL', 'PROVISIONING_WEBHOOK_SECRET'],
      dashboardHref: '/dashboard/admin/provisioning',
    },
    {
      id: 'ads-ativos-guard',
      nome: 'Ads Ativos Guard',
      descricao:
        'Compliance: blacklist + OpenAI + FFmpeg/Vision em VSL. OPENAI_API_KEY, GOOGLE_VISION_API_KEY, FFMPEG_PATH; webhook opcional no painel.',
      conectado: !!process.env.OPENAI_API_KEY?.trim(),
      envVars: ['OPENAI_API_KEY', 'GOOGLE_VISION_API_KEY', 'FFMPEG_PATH', 'GUARD_NOTIFICATION_WEBHOOK (opcional)'],
      dashboardHref: '/dashboard/admin/guard',
    },
    {
      id: 'tintim-roi-crm',
      nome: 'TinTim.app → ROI & CRM',
      descricao:
        'Webhook de leads/UTM para cruzamento com vendas do ERP. Endpoint: POST /api/webhooks/tintim (Authorization: Bearer ou X-Tintim-Secret).',
      conectado: !!process.env.TINTIM_WEBHOOK_SECRET?.trim(),
      envVars: ['TINTIM_WEBHOOK_SECRET (recomendado em produção)'],
      dashboardHref: '/dashboard/roi-crm',
    },
  ]

  return NextResponse.json({ integracoes })
}
