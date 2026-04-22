'use client'

import { useState, useRef, useCallback, KeyboardEvent } from 'react'
import {
  Plus,
  Trash2,
  Rocket,
  CheckCircle,
  AlertCircle,
  ClipboardList,
  ChevronDown,
} from 'lucide-react'

// ─── Opções de configuração ────────────────────────────────────────────────

const TIPO_CONTA_OPTIONS = [
  'BRL Manual',
  'BRL Robusto',
  'USD',
  'EUR',
  'GBP',
  'MXN',
  'ARS',
]

const CONFIGURACAO_OPTIONS = [
  'G2 Manual',
  'Sem G2 / Apenas Verificação',
  'Com Op. Comercial',
  'Sem Gastos',
]

const DOCUMENTACAO_OPTIONS = [
  '1º Formulário',
  '2º Formulário',
  'Ambos',
  'Sem Documentação',
]

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface GridRow {
  id: string
  tipoConta: string
  configuracao: string
  documentacao: string
  idsText: string
}

interface ParsedRow extends GridRow {
  parsedIds: string[]
  uniqueIds: string[]
  duplicatesInternal: string[]
  isValid: boolean
}

interface SubmitResult {
  ok: boolean
  totalCriadas?: number
  detalhes?: { row: number; tipoConta: string; criadas: number }[]
  error?: string
  duplicateIds?: string[]
}

// ─── Funções utilitárias ────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function parseIds(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.replace(/[\s\-\.]/g, '').trim())
    .filter(Boolean)
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)]
}

function newRow(): GridRow {
  return {
    id: uid(),
    tipoConta: 'BRL Manual',
    configuracao: 'G2 Manual',
    documentacao: '1º Formulário',
    idsText: '',
  }
}

function parseRow(row: GridRow): ParsedRow {
  const parsedIds = parseIds(row.idsText)
  const uIds = uniqueIds(parsedIds)
  const internalDupes = parsedIds.filter((id, i) => parsedIds.indexOf(id) !== i)
  return {
    ...row,
    parsedIds,
    uniqueIds: uIds,
    duplicatesInternal: [...new Set(internalDupes)],
    isValid: uIds.length > 0,
  }
}

// ─── Componente Select personalizado ───────────────────────────────────────

function Select({
  value,
  onChange,
  options,
  tabIndex,
  onKeyDown,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  tabIndex?: number
  onKeyDown?: (e: KeyboardEvent<HTMLSelectElement>) => void
}) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
        className="
          w-full appearance-none bg-white dark:bg-zinc-800
          border border-zinc-200 dark:border-zinc-700
          rounded-lg px-3 py-2 pr-8 text-sm
          text-zinc-900 dark:text-zinc-100
          focus:outline-none focus:ring-2 focus:ring-primary-500
          cursor-pointer
        "
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
    </div>
  )
}

// ─── Badge de contagem ──────────────────────────────────────────────────────

function CountBadge({ parsed, unique, dupes }: { parsed: number; unique: number; dupes: number }) {
  if (parsed === 0) return <span className="text-zinc-400 text-xs">—</span>

  const hasDupes = dupes > 0
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className={`
          text-xs font-bold px-2 py-0.5 rounded-full
          ${hasDupes
            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
            : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
          }
        `}
      >
        {unique} ID{unique !== 1 ? 's' : ''}
      </span>
      {hasDupes && (
        <span className="text-xs text-amber-600 dark:text-amber-400">
          {dupes} duplicata{dupes !== 1 ? 's' : ''} removida{dupes !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}

// ─── Componente Principal ───────────────────────────────────────────────────

export default function InventarioExpressClient() {
  const [rows, setRows] = useState<GridRow[]>([newRow()])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})

  // ── Manipulação de linhas ──

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, newRow()])
  }, [])

  const removeRow = useCallback((id: string) => {
    setRows((prev) => {
      if (prev.length === 1) return prev
      return prev.filter((r) => r.id !== id)
    })
  }, [])

  const updateRow = useCallback((id: string, field: keyof GridRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)))
  }, [])

  // ── Navegação por teclado (Tab/Enter entre selects → textarea) ──

  const handleSelectKeyDown = useCallback(
    (e: KeyboardEvent<HTMLSelectElement>, rowId: string) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        textareaRefs.current[rowId]?.focus()
      }
    },
    []
  )

  // ── Parsing e validação ──

  const parsedRows = rows.map(parseRow)

  const totalIds = parsedRows.reduce((acc, r) => acc + r.uniqueIds.length, 0)
  const allValid = parsedRows.every((r) => r.isValid)
  const hasAnyIds = totalIds > 0

  // ── Submissão ──

  async function handleSubmit() {
    setConfirmOpen(false)
    setLoading(true)
    setResult(null)

    try {
      const payload = {
        rows: parsedRows.map((r) => ({
          tipoConta: r.tipoConta,
          configuracao: r.configuracao,
          documentacao: r.documentacao,
          ids: r.uniqueIds,
        })),
      }

      const res = await fetch('/api/admin/inventario-express', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        setResult({ ok: false, error: data.error, duplicateIds: data.duplicateIds })
      } else {
        setResult({ ok: true, ...data })
        // Reseta o grid após sucesso
        setRows([newRow()])
      }
    } catch {
      setResult({ ok: false, error: 'Erro de conexão. Tente novamente.' })
    } finally {
      setLoading(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/30">
            <Rocket className="w-6 h-6 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="heading-1 text-lg">Inventário Express</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Lançamento em massa · Preencha por colunas e cole os IDs
            </p>
          </div>
        </div>
        <button
          onClick={addRow}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Adicionar Linha
        </button>
      </div>

      {/* Resultado de sucesso */}
      {result?.ok && (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800 dark:text-green-300">
              {result.totalCriadas} conta{result.totalCriadas !== 1 ? 's' : ''} criada{result.totalCriadas !== 1 ? 's' : ''} com sucesso!
            </p>
            <ul className="mt-1 space-y-0.5">
              {result.detalhes?.map((d) => (
                <li key={d.row} className="text-sm text-green-700 dark:text-green-400">
                  · {d.tipoConta}: {d.criadas} conta{d.criadas !== 1 ? 's' : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Resultado de erro */}
      {result && !result.ok && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800 dark:text-red-300">{result.error}</p>
            {result.duplicateIds && result.duplicateIds.length > 0 && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                IDs: {result.duplicateIds.slice(0, 8).join(', ')}
                {result.duplicateIds.length > 8 && ` + ${result.duplicateIds.length - 8} mais`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-sm">
        {/* Cabeçalho do grid */}
        <div className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-700 grid grid-cols-[1fr_1fr_1fr_80px_1fr_40px] gap-0">
          {['Tipo / Moeda', 'Configuração G2', 'Documentação', 'Total', 'IDs das Contas', ''].map(
            (col) => (
              <div
                key={col}
                className="px-3 py-2.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide border-r border-zinc-200 dark:border-zinc-700 last:border-r-0"
              >
                {col}
              </div>
            )
          )}
        </div>

        {/* Linhas do grid */}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {parsedRows.map((row, idx) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_1fr_1fr_80px_1fr_40px] gap-0 items-start group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors"
            >
              {/* Tipo / Moeda */}
              <div className="px-2 py-2 border-r border-zinc-100 dark:border-zinc-800">
                <Select
                  value={row.tipoConta}
                  onChange={(v) => updateRow(row.id, 'tipoConta', v)}
                  options={TIPO_CONTA_OPTIONS}
                  tabIndex={(idx * 4) + 1}
                  onKeyDown={(e) => handleSelectKeyDown(e, row.id)}
                />
              </div>

              {/* Configuração */}
              <div className="px-2 py-2 border-r border-zinc-100 dark:border-zinc-800">
                <Select
                  value={row.configuracao}
                  onChange={(v) => updateRow(row.id, 'configuracao', v)}
                  options={CONFIGURACAO_OPTIONS}
                  tabIndex={(idx * 4) + 2}
                  onKeyDown={(e) => handleSelectKeyDown(e, row.id)}
                />
              </div>

              {/* Documentação */}
              <div className="px-2 py-2 border-r border-zinc-100 dark:border-zinc-800">
                <Select
                  value={row.documentacao}
                  onChange={(v) => updateRow(row.id, 'documentacao', v)}
                  options={DOCUMENTACAO_OPTIONS}
                  tabIndex={(idx * 4) + 3}
                  onKeyDown={(e) => handleSelectKeyDown(e, row.id)}
                />
              </div>

              {/* Total de IDs */}
              <div className="px-2 py-2 border-r border-zinc-100 dark:border-zinc-800 flex items-center justify-center min-h-[44px]">
                <CountBadge
                  parsed={row.parsedIds.length}
                  unique={row.uniqueIds.length}
                  dupes={row.duplicatesInternal.length}
                />
              </div>

              {/* IDs das Contas */}
              <div className="px-2 py-2 border-r border-zinc-100 dark:border-zinc-800">
                <textarea
                  ref={(el) => { textareaRefs.current[row.id] = el }}
                  value={row.idsText}
                  onChange={(e) => updateRow(row.id, 'idsText', e.target.value)}
                  tabIndex={(idx * 4) + 4}
                  placeholder={`Cole os IDs aqui (um por linha ou separados por vírgula)\nEx:\n1234567890\n0987654321`}
                  rows={4}
                  className="
                    w-full resize-y text-xs font-mono
                    bg-white dark:bg-zinc-800
                    border border-zinc-200 dark:border-zinc-700
                    rounded-lg px-2 py-1.5
                    text-zinc-900 dark:text-zinc-100
                    placeholder:text-zinc-400 dark:placeholder:text-zinc-600
                    focus:outline-none focus:ring-2 focus:ring-primary-500
                    min-h-[88px]
                  "
                />
                {row.uniqueIds.length > 0 && (
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate">
                    {row.uniqueIds.slice(0, 3).join(', ')}
                    {row.uniqueIds.length > 3 && ` … +${row.uniqueIds.length - 3}`}
                  </p>
                )}
              </div>

              {/* Remover linha */}
              <div className="px-1 py-2 flex items-center justify-center">
                <button
                  onClick={() => removeRow(row.id)}
                  disabled={rows.length === 1}
                  title="Remover linha"
                  className="
                    p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50
                    dark:hover:bg-red-950/30 dark:hover:text-red-400
                    disabled:opacity-20 disabled:cursor-not-allowed
                    transition-colors
                  "
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rodapé: resumo + botão de envio */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700">
        {/* Resumo do lote */}
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-zinc-400" />
          <div className="text-sm">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              {totalIds} conta{totalIds !== 1 ? 's' : ''}
            </span>
            <span className="text-zinc-500 dark:text-zinc-400"> em {rows.length} linha{rows.length !== 1 ? 's' : ''}</span>
            {parsedRows.map((r) =>
              r.uniqueIds.length > 0 ? (
                <span key={r.id} className="ml-2 text-xs text-zinc-400">
                  · {r.tipoConta}: {r.uniqueIds.length}
                </span>
              ) : null
            )}
          </div>
        </div>

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!hasAnyIds || !allValid || loading}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Rocket className="w-4 h-4" />
          {loading ? 'Salvando…' : `Confirmar Lançamento (${totalIds})`}
        </button>
      </div>

      {/* Modal de confirmação */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-ads-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary-100 dark:bg-primary-900/30">
                <Rocket className="w-6 h-6 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <h2 className="font-bold text-zinc-900 dark:text-zinc-100 text-lg">
                  Confirmar Lançamento
                </h2>
                <p className="text-sm text-zinc-500">Esta ação é irreversível</p>
              </div>
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl p-4 space-y-2">
              {parsedRows
                .filter((r) => r.uniqueIds.length > 0)
                .map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-600 dark:text-zinc-300">
                      {r.tipoConta} · {r.configuracao}
                    </span>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {r.uniqueIds.length} conta{r.uniqueIds.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              <div className="border-t border-zinc-200 dark:border-zinc-700 pt-2 mt-2 flex justify-between font-bold text-sm">
                <span className="text-zinc-700 dark:text-zinc-200">Total</span>
                <span className="text-primary-600 dark:text-primary-400">{totalIds} contas</span>
              </div>
            </div>

            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Todas as contas serão criadas com status{' '}
              <span className="font-semibold text-green-600 dark:text-green-400">DISPONÍVEL</span>{' '}
              e ficarão imediatamente visíveis no estoque.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="btn-secondary flex-1"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <Rocket className="w-4 h-4" />
                Lançar Agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
