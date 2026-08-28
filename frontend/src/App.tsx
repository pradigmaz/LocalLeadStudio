import { useEffect, useState } from "react"
import { SearchForm } from '@/components/search/SearchForm'
import { ParsingStatus } from '@/components/search/ParsingStatus'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { LeadModal } from '@/components/leads/LeadModal'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { BrowserRoutingDialog } from '@/components/settings/BrowserRoutingDialog'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import type { Lead, LeadStatus, ProviderPreferences, RunConfig, RunJobStatus } from '@/types'
import { NumberTicker } from "@/components/ui/number-ticker"
import { getErrorMessage, JSON_ACTION_HEADERS, LOCAL_ACTION_HEADERS, readJson } from "@/lib/api"
import { LEAD_STATUS_SUMMARY } from "@/lib/lead-status"
import { getBrowserRoutingApi, type BrowserRoutingSettings } from "@/lib/browser-routing"
import { useLeadPages } from "@/hooks/use-lead-pages"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"

const EMPTY_JOB_STATUS: RunJobStatus = { status: 'IDLE' };
const TERMINAL_JOB_STATUSES = new Set(['FINISHED', 'FAILED', 'CANCELLED', 'RATE_LIMITED']);
function App() {
  const [viewState, setViewState] = useState<'IDLE' | 'LOADING' | 'RESULTS'>('IDLE');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<RunJobStatus>(EMPTY_JOB_STATUS);
  const [preferences, setPreferences] = useState<ProviderPreferences | null>(null);
  const [browserRouting, setBrowserRouting] = useState<BrowserRoutingSettings | null>(null);
  const [isBrowserOnboardingOpen, setIsBrowserOnboardingOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const {
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
  } = useLeadPages((message) => setError(message));

  useEffect(() => {
    fetch('/api/settings/preferences')
      .then(res => readJson<ProviderPreferences>(res))
      .then((nextPreferences) => {
        setPreferences(nextPreferences);
      })
      .catch(err => console.error("Failed to fetch preferences:", err));
  }, []);

  useEffect(() => {
    const api = getBrowserRoutingApi();
    if (!api) return;
    api.getSettings()
      .then((nextRouting) => {
        setBrowserRouting(nextRouting);
        setIsBrowserOnboardingOpen(nextRouting.onboarding === 'pending');
      })
      .catch(err => console.error("Failed to load browser routing settings:", err));
  }, []);

  useEffect(() => {
    if (viewState !== 'LOADING') return;

    let isCancelled = false;

    const pollJob = async () => {
      try {
        const response = await fetch('/api/run/status');
        const nextJob = await readJson<RunJobStatus>(response);
        if (isCancelled) return;

        setJobStatus(nextJob);

        if (TERMINAL_JOB_STATUSES.has(nextJob.status)) {
          const nextPage = await reloadLeads();
          if (isCancelled) return;

          if (nextJob.status === 'FAILED') {
            setError(nextJob.error || 'Сбор завершился ошибкой');
          } else if (nextJob.status === 'RATE_LIMITED') {
            setError(nextJob.result?.error || 'Сбор остановлен: лимит Яндекс Карт');
          }

          setViewState(nextPage.totalLeads > 0 ? 'RESULTS' : 'IDLE');
        }
      } catch (err: unknown) {
        if (isCancelled) return;
        setError(getErrorMessage(err));
        setViewState('IDLE');
      }
    };

    void pollJob();
    const timer = window.setInterval(pollJob, 1000);

    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, [reloadLeads, viewState]);

  const handleRun = async (config: RunConfig) => {
    try {
      setViewState('LOADING');
      setError(null);
      setJobStatus(EMPTY_JOB_STATUS);
      
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: JSON_ACTION_HEADERS,
        body: JSON.stringify(config)
      });
      
      const startedJob = await readJson<RunJobStatus>(response);
      setJobStatus(startedJob);
      
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setViewState('IDLE');
    }
  };

  const handleCancelRun = async () => {
    const response = await fetch('/api/run/cancel', { method: 'POST', headers: LOCAL_ACTION_HEADERS });
    const nextJob = await readJson<RunJobStatus>(response);
    setJobStatus(nextJob);
  };

  const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    // Оптимистичное обновление UI (для мгновенной реакции и анимации)
    const previousLeads = [...leads];
    const previousSelectedLead = selectedLead;
    const previousLead = leads.find(lead => lead.id === leadId);
    const previousStatusCounts = leadStatusCounts;

    setLeads(current => current.map(l => l.id === leadId ? { ...l, lead_status: newStatus } : l));
    setLeadStatusCounts(current => {
      if (!previousLead || previousLead.lead_status === newStatus) return current;
      return {
        ...current,
        [previousLead.lead_status]: Math.max(0, current[previousLead.lead_status] - 1),
        [newStatus]: current[newStatus] + 1,
      };
    });
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead({ ...selectedLead, lead_status: newStatus });
    }

    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'POST',
        headers: JSON_ACTION_HEADERS,
        body: JSON.stringify({ status: newStatus })
      });
      
      const result = await readJson<{ success: boolean }>(response);
      if (!result.success) throw new Error("Сервер не подтвердил обновление статуса.");
      if (newStatus === 'REJECT' || newStatus === 'POTENTIAL') {
        setSelectedLead(current => current?.id === leadId ? null : current);
      }
    } catch (err) {
      setLeads(previousLeads);
      setSelectedLead(previousSelectedLead);
      setLeadStatusCounts(previousStatusCounts);
      setError(getErrorMessage(err));
      return;
    }

    try {
      await reloadLeads();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleLeadClick = async (lead: Lead) => {
    const previousViewedAt = lead.viewed_at ?? null;
    const viewedAt = lead.viewed_at || new Date().toISOString();
    const viewedLead = { ...lead, viewed_at: viewedAt };

    setSelectedLead(viewedLead);
    if (!lead.viewed_at) {
      setLeads(current => current.map(l => l.id === lead.id ? { ...l, viewed_at: viewedAt } : l));
    }

    try {
      const response = await fetch(`/api/leads/${lead.id}/viewed`, { method: 'POST', headers: LOCAL_ACTION_HEADERS });
      const result = await readJson<{ success: boolean; viewed_at?: string }>(response);
      if (result.viewed_at && result.viewed_at !== viewedAt) {
        setLeads(current => current.map(l => l.id === lead.id ? { ...l, viewed_at: result.viewed_at || viewedAt } : l));
        setSelectedLead(current => current?.id === lead.id ? { ...current, viewed_at: result.viewed_at || viewedAt } : current);
      }
    } catch (err) {
      if (!previousViewedAt) {
        setLeads(current => current.map(l => l.id === lead.id ? { ...l, viewed_at: null } : l));
        setSelectedLead(current => current?.id === lead.id ? { ...current, viewed_at: null } : current);
      }
      setError(getErrorMessage(err));
    }
  };

  const handlePriorityChange = async (leadId: string, priority: number) => {
    const previousLeads = [...leads];
    const previousSelectedLead = selectedLead;

    setLeads(current => current.map(l => l.id === leadId ? { ...l, priority } : l));
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead({ ...selectedLead, priority });
    }

    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'POST',
        headers: JSON_ACTION_HEADERS,
        body: JSON.stringify({ priority })
      });
      
      await readJson<{ success: boolean }>(response);
    } catch (err: unknown) {
      setLeads(previousLeads);
      setSelectedLead(previousSelectedLead);
      setError(getErrorMessage(err));
      return;
    }

    try {
      await reloadLeads();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleLeadDeleted = (leadId: string) => {
    const deletedLead = leads.find(lead => lead.id === leadId);
    setLeads(current => current.filter(lead => lead.id !== leadId));
    setSelectedLead(current => current?.id === leadId ? null : current);
    setFilteredLeadTotal(current => Math.max(0, current - 1));
    setTotalLeads(current => Math.max(0, current - 1));
    if (deletedLead) {
      setLeadStatusCounts(current => ({
        ...current,
        [deletedLead.lead_status]: Math.max(0, current[deletedLead.lead_status] - 1),
      }));
    }
    void reloadLeads().catch((err) => setError(getErrorMessage(err)));
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden text-slate-900 font-sans">
      <Toaster position="bottom-right" richColors />
      <BrowserRoutingDialog
        open={isBrowserOnboardingOpen}
        onOpenChange={setIsBrowserOnboardingOpen}
        onboarding
        onSettingsChange={(nextRouting) => {
          setBrowserRouting(nextRouting)
          setIsBrowserOnboardingOpen(false)
        }}
      />
      {/* Sidebar */}
      <div className={`shrink-0 overflow-hidden bg-white flex flex-col z-10 shadow-sm transition-[width] duration-200 ease-out ${isSidebarCollapsed ? "w-0 border-r-0" : "w-[26rem] border-r"}`}>
        <div className="h-14 flex items-center px-6 border-b shrink-0">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center text-primary-foreground text-xs">
              LS
            </div>
            LeadStudio
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <SearchForm onRun={handleRun} isLoading={viewState === 'LOADING'} preferences={preferences} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <header className="min-h-14 border-b bg-white flex items-center px-8 justify-between shrink-0 shadow-sm z-10 py-2 gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              onClick={() => setIsSidebarCollapsed(current => !current)}
              aria-label={isSidebarCollapsed ? "Показать конструктор сбора" : "Скрыть конструктор сбора"}
              title={isSidebarCollapsed ? "Показать конструктор сбора" : "Скрыть конструктор сбора"}
            >
              {isSidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="font-semibold text-lg shrink-0">Единая база</h1>
                {totalLeads > 0 && (
                  <Badge variant="secondary" className="font-mono text-xs font-semibold">
                    <NumberTicker value={totalLeads} />
                  </Badge>
                )}
              </div>
              {totalLeads > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {LEAD_STATUS_SUMMARY.map(({ status, label }) => (
                    <span key={status} className="whitespace-nowrap">
                      {label}: <span className="font-medium tabular-nums text-foreground">{leadStatusCounts[status]}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {viewState === 'LOADING' && (
              <ParsingStatus job={jobStatus} onCancel={handleCancelRun} />
            )}
            <SettingsDialog
              preferences={preferences}
              onPreferencesChange={setPreferences}
              browserRouting={browserRouting}
              onBrowserRoutingChange={setBrowserRouting}
            />
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
          <div className="p-8 max-w-7xl mx-auto">
            {error && (
              <div className="bg-destructive/10 border-l-4 border-destructive text-destructive p-4 rounded-md mb-6">
                <p className="font-medium">Ошибка</p>
                <p className="text-sm">{error}</p>
              </div>
            )}

            {viewState === 'IDLE' && totalLeads === 0 && (
              <div className="h-[60vh] flex items-center justify-center">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-400">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                  </div>
                  <h3 className="text-xl font-semibold">База пуста</h3>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    Настройте параметры в левом меню и нажмите "Запустить парсер" для сбора лидов.
                  </p>
                </div>
              </div>
            )}

            {(viewState === 'RESULTS' || totalLeads > 0) && (
              <>
                <LeadsTable
                  leads={leads}
                  onLeadClick={handleLeadClick}
                  filters={leadFilters}
                  cities={cities}
                  hasAnyLeads={totalLeads > 0}
                  onFiltersChange={updateLeadFilters}
                />
                {filteredLeadTotal > leads.length && (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-muted-foreground">
                    <span>Показано {leads.length} из {filteredLeadTotal}</span>
                    <Button type="button" variant="outline" onClick={loadMoreLeads} disabled={isLoadingMore}>
                      {isLoadingMore ? 'Загружаю…' : 'Показать ещё'}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <LeadModal 
        lead={selectedLead} 
        isOpen={!!selectedLead} 
        onClose={() => setSelectedLead(null)}
        onStatusChange={handleStatusChange}
        onPriorityChange={handlePriorityChange}
        onLeadDeleted={handleLeadDeleted}
      />
    </div>
  )
}

export default App
