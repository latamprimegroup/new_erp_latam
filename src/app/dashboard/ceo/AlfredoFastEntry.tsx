'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Zap, Upload, FileText, CheckCircle2, XCircle, AlertTriangle,
  Loader2, RotateCcw, TrendingUp, TrendingDown, Copy, Clock,
  Image as ImageIcon, MessageSquare, ChevronDown, ChevronRight,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────
type EntryType = 'ENTRADA' | 'SAIDA'

type Draft = {
  id: string; type: EntryType; status: string
  extractedAmount: number | null; extractedCurrency: string | null
  extractedDate: string | null; extractedName: string | null
  extractedTransactionId: string | null; extractedCategory: string | null
  extractedPaymentMethod: string | null; extractedDescription: string | null
  aiConfidence: number; hadImage: boolean; rawText: string | null
  confirmedAmount: number | null; confirmedCategory: string | null
  createdEntryId: string | null; duplicateOf: string | null
  createdAt: string; createdBy: { name: string | null }
}

type ExtractedData = {
  amount: number | null; currency: string; date: string | null
  name: string | null; transactionId: string | null
  paymentMethod: string; category: string | null; description: string
  confidence: number; isIncome: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────
const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const CATEGORIES = [
  'Custo de Ativos', 'Infraestrutura', 'Recursos Humanos', 'Impostos',
  'Comissões', 'Mídia Paga', 'Software/SaaS', 'Recebível', 'Geral',
]

const PAY_METHODS = ['PIX', 'TED', 'DOC', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'CASH', 'CRIPTO', 'OUTRO']

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING:   { label: 'Pendente',   color: 'text-amber-600',  icon: <Clock className="w-3 h-3" />        },
  CONFIRMED: { label: 'Confirmado', color: 'text-green-600',  icon: <CheckCircle2 className="w-3 h-3" /> },
  REJECTED:  { label: 'Rejeitado',  color: 'text-zinc-400',   icon: <XCircle className="w-3 h-3" />      },
  DUPLICATE: { label: 'Duplicata',  color: 'text-red-600',    icon: <AlertTriangle className="w-3 h-3" />},
}

// ─────────────────────────────────────────────────────────────────────────────
// Barra de confiança da IA
// ─────────────────────────────────────────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 50 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-bold text-zinc-400">{value}%</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Card de Confirmação
// ─────────────────────────────────────────────────────────────────────────────
function ConfirmCard({
  draft, extracted, onConfirm, onReject, loading,
}: {
  draft: Draft; extracted: ExtractedData; onConfirm: (data: ConfirmPayload) => void
  onReject: () => void; loading: boolean
}) {
  const [amount,   setAmount]   = useState(String(extracted.amount ?? ''))
  const [date,     setDate]     = useState(extracted.date ? new Date(extracted.date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16))
  const [name,     setName]     = useState(extracted.name ?? '')
  const [category, setCategory] = useState(extracted.category ?? 'Geral')
  const [notes,    setNotes]    = useState('')

  const isDuplicate = draft.status === 'DUPLICATE'

  return (
    <div className={`rounded-2xl border-2 ${isDuplicate ? 'border-red-300 bg-red-50 dark:bg-red-950/10' : 'border-primary-200 bg-primary-50/40 dark:bg-primary-950/10'} p-4 space-y-3`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${draft.type === 'ENTRADA' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
            {draft.type === 'ENTRADA' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          </span>
          <div>
            <p className="font-bold text-sm">ALFREDO identificou {draft.type === 'ENTRADA' ? 'Recebimento' : 'Despesa'}</p>
            <ConfidenceBar value={draft.aiConfidence} />
          </div>
        </div>
        {isDuplicate && (
          <span className="px-2 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-bold flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />Transação Duplicada
          </span>
        )}
      </div>

      {isDuplicate ? (
        <div className="text-sm text-red-700 font-semibold py-2">
          ⛔ ID de transação <code className="bg-red-100 px-1 rounded text-xs">{draft.extractedTransactionId}</code> já foi lançado anteriormente. Descarte para não duplicar o caixa.
        </div>
      ) : (
        <>
          {/* Dados extraídos — editáveis */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-zinc-500 block mb-1">Valor (R$)</label>
              <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="input-field text-xl font-black" />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 block mb-1">Data / Hora</label>
              <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 block mb-1">{draft.type === 'ENTRADA' ? 'Cliente / Origem' : 'Fornecedor / Destino'}</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome..." className="input-field text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold text-zinc-500 block mb-1">Categoria</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field text-sm">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações (opcional)..."
            rows={2} className="input-field text-sm resize-none w-full" />

          {/* TX ID detectado */}
          {draft.extractedTransactionId && (
            <p className="text-[10px] text-zinc-400 font-mono">
              🔑 TX ID: {draft.extractedTransactionId}
              <button onClick={() => navigator.clipboard.writeText(draft.extractedTransactionId!)} className="ml-2 hover:text-zinc-600">
                <Copy className="w-3 h-3 inline" />
              </button>
            </p>
          )}
        </>
      )}

      {/* Ações */}
      <div className="flex gap-2">
        {!isDuplicate && (
          <button
            disabled={loading || !amount || parseFloat(amount) <= 0}
            onClick={() => onConfirm({ draftId: draft.id, action: 'CONFIRM', amount: parseFloat(amount), date, name, category, notes })}
            className="flex-1 btn-primary flex items-center justify-center gap-1.5 py-2.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {draft.type === 'ENTRADA' ? 'Confirmar Recebimento' : 'Confirmar Despesa'}
          </button>
        )}
        <button disabled={loading} onClick={onReject} className={`btn-secondary py-2.5 flex items-center gap-1.5 ${isDuplicate ? 'flex-1' : ''}`}>
          <XCircle className="w-4 h-4" />{isDuplicate ? 'Descartar Duplicata' : 'Descartar'}
        </button>
      </div>
    </div>
  )
}

type ConfirmPayload = { draftId: string; action: 'CONFIRM' | 'REJECT'; amount?: number; date?: string; name?: string; category?: string; notes?: string }

// ─────────────────────────────────────────────────────────────────────────────
// Card do Histórico
// ─────────────────────────────────────────────────────────────────────────────
function HistoryCard({ d }: { d: Draft }) {
  const [open, setOpen] = useState(false)
  const sc = STATUS_CONFIG[d.status] ?? STATUS_CONFIG.PENDING
  return (
    <div className="rounded-xl border border-zinc-100 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="w-full px-3 py-2.5 flex items-center gap-3 text-left">
        <span className={`shrink-0 flex items-center gap-1 text-[10px] font-bold ${sc.color}`}>{sc.icon}{sc.label}</span>
        <span className={`shrink-0 w-6 h-6 rounded-lg flex items-center justify-center ${d.type === 'ENTRADA' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
          {d.type === 'ENTRADA' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">{d.confirmedAmount != null ? BRL(d.confirmedAmount) : d.extractedAmount != null ? `~${BRL(d.extractedAmount)}` : '—'}</p>
          <p className="text-[10px] text-zinc-400 truncate">{d.extractedName ?? d.rawText?.slice(0, 60) ?? '—'}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-zinc-400">
          <p>{new Date(d.createdAt).toLocaleDateString('pt-BR')}</p>
          <p>{d.hadImage ? '📷 Imagem' : '💬 Texto'}</p>
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-zinc-300" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-300" />}
      </button>
      {open && (
        <div className="px-3 pb-3 text-xs text-zinc-500 border-t border-zinc-50 dark:border-zinc-800 pt-2 space-y-1">
          {d.extractedCategory && <p>Categoria: <strong>{d.extractedCategory}</strong></p>}
          {d.extractedTransactionId && <p className="font-mono text-[10px]">TX: {d.extractedTransactionId}</p>}
          {d.extractedPaymentMethod && <p>Método: <strong>{d.extractedPaymentMethod}</strong></p>}
          {d.createdEntryId && <p className="text-green-600 font-semibold">✅ Entrada financeira criada</p>}
          {d.rawText && <p className="bg-zinc-50 dark:bg-zinc-800 px-2 py-1 rounded text-[10px] whitespace-pre-wrap line-clamp-3">{d.rawText}</p>}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente Principal
// ─────────────────────────────────────────────────────────────────────────────
export function AlfredoFastEntry({ compact = false }: { compact?: boolean }) {
  const [entryType,    setEntryType]    = useState<EntryType>('ENTRADA')
  const [inputMode,    setInputMode]    = useState<'text' | 'image'>('text')
  const [text,         setText]         = useState('')
  const [imageBase64,  setImageBase64]  = useState<string | null>(null)
  const [imageName,    setImageName]    = useState('')
  const [processing,   setProcessing]   = useState(false)
  const [confirming,   setConfirming]   = useState(false)
  const [draft,        setDraft]        = useState<Draft | null>(null)
  const [extracted,    setExtracted]    = useState<ExtractedData | null>(null)
  const [success,      setSuccess]      = useState<string | null>(null)
  const [error,        setError]        = useState('')
  const [history,      setHistory]      = useState<Draft[]>([])
  const [showHistory,  setShowHistory]  = useState(false)
  const [histLoading,  setHistLoading]  = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => {
    setHistLoading(true)
    const r = await fetch('/api/alfredo/fast-entry?limit=15')
    if (r.ok) setHistory(await r.json())
    setHistLoading(false)
  }, [])

  useEffect(() => { if (showHistory) loadHistory() }, [showHistory, loadHistory])

  // Upload de imagem → base64
  const handleImageUpload = (file: File) => {
    setImageName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      // Remove prefixo "data:image/...;base64,"
      const base64 = result.split(',')[1]
      setImageBase64(base64)
    }
    reader.readAsDataURL(file)
  }

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleImageUpload(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) handleImageUpload(file)
  }

  // Processa texto ou imagem
  const processInput = async () => {
    if (inputMode === 'text' && !text.trim()) { setError('Cole um texto ou mensagem do WhatsApp.'); return }
    if (inputMode === 'image' && !imageBase64) { setError('Selecione uma imagem de comprovante.'); return }

    setProcessing(true); setError(''); setDraft(null); setExtracted(null); setSuccess(null)

    const body: Record<string, unknown> = { type: entryType }
    if (inputMode === 'text') { body.text = text }
    else { body.imageBase64 = imageBase64; body.mimeType = 'image/jpeg' }

    const r = await fetch('/api/alfredo/fast-entry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })

    if (r.ok) {
      const j = await r.json()
      setDraft(j.draft)
      setExtracted(j.extracted)
    } else {
      const j = await r.json()
      setError(j.error ?? 'Erro ao processar')
    }
    setProcessing(false)
  }

  // Confirma ou rejeita
  const handleConfirm = async (payload: ConfirmPayload) => {
    setConfirming(true); setError('')
    const r = await fetch('/api/alfredo/fast-entry/confirm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    if (r.ok) {
      const j = await r.json()
      setSuccess(j.action === 'CONFIRMED' ? 'Lançamento financeiro criado com sucesso!' : 'Draft descartado.')
      setDraft(null); setExtracted(null)
      setText(''); setImageBase64(null); setImageName('')
      if (showHistory) loadHistory()
    } else {
      const j = await r.json()
      setError(j.error ?? 'Erro ao confirmar')
    }
    setConfirming(false)
  }

  const reset = () => {
    setDraft(null); setExtracted(null); setSuccess(null); setError('')
    setText(''); setImageBase64(null); setImageName('')
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-black text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary-500" />ALFREDO Fast-Entry
            </h3>
            <p className="text-xs text-zinc-400">Zero Entry Policy — cole o comprovante, a IA lança no sistema</p>
          </div>
          <button onClick={() => { setShowHistory((v) => !v); if (!showHistory) loadHistory() }}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />Histórico
          </button>
        </div>
      )}

      {/* Seletor Entrada / Saída */}
      <div className="flex rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        {(['ENTRADA', 'SAIDA'] as EntryType[]).map((t) => (
          <button key={t} onClick={() => setEntryType(t)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition-colors ${entryType === t ? (t === 'ENTRADA' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
            {t === 'ENTRADA' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {t === 'ENTRADA' ? 'Recebimento (Entrada)' : 'Pagamento (Saída)'}
          </button>
        ))}
      </div>

      {/* Conteúdo principal — só mostra se não tem draft pendente */}
      {!draft && !success && (
        <div className="space-y-3">
          {/* Modo de input */}
          <div className="flex gap-1.5">
            {([['text', 'Texto/WhatsApp', <MessageSquare key="t" className="w-3.5 h-3.5" />],
               ['image', 'Imagem/Foto', <ImageIcon key="i" className="w-3.5 h-3.5" />]] as [string, string, React.ReactNode][]).map(([m, l, ic]) => (
              <button key={m} onClick={() => setInputMode(m as 'text' | 'image')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${inputMode === m ? 'bg-primary-600 text-white border-primary-600' : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50'}`}>
                {ic}{l}
              </button>
            ))}
          </div>

          {/* Input de texto */}
          {inputMode === 'text' && (
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={compact ? 4 : 6}
              placeholder={entryType === 'ENTRADA'
                ? 'Cole a mensagem do WhatsApp com o comprovante...\nEx: "Pagamento João Titanium Ref. Contas Gasto 200k — R$ 900,00"'
                : 'Cole o texto do comprovante de pagamento...\nEx: "Pago 450 reais servidor hosting infra"'}
              className="input-field w-full text-sm resize-none font-mono" />
          )}

          {/* Input de imagem */}
          {inputMode === 'image' && (
            <div
              onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${imageBase64 ? 'border-green-300 bg-green-50 dark:bg-green-950/10' : 'border-zinc-200 dark:border-zinc-700 hover:border-primary-300 hover:bg-primary-50/20'}`}
            >
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFilePick} />
              {imageBase64 ? (
                <div className="flex flex-col items-center gap-1">
                  <CheckCircle2 className="w-8 h-8 text-green-500" />
                  <p className="font-bold text-green-700 text-sm">{imageName || 'Imagem carregada'}</p>
                  <button onClick={(e) => { e.stopPropagation(); setImageBase64(null); setImageName('') }}
                    className="text-xs text-zinc-400 hover:text-red-500 mt-1">Remover</button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-zinc-400">
                  <Upload className="w-8 h-8" />
                  <p className="font-bold text-sm">Arraste o comprovante ou clique para selecionar</p>
                  <p className="text-xs">JPG, PNG, WEBP — screenshot do PIX, transferência, etc.</p>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>}

          <button onClick={processInput} disabled={processing || (inputMode === 'text' ? !text.trim() : !imageBase64)}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-sm font-bold">
            {processing ? <><Loader2 className="w-4 h-4 animate-spin" />ALFREDO analisando...</> : <><Zap className="w-4 h-4" />Processar com ALFREDO IA</>}
          </button>

          {processing && (
            <p className="text-center text-xs text-zinc-400 animate-pulse">
              Extraindo valor, data, nome e categoria via IA...
            </p>
          )}
        </div>
      )}

      {/* Card de Confirmação */}
      {draft && extracted && !success && (
        <div className="space-y-2">
          <ConfirmCard draft={draft} extracted={extracted}
            onConfirm={handleConfirm} onReject={() => handleConfirm({ draftId: draft.id, action: 'REJECT' })}
            loading={confirming} />
          <button onClick={reset} className="w-full btn-secondary text-xs py-2 flex items-center justify-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />Recomeçar
          </button>
        </div>
      )}

      {/* Feedback de sucesso */}
      {success && (
        <div className="rounded-2xl border border-green-200 bg-green-50 dark:bg-green-950/10 p-4 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
          <p className="font-bold text-green-700">{success}</p>
          <p className="text-xs text-green-600">DRE atualizado em tempo real. Próximo comprovante?</p>
          <button onClick={reset} className="btn-primary text-sm px-6 mt-1">
            <Zap className="w-3.5 h-3.5 inline mr-1.5" />Novo Lançamento
          </button>
        </div>
      )}

      {/* Histórico */}
      {showHistory && !compact && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-zinc-500 uppercase">Histórico Recente</p>
            <button onClick={loadHistory} className="text-zinc-400 hover:text-zinc-600">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
          {histLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
          ) : history.length === 0 ? (
            <p className="text-center text-xs text-zinc-400 py-6">Nenhum lançamento ainda.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {history.map((d) => <HistoryCard key={d.id} d={d} />)}
            </div>
          )}
        </div>
      )}

      {/* Rodapé de info */}
      {!compact && !draft && !success && (
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700 px-4 py-3 text-xs text-zinc-400 space-y-1">
          <p className="font-bold text-zinc-500 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Como funciona</p>
          <p>• <strong>Entrada:</strong> comprovante de PIX recebido, pagamento de cliente → cria Contas a Receber</p>
          <p>• <strong>Saída:</strong> comprovante de pagamento a fornecedor, despesa → lança no financeiro como despesa paga</p>
          <p>• A IA detecta automaticamente valor, data, nome e categoria. Você apenas confirma em 1 clique.</p>
          <p>• Proteção anti-duplicata: IDs de transação PIX são verificados antes do lançamento.</p>
        </div>
      )}
    </div>
  )
}
