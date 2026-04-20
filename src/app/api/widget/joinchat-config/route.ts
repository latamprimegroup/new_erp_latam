import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

/**
 * Configuração do widget WhatsApp / Join.Chat (telefone + nicho) conforme sessão e SystemSetting.
 * Prioridade: ClientProfile (CLIENT) → fallback global do admin.
 */
export async function GET() {
  const session = await getServerSession(authOptions)

  const keys = ['whatsapp_number', 'widget_niche', 'joinchat_id'] as const
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [...keys] } },
  })
  const sys = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>
  const sysPhone = digitsOnly(sys.whatsapp_number || '')
  const sysNiche = (sys.widget_niche || '').trim() || 'nossos serviços'
  const joinchatId = (sys.joinchat_id || '').trim() || null

  let telephone = sysPhone
  let niche = sysNiche

  if (session?.user?.role === 'CLIENT') {
    const client = await prisma.clientProfile.findUnique({
      where: { userId: session.user.id },
      select: { whatsapp: true, widgetNiche: true },
    })
    const cPhone = digitsOnly(client?.whatsapp || '')
    if (cPhone.length >= 10) {
      telephone = cPhone
    }
    const n = client?.widgetNiche?.trim()
    if (n) niche = n
  }

  const hasDynamic = telephone.length >= 10

  return NextResponse.json({
    telephone: hasDynamic ? telephone : '',
    niche,
    /** Só carrega bundle join.chat se não houver widget dinâmico (evita ícones duplicados). */
    legacyJoinchatId: hasDynamic ? null : joinchatId,
    mode: hasDynamic ? ('dynamic' as const) : joinchatId ? ('legacy' as const) : ('off' as const),
  })
}
