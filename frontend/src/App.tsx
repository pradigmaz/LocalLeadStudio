import { useCallback, useEffect, useState } from "react"
import { SearchForm } from '@/components/search/SearchForm'
import { ParsingStatus } from '@/components/search/ParsingStatus'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { LeadModal } from '@/components/leads/LeadModal'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Toaster } from "@/components/ui/sonner"
import type { Lead, LeadStatus, ProviderPreferences, ProviderSource, RunConfig, RunJobStatus } from '@/types'
import { NumberTicker } from "@/components/ui/number-ticker"
import { getErrorMessage, JSON_ACTION_HEADERS, LOCAL_ACTION_HEADERS, readJson } from "@/lib/api"

interface LeadsResponse {
  leads?: Lead[];
  error?: string;
}

const EMPTY_JOB_STATUS: RunJobStatus = { status: 'IDLE' };
const TERMINAL_JOB_STATUSES = new Set(['FINISHED', 'FAILED', 'CANCELLED', 'RATE_LIMITED']);
const DEFAULT_PREFERENCES: ProviderPreferences = {
  provider_priority: null,
  enabled_providers: ['yandex', '2gis'],
  max_scan_multiplier: 5,
  twogis_mode: 'browser',
  twogis_browser: 'auto',
  twogis_browser_path: '',
  twogis_quiet_mode: true,
};

function App() {
  const [viewState, setViewState] = useState<'IDLE' | 'LOADING' | 'RESULTS'>('IDLE');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<RunJobStatus>(EMPTY_JOB_STATUS);
  const [preferences, setPreferences] = useState<ProviderPreferences | null>(null);
  const [showFirstRun, setShowFirstRun] = useState(false);

  const loadLeads = useCallback(async () => {
    const leadsResponse = await fetch('/api/leads');
    const leadsData = await readJson<LeadsResponse>(leadsResponse);
    const nextLeads = leadsData.leads || [];
    setLeads(nextLeads);
    return nextLeads;
  }, []);

  useEffect(() => {
    const loadInitialLeads = async () => {
      try {
        const nextLeads = await loadLeads();
        if (nextLeads.length > 0) {
          setViewState('RESULTS');
        }
      } catch (err) {
        console.error("Failed to fetch initial leads:", err);
      }
    };

    void loadInitialLeads();
  }, [loadLeads]);

  useEffect(() => {
    fetch('/api/settings/preferences')
      .then(res => readJson<ProviderPreferences>(res))
      .then((nextPreferences) => {
        setPreferences(nextPreferences);
        setShowFirstRun(!nextPreferences.provider_priority);
      })
      .catch(err => console.error("Failed to fetch preferences:", err));
  }, []);

  const saveProviderPriority = async (provider: ProviderSource) => {
    try {
      const response = await fetch('/api/settings/preferences', {
        method: 'POST',
        headers: JSON_ACTION_HEADERS,
        body: JSON.stringify({
          provider_priority: provider,
          enabled_providers: preferences?.enabled_providers?.length ? preferences.enabled_providers : DEFAULT_PREFERENCES.enabled_providers,
          max_scan_multiplier: preferences?.max_scan_multiplier ?? DEFAULT_PREFERENCES.max_scan_multiplier,
          twogis_mode: preferences?.twogis_mode ?? DEFAULT_PREFERENCES.twogis_mode,
          twogis_browser: preferences?.twogis_browser ?? DEFAULT_PREFERENCES.twogis_browser,
          twogis_browser_path: preferences?.twogis_browser_path ?? DEFAULT_PREFERENCES.twogis_browser_path,
          twogis_quiet_mode: preferences?.twogis_quiet_mode ?? DEFAULT_PREFERENCES.twogis_quiet_mode,
        }),
      });
      const nextPreferences = await readJson<ProviderPreferences>(response);
      setPreferences(nextPreferences);
      setShowFirstRun(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

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
          const nextLeads = await loadLeads();
          if (isCancelled) return;

          if (nextJob.status === 'FAILED') {
            setError(nextJob.error || 'Сбор завершился ошибкой');
          } else if (nextJob.status === 'RATE_LIMITED') {
            setError(nextJob.result?.error || 'Сбор остановлен: лимит Яндекс Карт');
          }

          setViewState(nextLeads.length > 0 ? 'RESULTS' : 'IDLE');
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
  }, [loadLeads, viewState]);

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

    setLeads(current => current.map(l => l.id === leadId ? { ...l, lead_status: newStatus } : l));
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead({ ...selectedLead, lead_status: newStatus });
    }

    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'POST',
        headers: JSON_ACTION_HEADERS,
        body: JSON.stringify({ status: newStatus })
      });
      
      await readJson<{ success: boolean }>(response);
    } catch (err) {
      setLeads(previousLeads);
      setSelectedLead(previousSelectedLead);
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
    }
  };

  const handleLeadDeleted = (leadId: string) => {
    setLeads(leads.filter(l => l.id !== leadId));
  };

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden text-slate-900 font-sans">
      <Toaster position="bottom-right" richColors />
      {/* Sidebar */}
      <div className="w-80 shrink-0 border-r bg-white flex flex-col z-10 shadow-sm">
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
          <h1 className="font-semibold text-lg flex items-center gap-3 shrink-0">
            Единая база
            {leads.length > 0 && (
              <Badge variant="secondary" className="font-mono text-xs font-semibold">
                <NumberTicker value={leads.length} />
              </Badge>
            )}
          </h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {viewState === 'LOADING' && (
              <ParsingStatus job={jobStatus} onCancel={handleCancelRun} />
            )}
            <SettingsDialog preferences={preferences} onPreferencesChange={setPreferences} />
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

            {viewState === 'IDLE' && leads.length === 0 && (
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

            {(viewState === 'RESULTS' || leads.length > 0) && (
              <LeadsTable leads={leads} onLeadClick={handleLeadClick} />
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
      <Dialog
        open={showFirstRun}
        onOpenChange={(open) => {
          if (open || preferences?.provider_priority) setShowFirstRun(open)
        }}
      >
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Приоритет источника</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-20 flex-col gap-1" onClick={() => void saveProviderPriority('yandex')}>
              <span className="text-base font-semibold">Яндекс</span>
              <span className="text-xs text-muted-foreground">Основная карточка от Яндекса</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-1" onClick={() => void saveProviderPriority('2gis')}>
              <span className="text-base font-semibold">2GIS</span>
              <span className="text-xs text-muted-foreground">Основная карточка от 2GIS</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App
