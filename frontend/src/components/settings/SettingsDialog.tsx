import { lazy, Suspense, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Settings } from 'lucide-react'
import { SettingsSidebar, type SettingsTabId } from './SettingsSidebar'
import type { ProviderPreferences } from '@/types'
import type { BrowserRoutingSettings } from '@/lib/browser-routing'

const BlacklistTab = lazy(() => import('./tabs/BlacklistTab').then(module => ({ default: module.BlacklistTab })))
const SourcesTab = lazy(() => import('./tabs/SourcesTab').then(module => ({ default: module.SourcesTab })))
const BrowserTab = lazy(() => import('./tabs/BrowserTab').then(module => ({ default: module.BrowserTab })))
const DatabaseTab = lazy(() => import('./tabs/DatabaseTab').then(module => ({ default: module.DatabaseTab })))

interface SettingsDialogProps {
  preferences: ProviderPreferences | null
  onPreferencesChange: (preferences: ProviderPreferences) => void
  browserRouting: BrowserRoutingSettings | null
  onBrowserRoutingChange: (settings: BrowserRoutingSettings) => void
}

export function SettingsDialog({
  preferences,
  onPreferencesChange,
  browserRouting,
  onBrowserRoutingChange,
}: SettingsDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTabId>("blacklist")

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 shrink-0">
          <Settings className="size-4" />
          Настройки
        </Button>
      </DialogTrigger>

      <DialogContent className="flex h-[min(680px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-5xl! flex-col gap-0 overflow-hidden border-slate-200 bg-slate-50 p-0 shadow-2xl">
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <DialogTitle className="text-lg">Настройки</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-100/80 p-4 sm:p-6">
            <Suspense fallback={<div className="text-sm text-slate-500">Загрузка раздела...</div>}>
              {activeTab === 'blacklist' && <BlacklistTab />}
              {activeTab === 'sources' && (
                <SourcesTab
                  key={JSON.stringify(preferences)}
                  preferences={preferences}
                  onPreferencesChange={onPreferencesChange}
                />
              )}
              {activeTab === 'browser' && (
                <BrowserTab settings={browserRouting} onSettingsChange={onBrowserRoutingChange} />
              )}
              {activeTab === 'database' && <DatabaseTab />}
            </Suspense>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
