'use client'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ads-offwhite p-6">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-100 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-primary-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-ads-antracite mb-2">
          Você está offline
        </h1>
        <p className="text-slate-600 mb-6">
          Verifique sua conexão com a internet e tente novamente.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-primary"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )
}
