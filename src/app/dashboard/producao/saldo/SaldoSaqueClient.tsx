'use client'

import { useState, useEffect } from 'react'

type SaldoData = {
  saldoDisponivel: number
  previsaoMes: {
    contasAprovadas: number
    baseSalary: number
    perAccountTotal: number
    bonusTotal: number
    total: number
  }
  fechamentoAtual: { status: string; total: number } | null
  config: {
    metaDiaria: number
    metaMensal: number
    metaElite: number
    salarioBase: number
  }
}

export function SaldoSaqueClient() {
  const [data, setData] = useState<SaldoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [value, setValue] = useState('')
  const [gateway, setGateway] = useState('PIX')
  const [submitting, setSubmitting] = useState(false)

  function load() {
    fetch('/api/producao/saldo')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSolicitar(e: React.FormEvent) {
    e.preventDefault()
    const v = parseFloat(value.replace(',', '.'))
    if (isNaN(v) || v <= 0) {
      alert('Informe um valor válido')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/saques/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: v, gateway }),
      })
      const d = await res.json()
      if (res.ok) {
        setValue('')
        setShowForm(false)
        load()
        alert('Solicitação de saque registrada. Aguarde processamento.')
      } else {
        alert(d.error || 'Erro ao solicitar saque')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !data) return <p className="text-gray-500 py-4">Carregando...</p>

  const previsao = data.previsaoMes

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card border-l-4 border-l-green-600">
          <p className="text-sm text-gray-500">Saldo disponível para saque</p>
          <p className="text-2xl font-bold text-green-700">
            R$ {data.saldoDisponivel.toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Contas aprovadas (mês)</p>
          <p className="text-2xl font-bold text-primary-600">{previsao.contasAprovadas}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Previsão do mês</p>
          <p className="text-2xl font-bold text-primary-600">
            R$ {previsao.total.toLocaleString('pt-BR')}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Base R$ {previsao.baseSalary.toLocaleString('pt-BR')} + bônus R$ {previsao.bonusTotal.toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Metas</p>
          <p className="text-sm">
            Padrão: {data.config.metaMensal} contas · Elite: {data.config.metaElite} contas
          </p>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-4">Solicitar saque</h3>
        {data.saldoDisponivel <= 0 ? (
          <p className="text-gray-500">
            Não há saldo disponível. O saldo é liberado após o fechamento mensal pelo admin.
          </p>
        ) : (
          <>
            {!showForm ? (
              <button onClick={() => setShowForm(true)} className="btn-primary">
                Solicitar saque
              </button>
            ) : (
              <form onSubmit={handleSolicitar} className="space-y-3 max-w-sm">
                <div>
                  <label className="block text-sm font-medium mb-1">Valor (R$)</label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="0,00"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Forma de recebimento</label>
                  <select
                    value={gateway}
                    onChange={(e) => setGateway(e.target.value)}
                    className="input-field"
                  >
                    <option value="PIX">PIX</option>
                    <option value="TED">TED</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={submitting} className="btn-primary">
                    {submitting ? 'Enviando...' : 'Confirmar solicitação'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="btn-secondary"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
