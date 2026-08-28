export const LEAD_PAGE_SIZE = 50

export type LeadListFilters = {
  search: string
  status: string
  leadType: string
  city: string
  reviewRange: string
}

export const DEFAULT_LEAD_LIST_FILTERS: LeadListFilters = {
  search: "",
  status: "NEW",
  leadType: "ALL",
  city: "ALL",
  reviewRange: "ALL",
}

export function buildLeadPageUrl(offset: number, filters: LeadListFilters): string {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(LEAD_PAGE_SIZE),
    status: filters.status,
  })

  if (filters.search.trim()) params.set("search", filters.search.trim())
  if (filters.leadType !== "ALL") params.set("lead_type", filters.leadType)
  if (filters.city !== "ALL") params.set("city", filters.city)
  if (filters.reviewRange !== "ALL") params.set("review_range", filters.reviewRange)

  return `/api/leads?${params}`
}
