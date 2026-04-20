/**
 * Assistente contextual (Módulo 05) — OpenAI se OPENAI_API_KEY; senão FAQ curto.
 */

const FAQ: Array<{ k: string[]; a: string }> = [
  {
    k: ['domínio', 'uni', 'primary'],
    a: 'O domínio da UNI é configurado pela equipa em `primary_domain_host` e apontado no DNS para o nosso edge. Para alterar, abre um ticket Concierge → Infra com o nome da UNI (ex.: UNI-04) e o domínio desejado.',
  },
  {
    k: ['vsl', 'vídeo', 'pitch'],
    a: 'VSL: usa o Pitch Watch no Creative Vault para registar drop-off e pedir ajuste. Garante que o tráfego passa pelo /pay blindado para manter gclid e UTMs.',
  },
  {
    k: ['contingência', 'conta caiu', 'ban', 'suspens'],
    a: 'Conta suspensa: abre Reposição (RMA) com print e usa o botão Concierge → Contingência para prioridade. Evita criar campanhas novas até o diagnóstico.',
  },
  {
    k: ['postback', 's2s', 'kiwify', 'hotmart'],
    a: 'Postback: no Shield & Tracker copia a URL do webhook único e cola na plataforma. Testa com «Simular venda». O checkout deve receber gclid (túnel do /pay).',
  },
  {
    k: ['blindagem', 'shield', 'tracker'],
    a: 'Blindagem: gera o link no módulo Shield & Tracker com a tua UNI. Usa a URL final com ValueTrack no Google Ads. Perfil SAFE vs MONEY indica ao edge o contexto.',
  },
]

function fallbackAnswer(question: string): { message: string; suggestEscalation: boolean } {
  const q = question.toLowerCase()
  for (const row of FAQ) {
    if (row.k.some((w) => q.includes(w))) {
      return { message: row.a, suggestEscalation: false }
    }
  }
  return {
    message:
      'Não encontrei uma resposta automática para isso. Usa o Suporte VIP (canto inferior) ou abre ticket — um especialista humano responde com contexto.',
    suggestEscalation: true,
  }
}

export async function warRoomAlfredoReply(userMessage: string): Promise<{
  message: string
  suggestEscalation: boolean
}> {
  const trimmed = userMessage.trim().slice(0, 4000)
  if (!trimmed) {
    return { message: 'Escreve a tua dúvida em uma frase.', suggestEscalation: false }
  }

  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    return fallbackAnswer(trimmed)
  }

  const system = `És o Alfredo, assistente da metodologia Ads Ativos (mentoria premium). Responde em português de Portugal/Brasil, tom profissional e direto, máximo 120 palavras.
Áreas: Google Ads, UNI/identidade, proxies, domínios, Shield & Tracker, postback S2S, VSL, contingência de contas, Creative Vault.
Nunca prometas resultados financeiros. Se a pergunta exigir acesso à conta ou decisão operacional sensível, termina com uma linha a sugerir contacto humano via Concierge.
Não inventes APIs internas; se não souberes, diz para abrir ticket.`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_WAR_ROOM_MODEL?.trim() || 'gpt-4o-mini',
        temperature: 0.35,
        max_tokens: 400,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: trimmed },
        ],
      }),
    })
    if (!res.ok) {
      const t = await res.text()
      console.error('[war-room-alfredo]', res.status, t.slice(0, 200))
      return fallbackAnswer(trimmed)
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) return fallbackAnswer(trimmed)
    const suggestEscalation =
      /humano|especialista|ticket|suporte|não (tenho|consigo)|contacta/i.test(text) ||
      /humano|ticket|especialista/i.test(trimmed)
    return { message: text, suggestEscalation }
  } catch (e) {
    console.error('[war-room-alfredo]', e)
    return fallbackAnswer(trimmed)
  }
}
