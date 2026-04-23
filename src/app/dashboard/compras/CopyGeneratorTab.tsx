'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, Copy, CheckCheck, Zap, Loader2, ExternalLink } from 'lucide-react'

type AssetSpecs = {
  year?: number; paymentType?: string; verificacao?: boolean; docStatus?: string
  spendBRL?: number; spendUSD?: number; spendClass?: string; nicho?: string
  faturamento?: string; authorityTag?: string; platform?: string
}

type Asset = {
  id: string; adsId: string; category: string; subCategory: string | null
  status: string; salePrice: number; displayName: string; description: string | null
  tags: string | null; specs?: AssetSpecs | null
}

const CATEGORY_EMOJI: Record<string, string> = {
  CONTAS: '💳', PERFIS: '👤', BM: '🏢', PROXIES: '🌐',
  SOFTWARE: '💻', INFRA: '⚙️', HARDWARE: '🖥️', OUTROS: '📦',
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const WA_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '5511999999999'

function buildWarRoomCopy(asset: Asset, extra: string): string {
  const s = asset.specs ?? {}
  const fonte   = asset.subCategory ?? asset.category
  const nicho   = s.authorityTag ?? s.nicho ?? (asset.tags?.split(',')[0]?.trim() ?? 'Multi-nicho')
  const gastos  = s.spendBRL
    ? s.spendBRL >= 1000 ? `+${Math.round(s.spendBRL / 1000)}k BRL` : `R$${s.spendBRL}`
    : s.spendUSD ? `$${s.spendUSD}k USD` : 'Consultar'
  const ano     = s.year ? String(s.year) : 'Consultar'
  const pag     = s.paymentType ?? 'Consultar'
  const verif   = s.verificacao ? 'OK' : 'Consultar'
  const fat     = s.faturamento ?? 'OK'
  const waLink  = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`ID: ${asset.adsId}`)}`
  const obsLine = extra ? `\n📌 *OBS:* ${extra}` : ''

  return `🛡️ CONTA GOOGLE ADS COM GASTOS - ADS ATIVOS
⚡ ID DA CONTA: ${asset.adsId}
🧬 DNA / FONTE: ${fonte} (Nicho: ${nicho})
💰 GASTOS: ${gastos}
🍷 ANO: ${ano}
✅ STATUS: EM OPERAÇÃO (AQUECIDA)
✅ NICHO: ${nicho}
✅ ANO: ${ano}
✅ FATURAMENTO: ${fat}
✅ PAG: ${pag}
⚙️ PAGAMENTO: ${pag} | VERIFICAÇÃO: ${verif}${obsLine}
👉 CONSULTAR VALOR: ${waLink}`
}

function buildCopy(asset: Asset, template: string, extra: string): string {
  const tags = asset.tags ? asset.tags.split(',').map((t) => `#${t.trim().replace(/\s+/g,'')}`) : []
  const tagsLine = tags.length ? `\n${tags.join(' ')}` : ''

  if (template === 'war-room') return buildWarRoomCopy(asset, extra)

  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`ID: ${asset.adsId}`)}`

  if (template === 'standard') {
    return `📢 *NOVIDADE NO ESTOQUE ADS ATIVOS*

🆔 *ID:* \`${asset.adsId}\`
${CATEGORY_EMOJI[asset.category] ?? '📦'} *Tipo:* ${asset.category}${asset.subCategory ? ` — ${asset.subCategory}` : ''}
🏷️ *Nome:* ${asset.displayName}
📝 *Descrição:* ${asset.description ?? 'Ativo premium com qualidade garantida'}
📦 *Disponibilidade:* Pronta Entrega
💰 *Valor:* ${brl(asset.salePrice)}
${extra ? `\n📌 ${extra}\n` : ''}
👉 CONSULTAR: ${waLink}${tagsLine}`
  }

  if (template === 'telegram') {
    return `🚀 *ATIVO EXCLUSIVO ADS ATIVOS — ${asset.adsId}*

🔹 *TIPO:* ${asset.category}
🔹 *DESCRIÇÃO:* ${asset.displayName}
🔹 *ESPECIFICAÇÃO:* ${asset.description ?? 'Alta performance e qualidade certificada'}
💰 *VALOR:* ${brl(asset.salePrice)}
${extra ? `📌 ${extra}` : ''}

✅ Pronta entrega | Suporte 24h
👉 ${waLink}${tagsLine}`
  }

  // template === 'vip'
  return `━━━━━━━━━━━━━━━━━━━━
🥇 *ASSET VIP — ADS ATIVOS*
━━━━━━━━━━━━━━━━━━━━

🆔 \`${asset.adsId}\`
🏷️ ${asset.displayName}

${CATEGORY_EMOJI[asset.category] ?? '📦'} *Categoria:* ${asset.category}
📝 *Specs:* ${asset.description ?? 'Premium — testado e aprovado pela equipe Ads Ativos'}
${extra ? `📌 *Obs:* ${extra}` : ''}

💰 *Investimento:* ${brl(asset.salePrice)}

_Estoque limitado._
👉 ${waLink}${tagsLine}`
}

export function CopyGeneratorTab() {
  const [assets, setAssets]         = useState<Asset[]>([])
  const [loading, setLoading]       = useState(false)
  const [q, setQ]                   = useState('')
  const [selected, setSelected]     = useState<Asset | null>(null)
  const [template, setTemplate]     = useState<'war-room' | 'standard' | 'telegram' | 'vip'>('war-room')
  const [extra, setExtra]           = useState('')
  const [copied, setCopied]         = useState(false)
  const textareaRef                 = useRef<HTMLTextAreaElement>(null)

  // ── Catálogo em Massa ───────────────────────────────────────────────────
  const [bulkLoading, setBulkLoading]   = useState(false)
  const [bulkText, setBulkText]         = useState('')
  const [bulkTemplate, setBulkTemplate] = useState<'fire' | 'pro' | 'minimal' | 'vip'>('fire')
  const [bulkCount, setBulkCount]       = useState(0)
  const [bulkCopied, setBulkCopied]     = useState(false)
  const [showBulk, setShowBulk]         = useState(false)

  const generateBulkCatalog = async () => {
    setBulkLoading(true); setBulkText('')
    const p = new URLSearchParams({ format: 'telegram', template: bulkTemplate, status: 'AVAILABLE' })
    const r = await fetch(`/api/compras/ativos/catalogo?${p}`)
    if (r.ok) {
      setBulkText(await r.text())
      setBulkCount(parseInt(r.headers.get('X-Asset-Count') ?? '0', 10))
    }
    setBulkLoading(false)
  }

  const copyBulk = async () => {
    await navigator.clipboard.writeText(bulkText)
    setBulkCopied(true); setTimeout(() => setBulkCopied(false), 3000)
  }

  const search = useCallback(async (query: string) => {
    if (!query.trim() && query.length < 2) { setAssets([]); return }
    setLoading(true)
    const r = await fetch(`/api/compras/ativos?q=${encodeURIComponent(query)}&status=AVAILABLE&limit=10`)
    if (r.ok) { const j = await r.json(); setAssets(j.assets ?? []) }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => search(q), 350)
    return () => clearTimeout(timer)
  }, [q, search])

  const copy = async () => {
    if (!selected) return
    const text = buildCopy(selected, template, extra)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  const copyText = selected ? buildCopy(selected, template, extra) : ''

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
        <Zap className="w-4 h-4 shrink-0 mt-0.5" />
        <span>O <strong>Copy Generator</strong> usa apenas dados comerciais + <strong>Authority Tags</strong> (ex: "Autoridade Real Estate" em vez de "Imobiliária"). Fornecedor nunca exposto.</span>
      </div>

      {/* ── Catálogo em Massa ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-primary-200 bg-primary-50 dark:bg-primary-950/10 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-sm flex items-center gap-2">🚀 Gerar Catálogo do Dia em Massa</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Todos os ativos disponíveis com Authority Tags — pronto para Telegram/WhatsApp</p>
          </div>
          <button onClick={() => setShowBulk((v) => !v)} className="text-xs text-primary-600 hover:underline font-semibold">
            {showBulk ? '▲ Ocultar' : '▼ Expandir'}
          </button>
        </div>

        {showBulk && (
          <>
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-xs font-semibold">Template:</label>
              {(['fire', 'pro', 'minimal', 'vip'] as const).map((t) => (
                <button key={t} onClick={() => setBulkTemplate(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${bulkTemplate === t ? 'bg-primary-600 text-white border-primary-600' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}>
                  {t === 'fire' ? '🔥 Fire' : t === 'pro' ? '📋 Pro' : t === 'minimal' ? '⚡ Minimal' : '💎 VIP'}
                </button>
              ))}
            </div>

            <button onClick={generateBulkCatalog} disabled={bulkLoading}
              className="w-full py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
              {bulkLoading ? <><Loader2 className="w-4 h-4 animate-spin" />Gerando catálogo...</> : '⚡ Gerar Catálogo Agora'}
            </button>

            {bulkText && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">{bulkCount} ativo(s) no catálogo</span>
                  <button onClick={copyBulk} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-bold text-xs transition-colors ${bulkCopied ? 'bg-green-600 text-white' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                    {bulkCopied ? <><CheckCheck className="w-3.5 h-3.5" />Copiado!</> : <><Copy className="w-3.5 h-3.5" />Copiar Tudo</>}
                  </button>
                </div>
                <textarea readOnly value={bulkText}
                  className="w-full h-56 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs font-mono resize-none focus:outline-none" />
                <p className="text-[10px] text-green-600">✅ Nenhum preço, custo, nicho original ou fornecedor incluído — 100% seguro para distribuição.</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Lado esquerdo — seleção */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Buscar Ativo Disponível</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="ID (AA-CONT-000001) ou nome..."
                className="input-field pl-8 py-2" />
            </div>
          </div>

          {loading && <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-zinc-400" /></div>}

          {assets.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {assets.map((a) => (
                <button key={a.id} onClick={() => setSelected(a)}
                  className={`w-full text-left rounded-xl border p-3 transition-all ${selected?.id === a.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary-600">{a.adsId}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">{a.category}</span>
                  </div>
                  <p className="text-sm font-medium mt-0.5 truncate">{a.displayName}</p>
                  <p className="text-xs text-zinc-500">{a.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                </button>
              ))}
            </div>
          )}

          {/* Template */}
          {selected && (
            <div>
              <label className="block text-xs font-semibold mb-2">Modelo de Copy</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'war-room', label: '🛡️ War Room VIP' },
                  { id: 'standard', label: '📣 Padrão' },
                  { id: 'telegram', label: '✈️ Telegram' },
                  { id: 'vip',      label: '🥇 VIP Clássico' },
                ] as const).map((t) => (
                  <button key={t.id} onClick={() => setTemplate(t.id)}
                    className={`py-2 rounded-xl border text-xs font-semibold transition-colors ${template === t.id ? 'bg-primary-600 text-white border-primary-600' : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              {template === 'war-room' && selected && (
                <div className="mt-2 rounded-lg border border-primary-200 bg-primary-50 dark:bg-primary-950/10 p-2 text-[10px] text-primary-700 dark:text-primary-300 space-y-1">
                  <p>🛡️ Formato canônico War Room OS com link WhatsApp injetado</p>
                  <a
                    href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`ID: ${selected.adsId}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 font-semibold underline">
                    <ExternalLink className="w-3 h-3" />
                    Testar link WhatsApp para {selected.adsId}
                  </a>
                </div>
              )}
            </div>
          )}

          {selected && (
            <div>
              <label className="block text-xs font-semibold mb-1">Observação adicional (opcional)</label>
              <input value={extra} onChange={(e) => setExtra(e.target.value)}
                placeholder="Ex: Proxy dedicado incluso | Suporte 30 dias"
                className="input-field" />
            </div>
          )}
        </div>

        {/* Lado direito — preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold">Preview da Copy</label>
            {selected && (
              <button onClick={copy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                {copied ? <><CheckCheck className="w-3.5 h-3.5" />Copiado!</> : <><Copy className="w-3.5 h-3.5" />Copiar</>}
              </button>
            )}
          </div>

          <textarea ref={textareaRef} readOnly value={copyText || 'Selecione um ativo para visualizar...'}
            className="w-full h-96 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-4 text-sm font-mono resize-none focus:outline-none"
          />

          {selected && (
            <div className="flex gap-2">
              <button onClick={copy} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-primary-600 hover:bg-primary-700 text-white'}`}>
                {copied ? <><CheckCheck className="w-4 h-4" />Copiado para Área de Transferência!</> : <><Copy className="w-4 h-4" />Copiar para Área de Transferência</>}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
