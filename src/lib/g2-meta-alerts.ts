/**
 * Alerta quando o "Necessário/dia" do motor de meta G2 ultrapassa um limite (ex.: 30).
 * Envio opcional: Slack (incoming webhook) e/ou WhatsApp (Evolution API já usada no projeto).
 * No máximo **um disparo por dia** (chave em SystemSetting) após envio bem-sucedido.
 */
import { prisma } from '@/lib/prisma'
import { sendWhatsApp } from '@/lib/notifications/channels/whatsapp'

const SETTING_KEY = 'g2_pace_alert_sent_date'

export type MetaEngineLike = {
  producaoDiariaNecessaria: number
  producaoAtual: number
  metaMaxima: number
  metaEmRisco: boolean
}

export async function notifyIfCriticalG2Pace(meta: MetaEngineLike): Promise<void> {
  const threshold = parseInt(process.env.G2_META_NECESSARIO_DIA_ALERT_THRESHOLD || '30', 10)
  if (!Number.isFinite(threshold) || threshold <= 0) return
  if (meta.producaoDiariaNecessaria < threshold) return

  const today = new Date().toISOString().slice(0, 10)
  const prev = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } })
  if (prev?.value === today) return

  const slackUrl = process.env.G2_META_ALERT_SLACK_WEBHOOK?.trim()
  const waPhone = process.env.G2_META_ALERT_WHATSAPP_PHONE?.trim()

  if (!slackUrl && !waPhone) return

  const lines = [
    '🚨 *Produção G2 — ritmo crítico*',
    `Necessário/dia: *${meta.producaoDiariaNecessaria}* (limite configurado: ${threshold})`,
    `Progresso: ${meta.producaoAtual} / ${meta.metaMaxima}`,
    meta.metaEmRisco ? 'Status motor: meta em risco.' : '',
  ].filter(Boolean)
  const text = lines.join('\n')
  const slackText = lines.join('\n')

  let ok = false
  if (slackUrl) {
    try {
      const res = await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: slackText }),
      })
      if (res.ok) ok = true
    } catch (e) {
      console.error('G2 Slack alert failed:', e)
    }
  }
  if (waPhone) {
    const sent = await sendWhatsApp({ phone: waPhone, message: text })
    if (sent) ok = true
  }

  if (ok) {
    await prisma.systemSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: today },
      update: { value: today },
    })
  }
}
