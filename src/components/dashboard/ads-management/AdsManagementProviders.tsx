'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

const FIVE_MIN = 5 * 60 * 1000

export function AdsManagementProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: FIVE_MIN,
            gcTime: FIVE_MIN * 2,
            refetchInterval: FIVE_MIN,
            refetchOnWindowFocus: true,
          },
        },
      })
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
