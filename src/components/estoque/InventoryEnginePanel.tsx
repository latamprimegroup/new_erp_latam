'use client'

import { useState } from 'react'

type Props = {
  salesToday: number
  stockByPlatform: Record<string, number>
  selectedIds: string[]
  onReload: () => void
}

const PLAT_BADGE: Record<string, string> = {
  META_ADS: 'bg-blue-600/90 text-white border-blue-400/50',
  GOOGLE_ADS: 'bg-gradient-to-r from-blue-500 via-red-500 to-yellow-400 text-white border-white/20',
  TIKTOK_ADS: 'bg-pink-600/90 text-white border-pink-300/50',
  KWAI_ADS: 'bg-orange-600/85 text-white border-orange-300/50',
  OTHER: 'bg-zinc-600 text-white border-zinc-400/40',
}

export function InventoryEnginePanel({ salesToday, stockByPlatform, selectedIds, onReload }: Props) {
  const [raw, setRaw] = useState('')
  const [markup, setMarkup] = useState('30')
  const [busy, setBusy] = useState(false)
  const [copyBusy, setCopyBusy] = useState(false)
  const [launchBusy, setLaunchBusy] = useState(false)
  const [copyResult, setCopyResult] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch('/api/estoque/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw,
          defaultMarkupPercent: parseFloat(markup.replace(',', '.')) || 30,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErr(data.error || 'Erro')
        return
      }
      setRaw('')
      alert(`Importadas: ${data.imported} conta(s).`)
      onReload()
    } finally {
      setBusy(false)
    }
  }

  async function handleCopyIa() {
    if (selectedIds.length === 0) {
      alert('Selecione ao menos uma conta na tabela.')
      return
    }
    setErr(null)
    setCopyBusy(true)
    setCopyResult(null)
    try {
      const res = await fetch('/api/estoque/copy-variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds: selectedIds }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErr(data.error || 'Erro')
        return
      }
      const blocks = (data.items as { sku: string; copies: string[] }[]).map((it) => {
        return `━━ ${it.sku} ━━\n${it.copies.map((c, i) => `--- Variação ${i + 1} ---\n${c}`).join('\n\n')}`
      })
      setCopyResult(blocks.join('\n\n'))
    } finally {
      setCopyBusy(false)
    }
  }

  async function handleCommunity(telegram: boolean) {
    if (selectedIds.length === 0) {
      alert('Selecione contas disponíveis (não vendidas).')
      return
    }
    setErr(null)
    setLaunchBusy(true)
    try {
      const res = await fetch('/api/estoque/community-launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountIds: selectedIds, sendTelegram: telegram }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErr(data.error || 'Erro')
        return
      }
      await navigator.clipboard.writeText(data.text)
      alert(
        telegram && data.telegramSent
          ? 'Texto copiado e enviado ao Telegram (chat configurado).'
          : 'Texto copiado para a área de transferência (WhatsApp / Telegram manual).'
      )
    } catch {
      setErr('Não foi possível copiar — permissão do navegador?')
    } finally {
      setLaunchBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-cyan-500/25 bg-[#09090b] text-zinc-100 p-4 sm:p-6 mb-8 shadow-[0_0_40px_rgba(34,211,238,0.06)]">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div>
          <h2 className="text-lg font-semibold text-cyan-300">Inventory Engine · Ads Ativos Core</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Importação em massa, precificação por margem, copy IA e disparo para comunidade. Custo e PIX do fornecedor
            permanecem apenas em rotas admin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stockByPlatform).map(([plat, n]) => (
            <span
              key={plat}
              className={`text-[11px] px-2 py-1 rounded-md border ${PLAT_BADGE[plat] || PLAT_BADGE.OTHER}`}
            >
              {plat.replace('_ADS', '')}: <strong>{n}</strong>
            </span>
          ))}
          <span className="text-[11px] px-2 py-1 rounded-md border border-emerald-500/40 bg-emerald-950/40 text-emerald-200">
            Vendas hoje: <strong>{salesToday}</strong>
          </span>
        </div>
      </div>

      {err && (
        <p className="mt-4 text-sm text-red-400 border border-red-500/30 rounded-lg px-3 py-2 bg-red-950/30">{err}</p>
      )}

      <form onSubmit={handleImport} className="mt-6 space-y-3">
        <label className="block text-xs text-zinc-400">Importação bulk (CSV / uma linha por ativo)</label>
        <p className="text-[11px] text-zinc-500">
          Colunas: <code className="text-cyan-500/90">plataforma,tipo,moeda,valor_spend,custo_brl</code>
          [, supplierId, ano, nicho, margem%]. Ex.:{' '}
          <code className="text-zinc-400">META_ADS,G2,USD,1500,4500,,2024,loja,35</code>
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={5}
          placeholder="META_ADS,G2,USD,1200,3800"
          className="w-full rounded-xl bg-zinc-950 border border-cyan-500/25 px-3 py-2 text-sm font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] text-zinc-500 block">Margem padrão (%)</label>
            <input
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              className="w-24 rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !raw.trim()}
            className="rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {busy ? 'Importando…' : 'Processar lote'}
          </button>
        </div>
      </form>

      <div className="mt-6 flex flex-col sm:flex-row flex-wrap gap-2">
        <button
          type="button"
          disabled={copyBusy || selectedIds.length === 0}
          onClick={handleCopyIa}
          className="rounded-lg border border-violet-500/50 text-violet-200 hover:bg-violet-950/40 px-4 py-2 text-sm disabled:opacity-40"
        >
          {copyBusy ? 'Gerando…' : 'Gerar 3 cópias (IA)'}
        </button>
        <button
          type="button"
          disabled={launchBusy || selectedIds.length === 0}
          onClick={() => handleCommunity(false)}
          className="rounded-lg border border-emerald-500/45 text-emerald-200 hover:bg-emerald-950/35 px-4 py-2 text-sm disabled:opacity-40"
        >
          {launchBusy ? '…' : 'Lançar na comunidade (copiar)'}
        </button>
        <button
          type="button"
          disabled={launchBusy || selectedIds.length === 0}
          onClick={() => handleCommunity(true)}
          className="rounded-lg bg-sky-700/80 hover:bg-sky-600 text-white px-4 py-2 text-sm disabled:opacity-40"
        >
          Telegram + copiar
        </button>
        <span className="text-[11px] text-zinc-500 self-center">
          {selectedIds.length} selecionada(s). Configure <code className="text-zinc-400">TELEGRAM_BOT_TOKEN</code> e{' '}
          <code className="text-zinc-400">TELEGRAM_COMMUNITY_CHAT_ID</code> para envio automático.
        </span>
      </div>

      {copyResult && (
        <div className="mt-4 rounded-xl border border-zinc-700 bg-black/40 p-3 max-h-80 overflow-auto">
          <pre className="text-[11px] text-zinc-300 whitespace-pre-wrap font-sans">{copyResult}</pre>
          <button
            type="button"
            className="mt-2 text-xs text-cyan-400 hover:underline"
            onClick={() => navigator.clipboard.writeText(copyResult)}
          >
            Copiar tudo
          </button>
        </div>
      )}
    </div>
  )
}
