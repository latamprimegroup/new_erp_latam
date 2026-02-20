'use client'

/**
 * Data Table - Sticky header, pronto para virtual scroll
 * Use em listagens densas
 */
export function DataTable({
  columns,
  data,
  className = '',
}: {
  columns: { key: string; label: string; className?: string }[]
  data: Record<string, React.ReactNode>[]
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden ${className}`}>
      <div className="overflow-x-auto max-h-[calc(100vh-12rem)] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left font-semibold text-zinc-700 dark:text-zinc-300 ${col.className ?? ''}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={i}
                className="border-b border-zinc-100 dark:border-zinc-800/80 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 text-zinc-600 dark:text-zinc-400 ${col.className ?? ''}`}
                  >
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
