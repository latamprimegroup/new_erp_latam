/**
 * POST /api/webhooks/evolution/fast-entry
 *
 * Webhook da Evolution API — integração WhatsApp → ALFREDO Fast-Entry.
 *
 * Fluxo:
 *  1. Usuário envia comprovante (texto ou imagem) para o número configurado no WhatsApp.
 *  2. Evolution API dispara este webhook com o evento "messages.upsert".
 *  3. ALFREDO IA extrai os dados usando OpenAI (texto/Vision).
 *  4. Cria FastEntryDraft com source="WHATSAPP".
 *  5. Responde via Evolution API no WhatsApp confirmando o recebimento.
 *
 * Segurança:
 *  - Valida o header Authorization (Bearer EVOLUTION_WEBHOOK_SECRET).
 *  - Aceita mensagens apenas de números autorizados (ALFREDO_ALLOWED_PHONES).
 *  - Deduplica por waMessageId.
 *
 * Variáveis de ambiente necessárias:
 *  EVOLUTION_API_URL        — ex: https://evolution.adsativos.com
 *  EVOLUTION_API_KEY        — chave da instância
 *  EVOLUTION_INSTANCE       — nome da instância (ex: alfredo)
 *  EVOLUTION_WEBHOOK_SECRET — secret para validar webhook (opcional mas recomendado)
 *  ALFREDO_ALLOWED_PHONES   — números autorizados separados por vírgula (ex: 5511999999999,5521...)
 *                             Se vazio, aceita de qualquer número.
 *  ALFREDO_ADMIN_USER_ID    — userId do ADMIN/FINANCE que será o "autor" dos drafts criados via WA
 *  OPENAI_API_KEY           — já usado no fast-entry manual
 *  OPENAI_MODEL             — ex: gpt-4o-mini
 */
import { NextResponse } from 'next/server'
import { prisma }       from '@/lib/prisma'
import OpenAI           from 'openai'

export const dynamic = 'force-dynamic'

// ─── Helpers ────────────────────────────────────────────────────────────────

const CATEGORY_MAP: { keywords: string[]; category: string }[] = [
  { keywords: ['conta', 'contas', 'ativo', 'ativos', 'perfil'],           category: 'Custo de Ativos'  },
  { keywords: ['servidor', 'proxy', 'infra', 'hosting', 'vps', 'domínio'], category: 'Infraestrutura'  },
  { keywords: ['salário', 'folha', 'colaborador', 'freelancer'],           category: 'Recursos Humanos' },
  { keywords: ['imposto', 'das', 'irpj', 'csll', 'inss'],                 category: 'Impostos'         },
  { keywords: ['comissão', 'comissoes', 'parceiro'],                       category: 'Comissões'        },
  { keywords: ['ads', 'tráfego', 'campanha', 'google', 'meta', 'tiktok'], category: 'Mídia Paga'       },
  { keywords: ['software', 'saas', 'assinatura', 'licença'],              category: 'Software/SaaS'    },
  { keywords: ['pix recebido', 'pagamento recebido', 'cliente pagou'],    category: 'Recebível'         },
]

function detectCategory(text: string): string {
  const lower = text.toLowerCase()
  for (const m of CATEGORY_MAP) {
    if (m.keywords.some((k) => lower.includes(k))) return m.category
  }
  return 'Geral'
}

function extractWithRegex(text: string, type: string) {
  const amtMatch = text.match(/R\$\s*([\d.,]+)/i) ?? text.match(/([\d]{1,3}(?:[.,][\d]{3})*(?:[.,][\d]{2}))/)
  const rawAmt   = amtMatch ? amtMatch[1].replace(/\./g, '').replace(',', '.') : null
  const amount   = rawAmt ? parseFloat(rawAmt) : null
  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/)
  const txMatch   = text.match(/E\d{20,}/i) ?? text.match(/\b[A-Z0-9]{25,}\b/)
  return {
    amount,
    currency: 'BRL',
    date:            dateMatch ? new Date(dateMatch[1]).toISOString() : null,
    name:            null as string | null,
    transactionId:   txMatch ? txMatch[0] : null,
    paymentMethod:   text.toLowerCase().includes('pix') ? 'PIX' : 'OUTRO',
    category:        detectCategory(text),
    description:     text.slice(0, 200),
    confidence:      amount ? 40 : 10,
    isIncome:        type === 'ENTRADA',
  }
}

function buildExtractionPrompt(type: string): string {
  const isEntrada = type === 'ENTRADA'
  return `Você é ALFREDO IA, assistente financeiro do ERP Ads Ativos. Extraia dados de comprovantes de ${isEntrada ? 'recebimento' : 'pagamento'} e retorne JSON.
REGRAS:
- Se for imagem: leia o comprovante (PIX, TED, transferência) e extraia todos os campos visíveis.
- Se for texto: interprete como mensagem do WhatsApp ou comprovante colado.
- Retorne SOMENTE JSON válido, sem markdown, sem texto extra.
- Para datas, use ISO 8601. Para valores, use número float (ex: 1500.00). Se não souber, use null.
- Para "transactionId", extraia o código E2E do PIX (começa com "E0") ou ID da transação.
SCHEMA: {"amount":number|null,"currency":"BRL"|"USD"|"EUR","date":string|null,"name":string|null,"transactionId":string|null,"paymentMethod":"PIX"|"TED"|"DOC"|"BOLETO"|"CARTAO"|"DINHEIRO"|"OUTRO","category":string|null,"description":string,"confidence":number,"isIncome":boolean}`
}

async function extractWithAI(text: string | null, imageBase64: string | null, mimeType: string, type: string) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return extractWithRegex(text ?? '', type)

  try {
    const client   = new OpenAI({ apiKey })
    const model    = process.env.OPENAI_MODEL ?? 'gpt-4o-mini'
    const prompt   = buildExtractionPrompt(type)
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = imageBase64
      ? [{ role: 'user', content: [
          { type: 'text',      text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } },
        ] }]
      : [{ role: 'user', content: `${prompt}\n\nTexto do comprovante:\n${text}` }]

    const response = await client.chat.completions.create({ model, messages, temperature: 0.1, max_tokens: 500 })
    const raw      = response.choices[0]?.message?.content ?? '{}'
    const cleaned  = raw.replace(/```json\n?/g, '').replace(/```/g, '').trim()
    const result   = JSON.parse(cleaned)
    if (!result.category && text) result.category = detectCategory(text)
    return result
  } catch {
    return extractWithRegex(text ?? '', type)
  }
}

async function sendWhatsAppReply(to: string, message: string) {
  const url      = process.env.EVOLUTION_API_URL
  const key      = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE ?? 'alfredo'
  if (!url || !key) return

  try {
    await fetch(`${url}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ number: to, text: message }),
    })
  } catch (err) {
    console.error('[evolution/fast-entry] Erro ao enviar reply WhatsApp:', err)
  }
}

// ─── Webhook handler ─────────────────────────────────────────────────────────

export async function POST(req: globalThis.Request) {
  try {
    // 1. Valida secret
    const secret = process.env.EVOLUTION_WEBHOOK_SECRET
    if (secret) {
      const auth = req.headers.get('authorization') ?? req.headers.get('apikey') ?? ''
      if (!auth.replace('Bearer ', '') === !secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ ok: false, reason: 'empty body' })

    // 2. Filtra apenas eventos de mensagem recebida
    const event = body?.event as string | undefined
    if (!event?.includes('messages') && event !== 'MESSAGES_UPSERT') {
      return NextResponse.json({ ok: true, reason: 'event ignored' })
    }

    const data    = body?.data ?? body
    const message = data?.message ?? data?.messages?.[0]
    if (!message) return NextResponse.json({ ok: true, reason: 'no message' })

    // 3. Ignora mensagens enviadas pelo próprio bot (fromMe)
    const key = message?.key ?? data?.key
    if (key?.fromMe) return NextResponse.json({ ok: true, reason: 'own message' })

    // 4. Extrai dados da mensagem
    const messageId   = key?.id as string | undefined
    const remoteJid   = key?.remoteJid as string | undefined
    if (!remoteJid) return NextResponse.json({ ok: true, reason: 'no jid' })

    const senderPhone = remoteJid.replace(/@.*$/, '').replace(/[^0-9]/g, '')
    const senderName  = (data?.pushName ?? data?.verifiedBizName ?? message?.pushName ?? 'WhatsApp') as string

    // 5. Verifica autorização por número
    const allowedRaw = process.env.ALFREDO_ALLOWED_PHONES ?? ''
    if (allowedRaw.trim()) {
      const allowed = allowedRaw.split(',').map((p) => p.trim().replace(/[^0-9]/g, ''))
      if (!allowed.includes(senderPhone)) {
        console.log(`[evolution/fast-entry] Número não autorizado: ${senderPhone}`)
        return NextResponse.json({ ok: true, reason: 'not allowed' })
      }
    }

    // 6. Deduplica por messageId
    if (messageId) {
      const exists = await prisma.fastEntryDraft.findFirst({ where: { waMessageId: messageId } })
      if (exists) return NextResponse.json({ ok: true, reason: 'duplicate' })
    }

    // 7. Extrai conteúdo (texto ou imagem)
    const msgContent = message?.message ?? data?.message?.message ?? {}
    let   text:        string | null = null
    let   imageBase64: string | null = null
    const mimeType                   = 'image/jpeg'

    if (msgContent?.conversation) {
      text = msgContent.conversation as string
    } else if (msgContent?.extendedTextMessage?.text) {
      text = msgContent.extendedTextMessage.text as string
    } else if (msgContent?.imageMessage) {
      // Tenta obter a imagem em base64 da Evolution API
      const imgData  = msgContent.imageMessage
      const caption  = imgData?.caption as string | undefined
      text           = caption ?? null
      const b64      = imgData?.jpegThumbnail ?? imgData?.base64
      if (b64) imageBase64 = b64 as string
    } else if (msgContent?.documentMessage) {
      text = (msgContent.documentMessage?.caption as string | undefined) ?? null
    }

    if (!text && !imageBase64) {
      await sendWhatsAppReply(
        senderPhone,
        '⚠️ ALFREDO IA não conseguiu processar este tipo de mensagem. Envie o texto do comprovante ou uma imagem (foto ou screenshot do PIX).'
      )
      return NextResponse.json({ ok: true, reason: 'unsupported content' })
    }

    // 8. Detecta tipo (ENTRADA/SAÍDA) pela mensagem
    const lowerText  = (text ?? '').toLowerCase()
    const isIncome   = lowerText.includes('recebeu') || lowerText.includes('recebido') ||
                       lowerText.includes('entrada') || lowerText.includes('crédito') ||
                       lowerText.includes('pix recebido') || lowerText.includes('você recebeu')
    const type       = isIncome ? 'ENTRADA' : 'SAIDA'

    // 9. Chama ALFREDO IA
    const extracted = await extractWithAI(text, imageBase64, mimeType, type)

    // 10. Verifica duplicata por ID de transação
    let duplicateOf: string | null = null
    if (extracted.transactionId) {
      const dup = await prisma.fastEntryDraft.findFirst({
        where: { extractedTransactionId: extracted.transactionId, status: { not: 'REJECTED' } },
        select: { id: true },
      })
      if (dup) duplicateOf = dup.id
    }

    // 11. Resolve o userId do admin para atribuir o draft
    const adminUserId = process.env.ALFREDO_ADMIN_USER_ID
    let   createdById = adminUserId ?? ''
    if (!createdById) {
      const admin = await prisma.user.findFirst({
        where: { role: { in: ['ADMIN', 'FINANCE'] }, status: 'ACTIVE' },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
      createdById = admin?.id ?? ''
    }

    if (!createdById) {
      await sendWhatsAppReply(senderPhone, '❌ ALFREDO IA: nenhum usuário ADMIN/FINANCE encontrado no sistema para receber o lançamento.')
      return NextResponse.json({ ok: false, reason: 'no admin user' })
    }

    // 12. Cria o FastEntryDraft
    const draft = await prisma.fastEntryDraft.create({
      data: {
        type:                    type as 'ENTRADA' | 'SAIDA',
        status:                  duplicateOf ? 'DUPLICATE' : 'PENDING',
        rawText:                 text ?? `[imagem de ${senderName}]`,
        hadImage:                !!imageBase64,
        source:                  'WHATSAPP',
        waMessageId:             messageId ?? null,
        waSender:                senderPhone,
        waSenderName:            senderName,
        extractedAmount:         extracted.amount ?? undefined,
        extractedCurrency:       extracted.currency ?? 'BRL',
        extractedDate:           extracted.date ? new Date(extracted.date) : undefined,
        extractedName:           extracted.name ?? senderName,
        extractedTransactionId:  extracted.transactionId ?? undefined,
        extractedCategory:       extracted.category ?? detectCategory(text ?? ''),
        extractedPaymentMethod:  extracted.paymentMethod ?? undefined,
        extractedDescription:    extracted.description ?? undefined,
        aiConfidence:            extracted.confidence ?? 0,
        duplicateOf,
        createdById,
      },
    })

    // 13. Responde no WhatsApp
    const brl     = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    const amount  = extracted.amount ? brl(extracted.amount) : 'valor não identificado'
    const cat     = extracted.category ?? 'Geral'
    const conf    = extracted.confidence ?? 0

    if (duplicateOf) {
      await sendWhatsAppReply(
        senderPhone,
        `⚠️ *ALFREDO IA — Possível Duplicata*\n\n` +
        `Este comprovante parece já ter sido registrado anteriormente (ID: ${duplicateOf}).\n\n` +
        `Acesse o ERP para verificar e confirmar manualmente:\n` +
        `📊 adsativos.com/dashboard/financeiro/alfredo-fast-entry`
      )
    } else {
      await sendWhatsAppReply(
        senderPhone,
        `✅ *ALFREDO IA — Comprovante Recebido!*\n\n` +
        `📋 *Rascunho criado:*\n` +
        `• Tipo: ${type === 'ENTRADA' ? '🟢 Entrada' : '🔴 Saída'}\n` +
        `• Valor: *${amount}*\n` +
        `• Categoria: ${cat}\n` +
        `• Confiança IA: ${conf}%\n\n` +
        `${conf < 60 ? '⚠️ Confiança baixa — revise antes de confirmar.\n\n' : ''}` +
        `🔍 *Revise e confirme no ERP:*\n` +
        `👉 adsativos.com/dashboard/financeiro/alfredo-fast-entry\n\n` +
        `_ID do rascunho: ${draft.id.slice(-8)}_`
      )
    }

    return NextResponse.json({ ok: true, draftId: draft.id, type, amount: extracted.amount })

  } catch (err) {
    console.error('[evolution/fast-entry] Erro:', err)
    return NextResponse.json({ ok: false, error: 'internal error' }, { status: 500 })
  }
}
