'use client'

const CUSTO_FIXO_CATEGORIAS = [
  { id: 'CUSTO_PROXY', label: 'Proxies (residencial/móvel)' },
  { id: 'CUSTO_DOMINIO', label: 'Domínios' },
  { id: 'CUSTO_SERVIDOR', label: 'Servidores / cloud' },
  { id: 'CUSTO_FERRAMENTA', label: 'Ferramentas de automação' },
  { id: 'CUSTO_API_ADS', label: 'APIs Google / Meta / ads' },
  { id: 'CUSTO_OUTROS_FIXOS', label: 'Outros fixos' },
] as const

export function FinanceiroContasFiscalTab({
  month,
  year,
  onPresetExpense,
}: {
  month: string
  year: string
  onPresetExpense: (category: string) => void
}) {
  function downloadCsv() {
    const q = `month=${month}&year=${year}`
    window.open(`/api/financeiro/export/contabil?${q}&format=csv`, '_blank', 'noopener,noreferrer')
  }

  function downloadJson() {
    const q = `month=${month}&year=${year}`
    window.open(`/api/financeiro/export/contabil?${q}&format=json`, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-8">
      <section className="card">
        <h2 className="font-semibold mb-2">Contas a pagar (custos fixos / infra)</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Registre proxies, domínios, servidores, ferramentas e APIs com categorias padronizadas. Ao clicar, abrimos o
          formulário de lançamento em <strong>Saída</strong> com a categoria já preenchida.
        </p>
        <div className="flex flex-wrap gap-2">
          {CUSTO_FIXO_CATEGORIAS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="btn-secondary text-sm py-2 px-3"
              onClick={() => onPresetExpense(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="font-semibold mb-2">Relatórios fiscais / contábeis</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Exportação sem dados sensíveis de clientes: apenas lançamentos do período e resumo DRE Vault (margem, CMV,
          payouts estimados). <strong>Notas fiscais</strong> podem ser vinculadas num módulo dedicado depois.
        </p>
        <p className="text-xs text-gray-500 mb-3">
          Período: {String(month).padStart(2, '0')}/{year}
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary text-sm" onClick={downloadCsv}>
            Baixar CSV (contabilidade)
          </button>
          <button type="button" className="btn-secondary text-sm" onClick={downloadJson}>
            Baixar JSON (integração)
          </button>
        </div>
      </section>
    </div>
  )
}
