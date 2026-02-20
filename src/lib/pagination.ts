/**
 * Utilitário de paginação para APIs
 * Padrão: page=1, limit=50, máx 200
 */
export function getPaginationParams(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50))
  const skip = (page - 1) * limit
  return { page, limit, skip }
}

export function paginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  limit: number
) {
  const totalPages = Math.ceil(total / limit)
  return {
    items,
    total,
    page,
    limit,
    totalPages,
    hasMore: page < totalPages,
  }
}
