/**
 * Ads Ativos Guard — análise híbrida (Camada A: blacklist, Camada B: OpenAI).
 * Score de segurança 0–100 (maior = mais conforme). scoreRisco = 100 - segurança.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type GuardMediaType = 'COPY' | 'LP' | 'VSL'

export type GuardScanResult = {
  safetyScore: number
  riskScore: number
  level: 'critical' | 'warning' | 'safe'
  blacklistHits: string[]
  violatedTerms: string[]
  rewriteSuggestions: Array<{ from: string; to: string }>
  summary: string
  layers: {
    blacklist: { hits: string[]; penalty: number }
    ai: {
      safetyScore: number
      violatedTerms: string[]
      rewriteSuggestions: Array<{ from: string; to: string }>
      summary?: string
      raw?: unknown
    }
  }
}

const SAFETY_CRITICAL_MAX = 39
const SAFETY_WARNING_MAX = 75

function levelFromSafety(s: number): GuardScanResult['level'] {
  if (s <= SAFETY_CRITICAL_MAX) return 'critical'
  if (s <= SAFETY_WARNING_MAX) return 'warning'
  return 'safe'
}

export async function loadActiveBlacklistTerms(): Promise<string[]> {
  const rows = await prisma.blacklistTerm.findMany({
    where: { active: true },
    select: { term: true },
  })
  return rows.map((r) => r.term.trim()).filter(Boolean)
}

export function matchBlacklist(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase()
  const hits: string[] = []
  for (const t of terms) {
    const needle = t.toLowerCase()
    if (needle.length < 2) continue
    if (lower.includes(needle)) hits.push(t)
  }
  return hits
}

/** Camada B — JSON com safetyScore 0-100 (100 = totalmente conforme Google Ads). */
export async function scanSemanticLayer(text: string): Promise<NonNullable<GuardScanResult['layers']['ai']>> {
  const key = process.env.OPENAI_API_KEY?.trim()
  const model = process.env.OPENAI_COMPLIANCE_MODEL?.trim() || 'gpt-4o-mini'
  const trimmed = text.trim().slice(0, 14_000)

  if (!trimmed) {
    return {
      safetyScore: 50,
      violatedTerms: [],
      rewriteSuggestions: [],
      summary: 'Texto vazio.',
    }
  }

  if (!key) {
    return {
      safetyScore: 55,
      violatedTerms: [],
      rewriteSuggestions: [],
      summary: 'OPENAI_API_KEY ausente — score neutro.',
      raw: { note: 'OPENAI_API_KEY ausente — score neutro.' },
    }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `És um Revisor Sênior de Compliance para Google Ads (políticas de práticas enganosas, saúde, conteúdo sensível).
Responde APENAS um JSON válido com o formato:
{"safetyScore": número inteiro de 0 a 100 (100 = copy totalmente alinhada às políticas; 0 = violação grave ou bloqueio provável),
"violatedTerms": [ "trechos ou padrões problemáticos" ],
"rewriteSuggestions": [ {"from": "texto original agressivo", "to": "alternativa mais segura (grey/white)"} ],
"summary": "uma frase em pt-BR" }`,
        },
        { role: 'user', content: trimmed },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return {
      safetyScore: 50,
      violatedTerms: [],
      rewriteSuggestions: [],
      summary: `Falha OpenAI: ${err.slice(0, 200)}`,
      raw: { error: err.slice(0, 300) },
    }
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    return { safetyScore: 50, violatedTerms: [], rewriteSuggestions: [], summary: 'Resposta vazia.' }
  }

  try {
    const parsed = JSON.parse(content) as {
      safetyScore?: number
      violatedTerms?: string[]
      rewriteSuggestions?: Array<{ from?: string; to?: string }>
      summary?: string
    }
    const safetyScore = Math.min(100, Math.max(0, Number(parsed.safetyScore ?? 50)))
    const violatedTerms = Array.isArray(parsed.violatedTerms)
      ? parsed.violatedTerms.map((x) => String(x).slice(0, 500))
      : []
    const rewriteSuggestions = Array.isArray(parsed.rewriteSuggestions)
      ? parsed.rewriteSuggestions
          .filter((x) => x && (x.from || x.to))
          .map((x) => ({ from: String(x.from ?? '').slice(0, 400), to: String(x.to ?? '').slice(0, 400) }))
      : []
    return {
      safetyScore,
      violatedTerms,
      rewriteSuggestions,
      summary: String(parsed.summary ?? '').slice(0, 500),
      raw: parsed,
    }
  } catch {
    return {
      safetyScore: 50,
      violatedTerms: [],
      rewriteSuggestions: [],
      summary: 'JSON inválido da IA.',
      raw: { parseError: true },
    }
  }
}

/** Penalidade por cada termo da blacklist (Camada A). */
const PENALTY_PER_HIT = 14

export async function runGuardComplianceScan(params: {
  text: string
  tipoMidia: GuardMediaType
  stockAccountId?: string | null
  persistHistory?: boolean
}): Promise<GuardScanResult> {
  const terms = await loadActiveBlacklistTerms()
  const hits = matchBlacklist(params.text, terms)
  const penalty = Math.min(75, hits.length * PENALTY_PER_HIT)

  const ai = await scanSemanticLayer(params.text)
  let safetyScore = Math.max(0, ai.safetyScore - penalty)

  const riskScore = 100 - safetyScore
  const result: GuardScanResult = {
    safetyScore,
    riskScore,
    level: levelFromSafety(safetyScore),
    blacklistHits: hits,
    violatedTerms: [...new Set([...hits, ...ai.violatedTerms])],
    rewriteSuggestions: ai.rewriteSuggestions,
    summary:
      ai.summary?.trim() ||
      (hits.length ? `Blacklist: ${hits.length} termo(s). Score ajustado.` : 'Análise semântica concluída.'),
    layers: {
      blacklist: { hits, penalty },
      ai,
    },
  }

  if (params.persistHistory !== false) {
    await prisma.complianceHistory.create({
      data: {
        tipoMidia: params.tipoMidia,
        scoreRisco: riskScore,
        termosDetectados: result.violatedTerms as Prisma.InputJsonValue,
        statusFinalGoogle: null,
        summary: result.summary.slice(0, 2000),
        suggestedRewrites: result.rewriteSuggestions as Prisma.InputJsonValue,
        layers: result.layers as Prisma.InputJsonValue,
        stockAccountId: params.stockAccountId ?? null,
      },
    })
  }

  return result
}
