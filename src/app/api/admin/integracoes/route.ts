/**
 * GET - Status de todas as integrações (área de conexões)
 */
import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { isGoogleCalendarConfigured } from '@/lib/google-calendar'
import { isGoogleAdsConfigured } from '@/lib/google-ads'
import { getSmsProvider } from '@/lib/sms'

export async function GET() {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

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
      conectado: !!process.env.WHATSAPP_API_URL,
      envVars: ['WHATSAPP_API_URL', 'WHATSAPP_API_KEY', 'WHATSAPP_INSTANCE_ID'],
    },
    {
      id: 'email',
      nome: 'Email (Resend)',
      descricao: 'Envio de emails transacionais',
      conectado: !!process.env.RESEND_API_KEY,
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
      descricao: 'PIX e pagamentos',
      conectado: !!(process.env.BANCO_INTER_CLIENT_ID && process.env.BANCO_INTER_CLIENT_SECRET),
      envVars: ['BANCO_INTER_CLIENT_ID', 'BANCO_INTER_CLIENT_SECRET'],
    },
  ]

  return NextResponse.json({ integracoes })
}
