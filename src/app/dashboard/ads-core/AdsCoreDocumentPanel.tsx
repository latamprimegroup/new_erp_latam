'use client'

import { useState, useEffect } from 'react'
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Layers,
  Copy,
  Check,
  Download,
  Loader2,
} from 'lucide-react'

type DocTab = 'cnpj' | 'rg-frente' | 'rg-verso' | 'briefing'

export type AdsCoreCompareField = { label: string; value: string }

type Props = {
  assetId: string
  nicheName: string
  briefingInstructions: string | null
  hasDocCnpj: boolean
  hasDocRgFrente: boolean
  hasDocRgVerso: boolean
  compareFields?: AdsCoreCompareField[]
  /** Modo fábrica produtor: sem botão de download (visualização só no ERP) */
  hideDownload?: boolean
  /** Registra troca de aba em audit_logs (Bloco 5) */
  auditTabInteractions?: boolean
}

function parseFilenameFromCd(cd: string | null): string | null {
  if (!cd) return null
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd)
  return m ? decodeURIComponent(m[1].trim()) : null
}

export function AdsCoreDocumentPanel({
  assetId,
  nicheName,
  briefingInstructions,
  hasDocCnpj,
  hasDocRgFrente,
  hasDocRgVerso,
  compareFields = [],
  hideDownload = false,
  auditTabInteractions = true,
}: Props) {
  const [tab, setTab] = useState<DocTab>('cnpj')
  const [scale, setScale] = useState(1)
  const [rotate, setRotate] = useState(0)
  const [showCompare, setShowCompare] = useState(false)
  const [briefCopied, setBriefCopied] = useState(false)
  const [viewerUrl, setViewerUrl] = useState('')
  const [viewerLoading, setViewerLoading] = useState(false)
  const [viewerError, setViewerError] = useState('')
  const [downloading, setDownloading] = useState(false)

  const has = {
    cnpj: hasDocCnpj,
    'rg-frente': hasDocRgFrente,
    'rg-verso': hasDocRgVerso,
  } as const

  const docKind = tab === 'briefing' ? null : tab
  const showDoc = tab !== 'briefing'
  const docAvailable = docKind ? has[docKind] : false
  const canCompare = compareFields.some((f) => f.value.trim().length > 0)
  const isPdfView = !!(viewerUrl && /\.pdf(\?|$)/i.test(viewerUrl))

  useEffect(() => {
    if (!docKind || !docAvailable) {
      setViewerUrl('')
      setViewerError('')
      setViewerLoading(false)
      return
    }
    let cancelled = false
    setViewerLoading(true)
    setViewerError('')
    setViewerUrl('')
    fetch(`/api/ads-core/assets/${assetId}/document/${docKind}/url`, { credentials: 'include' })
      .then(async (res) => {
        const j = (await res.json()) as { url?: string; error?: string }
        if (!res.ok) throw new Error(j.error || 'Não foi possível obter URL de visualização')
        if (!j.url) throw new Error('Resposta inválida')
        if (!cancelled) setViewerUrl(j.url)
      })
      .catch((e: Error) => {
        if (!cancelled) setViewerError(e.message || 'Erro ao carregar documento')
      })
      .finally(() => {
        if (!cancelled) setViewerLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [assetId, docKind, docAvailable])

  function resetView() {
    setScale(1)
    setRotate(0)
  }

  function goTab(next: DocTab) {
    setTab(next)
    if (next !== 'briefing') resetView()
    if (auditTabInteractions) {
      const documentTab = next
      void fetch(`/api/ads-core/assets/${assetId}/audit-interaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ documentTab }),
      }).catch(() => {})
    }
  }

  async function copyBriefing() {
    const t = briefingInstructions?.trim() || ''
    if (!t) return
    try {
      await fetch(`/api/ads-core/assets/${assetId}/audit-copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'briefingInstructions' }),
      })
    } catch {
      /* auditoria best-effort */
    }
    try {
      await navigator.clipboard.writeText(t)
      setBriefCopied(true)
      window.setTimeout(() => setBriefCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  async function secureDownload() {
    if (!docKind || !docAvailable) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/ads-core/assets/${assetId}/document/${docKind}/download`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        alert(j.error || 'Download não autorizado')
        return
      }
      const blob = await res.blob()
      const fname =
        parseFilenameFromCd(res.headers.get('Content-Disposition')) ||
        (docKind === 'cnpj' ? 'cartao-cnpj.pdf' : `${docKind}.jpg`)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = fname
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      alert('Falha no download seguro')
    } finally {
      setDownloading(false)
    }
  }

  const viewerPad = hideDownload ? '' : 'pr-14'
  const docFrameH = hideDownload ? 'min(88vh,900px)' : 'min(75vh,720px)'

  return (
    <div
      className={`flex flex-col h-full border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden bg-white dark:bg-ads-dark-card ${
        hideDownload ? 'min-h-0 flex-1 xl:min-h-[calc(100vh-12rem)]' : 'min-h-[min(78vh,820px)]'
      }`}
    >
      <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
        <button
          type="button"
          onClick={() => goTab('cnpj')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium ${
            tab === 'cnpj' ? 'bg-primary-500 text-white' : 'bg-gray-200 dark:bg-white/10 hover:opacity-90'
          } ${!hasDocCnpj ? 'opacity-50' : ''}`}
          disabled={!hasDocCnpj}
        >
          Cartão CNPJ
          {!hasDocCnpj && ' (sem arquivo)'}
        </button>
        <button
          type="button"
          onClick={() => goTab('rg-frente')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium ${
            tab === 'rg-frente' ? 'bg-primary-500 text-white' : 'bg-gray-200 dark:bg-white/10 hover:opacity-90'
          } ${!hasDocRgFrente ? 'opacity-50' : ''}`}
          disabled={!hasDocRgFrente}
        >
          RG Frente
          {!hasDocRgFrente && ' (sem arquivo)'}
        </button>
        <button
          type="button"
          onClick={() => goTab('rg-verso')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium ${
            tab === 'rg-verso' ? 'bg-primary-500 text-white' : 'bg-gray-200 dark:bg-white/10 hover:opacity-90'
          } ${!hasDocRgVerso ? 'opacity-50' : ''}`}
          disabled={!hasDocRgVerso}
        >
          RG Verso
          {!hasDocRgVerso && ' (sem arquivo)'}
        </button>
        <button
          type="button"
          onClick={() => goTab('briefing')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium ${
            tab === 'briefing' ? 'bg-primary-500 text-white' : 'bg-gray-200 dark:bg-white/10 hover:opacity-90'
          }`}
        >
          Briefing do Nicho
        </button>
      </div>

      <div
        className={`flex-1 overflow-auto bg-gray-100 dark:bg-black/20 flex items-center justify-center p-3 sm:p-4 relative ${
          hideDownload ? 'min-h-[min(88vh,920px)] xl:min-h-[calc(100vh-14rem)]' : 'min-h-[min(70vh,720px)]'
        }`}
      >
        {showDoc && canCompare && (
          <button
            type="button"
            className={`absolute top-3 right-3 z-20 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium shadow-md border border-gray-200 dark:border-white/15 ${
              showCompare ? 'bg-primary-500 text-white' : 'bg-white/95 dark:bg-ads-dark-card text-gray-800 dark:text-gray-100'
            }`}
            title="Sobrepor dados cadastrais para conferir com o documento"
            onClick={() => setShowCompare((v) => !v)}
          >
            <Layers className="w-3.5 h-3.5" />
            Comparar
          </button>
        )}

        {showDoc && docAvailable && !hideDownload && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5 p-1.5 rounded-xl bg-white/95 dark:bg-black/70 shadow-lg border border-gray-200 dark:border-white/10">
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-40"
              title="Download seguro (auditoria)"
              disabled={downloading || viewerLoading || !viewerUrl}
              onClick={() => void secureDownload()}
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
              title="Menos zoom"
              onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
              title="Mais zoom"
              onClick={() => setScale((s) => Math.min(3, s + 0.15))}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
              title="Girar 90°"
              onClick={() => setRotate((r) => (r + 90) % 360)}
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        )}

        {showDoc && docAvailable && hideDownload && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-row items-center gap-1 px-2 py-1.5 rounded-xl bg-zinc-900/92 dark:bg-black/85 text-white shadow-xl border border-white/15 backdrop-blur-sm"
            role="toolbar"
            aria-label="Ferramentas do documento"
          >
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-white/15"
              title="Menos zoom"
              onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-white/15"
              title="Mais zoom"
              onClick={() => setScale((s) => Math.min(3, s + 0.15))}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-2 rounded-lg hover:bg-white/15"
              title="Girar 90°"
              onClick={() => setRotate((r) => (r + 90) % 360)}
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        )}

        {tab === 'briefing' && (
          <div className="w-full max-w-xl text-left space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-gray-500">Nicho</p>
                <p className="text-sm font-semibold text-primary-600">{nicheName}</p>
              </div>
              <button
                type="button"
                disabled={!briefingInstructions?.trim()}
                onClick={() => void copyBriefing()}
                className="shrink-0 flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-200 dark:bg-white/10 hover:bg-primary-500/20 disabled:opacity-40"
              >
                {briefCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                Copiar briefing
              </button>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-ads-dark-card p-4 text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200 min-h-[200px]">
              {briefingInstructions?.trim() ? (
                briefingInstructions
              ) : (
                <span className="text-gray-500">Nenhuma instrução cadastrada para este nicho.</span>
              )}
            </div>
          </div>
        )}

        {showDoc && !docAvailable && (
          <p className="text-sm text-gray-500">Nenhum documento nesta aba.</p>
        )}

        {showDoc && docAvailable && viewerLoading && (
          <div className="flex flex-col items-center gap-2 text-gray-500 text-sm">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            <p>Preparando visualização segura…</p>
          </div>
        )}

        {showDoc && docAvailable && !viewerLoading && viewerError && (
          <div className="text-center text-sm text-amber-800 dark:text-amber-200 max-w-sm">
            <p>{viewerError}</p>
            <button
              type="button"
              className="mt-2 text-xs underline text-primary-600"
              onClick={() => {
                if (!docKind) return
                setViewerLoading(true)
                setViewerError('')
                fetch(`/api/ads-core/assets/${assetId}/document/${docKind}/url`, { credentials: 'include' })
                  .then(async (res) => {
                    const j = (await res.json()) as { url?: string; error?: string }
                    if (!res.ok) throw new Error(j.error || 'Erro')
                    if (!j.url) throw new Error('Resposta inválida')
                    setViewerUrl(j.url)
                  })
                  .catch((e: Error) => setViewerError(e.message))
                  .finally(() => setViewerLoading(false))
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {showDoc && docAvailable && !viewerLoading && !viewerError && viewerUrl && isPdfView && (
          <div className={`relative w-full max-w-full flex flex-col items-center gap-2 ${viewerPad}`}>
            <div
              className="w-full origin-center"
              style={{
                transform: `scale(${scale}) rotate(${rotate}deg)`,
                transition: 'transform 0.2s ease',
              }}
            >
              <iframe
                key={viewerUrl}
                title="Documento PDF"
                src={viewerUrl}
                className="w-full rounded border-0 bg-white shadow-sm"
                style={{ height: `clamp(360px, ${docFrameH}, 920px)` }}
                loading="lazy"
              />
            </div>
            {showCompare && canCompare && (
              <div className="w-full max-w-lg rounded-lg bg-black/80 text-white text-[11px] p-3 space-y-1.5 shadow-lg border border-white/10">
                <p className="font-semibold text-primary-200 text-xs mb-1">Dados no sistema (conferir com o PDF)</p>
                {compareFields
                  .filter((f) => f.value.trim())
                  .map((f) => (
                    <div key={f.label}>
                      <span className="text-gray-400">{f.label}:</span>{' '}
                      <span className="break-words">{f.value}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {showDoc && docAvailable && !viewerLoading && !viewerError && viewerUrl && !isPdfView && (
          <div className={`relative inline-block max-w-full ${viewerPad}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={viewerUrl}
              src={viewerUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="max-w-full object-contain shadow-md rounded block"
              style={{
                maxHeight: `clamp(360px, ${docFrameH}, 920px)`,
                transform: `scale(${scale}) rotate(${rotate}deg)`,
                transition: 'transform 0.2s ease',
              }}
            />
            {showCompare && canCompare && (
              <div className="pointer-events-none absolute left-2 bottom-2 right-2 max-h-[45%] overflow-y-auto rounded-md bg-black/78 text-white text-[10px] p-2.5 space-y-1 shadow-lg border border-white/15">
                <p className="font-semibold text-primary-200 text-[10px] mb-0.5">Referência (cadastro)</p>
                {compareFields
                  .filter((f) => f.value.trim())
                  .map((f) => (
                    <div key={f.label}>
                      <span className="text-gray-400">{f.label}:</span>{' '}
                      <span className="break-words">{f.value}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
