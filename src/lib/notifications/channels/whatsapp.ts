/**
 * Canal WhatsApp — Ads Ativos Global
 * Suporta Evolution API com detecção automática de idioma por DDI.
 * +55 → Português (BR) · outros DDIs → English (Direct Response)
 *
 * Configure EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE no .env
 */
import { BRAND, detectLanguage, formatDate } from '@/lib/brand'

export type WhatsAppPayload = {
  phone: string
  message: string
}

// ─── Confirmação de pagamento ─────────────────────────────────────────────────

export type WhatsAppConfirmationParams = {
  whatsapp: string
  buyerName: string
  productTitle: string
  checkoutId: string
  qty?: number
  totalAmount?: number
  memberAreaUrl?: string
}

/**
 * Mensagem padrão de "Pagamento Confirmado" — bilíngue por DDI.
 */
export async function sendWhatsAppConfirmation(
  params: WhatsAppConfirmationParams,
): Promise<boolean> {
  const appBase  = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const panelUrl = params.memberAreaUrl ?? `${appBase}${BRAND.dashboardPath}`
  const lang     = detectLanguage(params.whatsapp)

  const message = lang === 'en'
    ? buildConfirmationEN({ ...params, panelUrl })
    : buildConfirmationPT({ ...params, panelUrl })

  return sendWhatsApp({ phone: params.whatsapp, message })
}

function buildConfirmationPT(p: WhatsAppConfirmationParams & { panelUrl: string }): string {
  const amountLine = p.totalAmount != null
    ? `Valor: R$ ${Number(p.totalAmount).toFixed(2).replace('.', ',')}`
    : null
  return [
    `🚀 *PAGAMENTO CONFIRMADO!*`,
    ``,
    `Olá, *${p.buyerName}*! Recebemos seu pagamento com sucesso. Seu pedido já está em processamento pela equipe da ${BRAND.nameShort}.`,
    ``,
    `📦 *Detalhes do Pedido:*`,
    `Ativo: ${p.productTitle}`,
    ...(p.qty && p.qty > 1 ? [`Quantidade: ${p.qty} unidade(s)`] : []),
    ...(amountLine ? [amountLine] : []),
    `ID da Venda: #${p.checkoutId}`,
    ``,
    `🔗 *Acompanhe seu Pedido:*`,
    `Para visualizar os dados de acesso e o status da entrega, acesse nosso painel exclusivo:`,
    p.panelUrl,
    ``,
    `_(Guarde seu e-mail de cadastro para logar. Em breve, seus ativos serão liberados automaticamente nesta área.)_`,
    ``,
    `👉 Qualquer dúvida, responda esta mensagem.`,
    ``,
    `_${BRAND.name} · ${BRAND.taglinePT}_`,
  ].join('\n')
}

function buildConfirmationEN(p: WhatsAppConfirmationParams & { panelUrl: string }): string {
  const amountLine = p.totalAmount != null
    ? `Amount: $${Number(p.totalAmount).toFixed(2)}`
    : null
  return [
    `🚀 *PAYMENT CONFIRMED!*`,
    ``,
    `Hello, *${p.buyerName}*! Your payment has been received. Your order is now being processed by the ${BRAND.nameShort} team.`,
    ``,
    `📦 *Order Details:*`,
    `Product: ${p.productTitle}`,
    ...(p.qty && p.qty > 1 ? [`Quantity: ${p.qty} unit(s)`] : []),
    ...(amountLine ? [amountLine] : []),
    `Order ID: #${p.checkoutId}`,
    ``,
    `🔗 *Track Your Order:*`,
    `Access your exclusive member area to view credentials and delivery status:`,
    p.panelUrl,
    ``,
    `_(Keep your registered email to log in. Your assets will be released automatically.)_`,
    ``,
    `👉 Any questions? Reply to this message.`,
    ``,
    `_${BRAND.name} · ${BRAND.taglineEN}_`,
  ].join('\n')
}

// ─── Entrega Elite (com credenciais) ──────────────────────────────────────────

export type EliteDeliveryParams = {
  whatsapp: string
  buyerName: string
  productTitle: string
  checkoutId: string
  /** JSON bruto do rawData do ativo */
  credentials: Record<string, unknown> | null | undefined
  warrantyEndsAt: Date | null | undefined
  rmaUrl?: string
  tutorialUrl?: string
  memberAreaUrl?: string
}

/** Rótulos PT → chaves técnicas do rawData */
const CRED_LABELS_PT: Record<string, string> = {
  login:      'Login/Perfil', email:     'Login/Perfil', username: 'Login/Perfil',
  password:   'Senha',        senha:     'Senha',         pass:     'Senha',        key:      'Senha/Key',
  twoFactor:  '2FA/Backup',   two_factor:'2FA/Backup',   mfa:      '2FA/Backup',
  backup:     '2FA/Backup',   backupCode:'2FA/Backup',   recovery: 'Código de Recuperação',
  proxy:      'Proxy',        ip:        'IP/Endereço',  port:     'Porta',
  url:        'URL',          link:      'URL',
  note:       'Observação',   obs:       'Observação',
  id:         'ID',           accountId: 'ID da Conta',  customerId: 'Customer ID',
  painelLogin: 'Login do Painel', painelSenha: 'Senha do Painel',
}
/** Rótulos EN */
const CRED_LABELS_EN: Record<string, string> = {
  login:      'Login',        email:     'Login',         username: 'Login',
  password:   'Password',     senha:     'Password',      pass:     'Password',    key:      'Key/Pass',
  twoFactor:  '2FA/Backup',   two_factor:'2FA/Backup',   mfa:      '2FA/Backup',
  backup:     'Backup Code',  backupCode:'Backup Code',  recovery: 'Recovery Code',
  proxy:      'Proxy',        ip:        'IP Address',   port:     'Port',
  url:        'URL',          link:      'URL',
  note:       'Note',         obs:       'Note',
  id:         'ID',           accountId: 'Account ID',   customerId: 'Customer ID',
  painelLogin: 'Dashboard Login', painelSenha: 'Dashboard Password',
}

function formatCredentials(
  creds: Record<string, unknown>,
  lang: 'pt' | 'en',
): string {
  const labels = lang === 'en' ? CRED_LABELS_EN : CRED_LABELS_PT
  return Object.entries(creds)
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => {
      const label = labels[k] ?? labels[k.toLowerCase()] ?? k
      return `${label}: \`${String(v)}\``
    })
    .join('\n')
}

/**
 * Entrega "Elite" bilíngue com credenciais reais do ativo.
 */
export async function sendWhatsAppEliteDelivery(
  params: EliteDeliveryParams,
): Promise<boolean> {
  const appBase     = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const panelUrl    = params.memberAreaUrl ?? `${appBase}${BRAND.dashboardPath}`
  const rmaUrl      = params.rmaUrl ?? `${appBase}${BRAND.rmaPath}`
  const tutorialUrl = params.tutorialUrl ?? process.env.TUTORIAL_VIDEO_URL ?? ''
  const lang        = detectLanguage(params.whatsapp)

  const credLines = params.credentials
    ? formatCredentials(params.credentials, lang)
    : (lang === 'en'
        ? '_(Credentials will be sent by support shortly.)_'
        : '_(Credenciais serão enviadas pelo suporte em instantes.)_')

  const message = lang === 'en'
    ? buildEliteEN({ ...params, panelUrl, rmaUrl, tutorialUrl, credLines })
    : buildElitePT({ ...params, panelUrl, rmaUrl, tutorialUrl, credLines })

  return sendWhatsApp({ phone: params.whatsapp, message })
}

function buildElitePT(p: EliteDeliveryParams & {
  panelUrl: string; rmaUrl: string; tutorialUrl: string; credLines: string
}): string {
  const warrantyLine = p.warrantyEndsAt
    ? `⏳ Garantia válida até: ${formatDate(new Date(p.warrantyEndsAt), 'pt')}`
    : `⏳ Garantia: 7 dias a partir de hoje`

  return [
    `🛡️ *ADS ATIVOS GLOBAL - INFRAESTRUTURA LIBERADA* 🛡️`,
    ``,
    `Olá, *${p.buyerName}*! Parabéns. Você acaba de adquirir um ativo com a garantia de quem opera há mais de 20 anos no mercado global.`,
    ``,
    `📦 *SEUS DADOS DE ACESSO:*`,
    `Ativo: ${p.productTitle}`,
    p.credLines,
    warrantyLine,
    ``,
    `🔧 *SUPORTE & TROCA AUTOMÁTICA:*`,
    `Se o ativo apresentar qualquer instabilidade dentro do prazo, acesse nosso painel e solicite a Troca Automática (RMA) em um clique:`,
    `🔗 ${p.rmaUrl}`,
    ...(p.tutorialUrl ? [
      ``,
      `🎥 *DÚVIDAS NA INSTALAÇÃO?*`,
      `Assista ao nosso guia rápido para evitar bloqueios por fingerprint:`,
      p.tutorialUrl,
    ] : []),
    ``,
    `🚀 *Acesse seu painel exclusivo:*`,
    p.panelUrl,
    ``,
    `_${BRAND.name} · ${BRAND.taglinePT}_`,
    `_ID do pedido: #${p.checkoutId}_`,
  ].join('\n')
}

function buildEliteEN(p: EliteDeliveryParams & {
  panelUrl: string; rmaUrl: string; tutorialUrl: string; credLines: string
}): string {
  const warrantyLine = p.warrantyEndsAt
    ? `⏳ Warranty valid until: ${formatDate(new Date(p.warrantyEndsAt), 'en')}`
    : `⏳ Warranty: 7 days from today`

  return [
    `🛡️ *ADS ATIVOS GLOBAL - INFRASTRUCTURE DELIVERED* 🛡️`,
    ``,
    `Hello, *${p.buyerName}*! Your high-scale advertising assets are now ready. Welcome to the world's largest contingency infrastructure.`,
    ``,
    `📦 *ACCESS DATA:*`,
    `Product: ${p.productTitle}`,
    p.credLines,
    warrantyLine,
    ``,
    `🔧 *SUPPORT & AUTO-REPLACEMENT:*`,
    `If you face any issues within the warranty period, our self-service RMA system is available 24/7. Get a new asset instantly:`,
    `🔗 ${p.rmaUrl}`,
    ...(p.tutorialUrl ? [
      ``,
      `🎥 *NEED SETUP HELP?*`,
      `Watch our quick guide to avoid fingerprint blocks:`,
      p.tutorialUrl,
    ] : []),
    ``,
    `🚀 *Access your exclusive dashboard:*`,
    p.panelUrl,
    ``,
    `_${BRAND.name} · ${BRAND.taglineEN}_`,
    `_Order ID: #${p.checkoutId}_`,
  ].join('\n')
}

// ─── Primitivo de envio ───────────────────────────────────────────────────────

export async function sendWhatsApp(payload: WhatsAppPayload): Promise<boolean> {
  const evolutionUrl  = process.env.EVOLUTION_API_URL ?? process.env.WHATSAPP_API_URL
  const evolutionKey  = process.env.EVOLUTION_API_KEY ?? process.env.WHATSAPP_API_KEY
  const evolutionInst = process.env.EVOLUTION_INSTANCE ?? process.env.WHATSAPP_INSTANCE_ID ?? 'adsativos'

  if (!evolutionUrl) {
    console.warn('[WhatsApp] EVOLUTION_API_URL não configurado — mensagem não enviada.')
    return false
  }

  const phone = normalizePhone(payload.phone)
  if (!phone) {
    console.warn('[WhatsApp] Número de telefone inválido:', payload.phone)
    return false
  }

  try {
    const endpoint = `${evolutionUrl}/message/sendText/${evolutionInst}`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(evolutionKey && { apikey: evolutionKey }),
      },
      body: JSON.stringify({
        number:      phone,
        options:     { delay: 1000, presence: 'composing' },
        textMessage: { text: payload.message },
      }),
    })
    if (!res.ok) {
      console.error('[WhatsApp] Resposta não-ok:', res.status, await res.text().catch(() => ''))
    }
    return res.ok
  } catch (e) {
    console.error('[WhatsApp] Erro ao enviar mensagem:', e)
    return false
  }
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length >= 10) {
    return digits.startsWith('55') ? digits : `55${digits}`
  }
  return ''
}
