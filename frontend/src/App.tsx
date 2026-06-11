import { useState, useEffect } from "react"
import { SearchForm } from '@/components/search/SearchForm'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { LeadModal } from '@/components/leads/LeadModal'
import { SettingsDialog } from '@/components/settings/SettingsDialog'
import { Badge } from "@/components/ui/badge"
import { Toaster } from "@/components/ui/sonner"
import type { Lead, RunConfig, RunResult } from '@/types'
import { NumberTicker } from "@/components/ui/number-ticker"
import { getErrorMessage, readJson } from "@/lib/api"

interface LeadsResponse {
  leads?: Lead[];
  error?: string;
}

function App() {
  const [viewState, setViewState] = useState<'IDLE' | 'LOADING' | 'RESULTS'>('IDLE');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/leads')
      .then(res => readJson<LeadsResponse>(res))
      .then((data) => {
        if (data.leads && data.leads.length > 0) {
          setLeads(data.leads);
          setViewState('RESULTS');
        }
      })
      .catch(err => console.error("Failed to fetch initial leads:", err));
  }, []);

  const handleRun = async (config: RunConfig) => {
    try {
      setViewState('LOADING');
      setError(null);
      
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
      });
      
      await readJson<RunResult>(response);

      const leadsResponse = await fetch('/api/leads');
      const leadsData = await readJson<LeadsResponse>(leadsResponse);
      
      if (leadsData.leads) {
        setLeads(leadsData.leads);
        setViewState('RESULTS');
      }
      
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setViewState('IDLE');
    }
  };

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    // Оптимистичное обновление UI (для мгновенной реакции и анимации)
    const previousLeads = [...leads];
    const previousSelectedLead = selectedLead;

    setLeads(leads.map(l => l.id === leadId ? { ...l, lead_status: newStatus } : l));
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead({ ...selectedLead, lead_status: newStatus });
    }

    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      
      await readJson<{ success: boolean }>(response);
    } catch (err) {
      setLeads(previousLeads);
      setSelectedLead(previousSelectedLead);
      setError(getErrorMessage(err));
    }
  };

  const handlePriorityChange = async (leadId: string, priority: number) => {
    const previousLeads = [...leads];
    const previousSelectedLead = selectedLead;

    setLeads(leads.map(l => l.id === leadId ? { ...l, priority } : l));
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead({ ...selectedLead, priority });
    }

    try {
      const response = await fetch(`/api/leads/${leadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          <SearchForm onRun={handleRun} isLoading={viewState === 'LOADING'} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <header className="h-14 border-b bg-white flex items-center px-8 justify-between shrink-0 shadow-sm z-10">
          <h1 className="font-semibold text-lg flex items-center gap-3">
            Единая база
            {leads.length > 0 && (
              <Badge variant="secondary" className="font-mono text-xs font-semibold">
                <NumberTicker value={leads.length} />
              </Badge>
            )}
          </h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {viewState === 'LOADING' && (
              <span className="flex items-center gap-2 text-primary">
                <span className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></span>
                Идет парсинг...
              </span>
            )}
            <SettingsDialog />
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
              <LeadsTable leads={leads} onLeadClick={setSelectedLead} />
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
