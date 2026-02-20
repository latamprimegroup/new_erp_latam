'use client'

import { useState } from 'react'

export function BackupClient() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleBackup() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/backup')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Erro ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `erp-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Backup de Dados</h1>
        <p className="text-slate-600 mt-1">
          Exporte todos os dados críticos (produção, estoque, credenciais) para armazenamento seguro.
          Recomendado: executar diariamente via cron e guardar em local externo.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600 mb-4">
          O backup inclui: StockAccount, StockAccountCredential, ProductionG2, ProductionAccount,
          Email, Cnpj, AccountArchiveBatch. Credenciais são exportadas descriptografadas — armazene com segurança.
        </p>
        <button
          onClick={handleBackup}
          disabled={loading}
          className="rounded-lg bg-slate-800 text-white px-4 py-2 font-medium hover:bg-slate-900 disabled:opacity-50"
        >
          {loading ? 'Gerando...' : 'Gerar e baixar backup'}
        </button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Backup automático (cron):</strong>
        <pre className="mt-2 overflow-x-auto text-xs bg-amber-100/50 p-2 rounded">
{`# Diário às 3h
0 3 * * * curl "https://seu-erp.com/api/admin/backup?secret=$CRON_SECRET" -o /backups/erp-\$(date +%Y-%m-%d).json`}
        </pre>
      </div>
    </div>
  )
}
