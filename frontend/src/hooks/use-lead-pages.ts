import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import type { Lead, LeadStatus } from "@/types"
import { getErrorMessage, readJson } from "@/lib/api"
import { buildLeadPageUrl, DEFAULT_LEAD_LIST_FILTERS, type LeadListFilters } from "@/lib/lead-page"
import { countLeadStatuses } from "@/lib/lead-status"

type LeadsResponse = {
  leads?: Lead[]
  total?: number
  total_leads?: number
  status_counts?: Partial<Record<LeadStatus, number>>
  cities?: string[]
}

export type LeadPageSummary = {
  leadCount: number
  totalLeads: number
}

export function useLeadPages(setError: (message: string) => void) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [filteredLeadTotal, setFilteredLeadTotal] = useState(0)
  const [totalLeads, setTotalLeads] = useState(0)
  const [leadStatusCounts, setLeadStatusCounts] = useState(() => countLeadStatuses([]))
  const [cities, setCities] = useState<string[]>([])
  const [leadFilters, setLeadFilters] = useState<LeadListFilters>(DEFAULT_LEAD_LIST_FILTERS)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const deferredSearch = useDeferredValue(leadFilters.search)
  const activeLeadFilters = useMemo(
    () => ({ ...leadFilters, search: deferredSearch }),
    [deferredSearch, leadFilters],
  )
  const activeFilterKey = JSON.stringify(activeLeadFilters)
  const activeFilterKeyRef = useRef(activeFilterKey)

  const applyLeadPage = useCallback((data: LeadsResponse, append: boolean): LeadPageSummary => {
    const nextLeads = data.leads || []
    setLeads(current => {
      if (!append) return nextLeads
      const existingIds = new Set(current.map(lead => lead.id))
      return [...current, ...nextLeads.filter(lead => !existingIds.has(lead.id))]
    })
    setFilteredLeadTotal(data.total ?? nextLeads.length)
    setTotalLeads(data.total_leads ?? nextLeads.length)
    setLeadStatusCounts({ ...countLeadStatuses([]), ...data.status_counts })
    setCities(data.cities || [])
    return {
      leadCount: nextLeads.length,
      totalLeads: data.total_leads ?? nextLeads.length,
    }
  }, [])

  const fetchLeadPage = useCallback(async (offset: number) => {
    const response = await fetch(buildLeadPageUrl(offset, activeLeadFilters))
    return readJson<LeadsResponse>(response)
  }, [activeLeadFilters])

  const reloadLeads = useCallback(async () => {
    const data = await fetchLeadPage(0)
    return applyLeadPage(data, false)
  }, [applyLeadPage, fetchLeadPage])

  useEffect(() => {
    activeFilterKeyRef.current = activeFilterKey
  }, [activeFilterKey])

  useEffect(() => {
    let isCurrent = true
    void fetchLeadPage(0)
      .then((data) => {
        if (isCurrent) applyLeadPage(data, false)
      })
      .catch((error) => console.error("Failed to fetch leads:", error))
      .finally(() => {
        if (isCurrent) setIsLoadingMore(false)
      })
    return () => {
      isCurrent = false
    }
  }, [applyLeadPage, fetchLeadPage])

  const updateLeadFilters = (filters: LeadListFilters) => {
    setIsLoadingMore(true)
    setLeadFilters(filters)
  }

  const loadMoreLeads = async () => {
    if (isLoadingMore || leads.length >= filteredLeadTotal) return

    const filterKey = activeFilterKey
    setIsLoadingMore(true)
    try {
      const nextPage = await fetchLeadPage(leads.length)
      if (activeFilterKeyRef.current !== filterKey) return
      applyLeadPage(nextPage, true)
    } catch (error) {
      if (activeFilterKeyRef.current === filterKey) setError(getErrorMessage(error))
    } finally {
      if (activeFilterKeyRef.current === filterKey) setIsLoadingMore(false)
    }
  }

  return {
    cities,
    filteredLeadTotal,
    isLoadingMore,
    leadFilters,
    leadStatusCounts,
    leads,
    loadMoreLeads,
    reloadLeads,
    setFilteredLeadTotal,
    setLeadStatusCounts,
    setLeads,
    setTotalLeads,
    totalLeads,
    updateLeadFilters,
  }
}
