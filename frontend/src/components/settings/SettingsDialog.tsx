import { lazy, Suspense, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Settings } from 'lucide-react'
import { SettingsSidebar, type SettingsTabId } from './SettingsSidebar'
import type { ProviderPreferences } from '@/types'

const BlacklistTab = lazy(() => import('./tabs/BlacklistTab').then(module => ({ default: module.BlacklistTab })))
const SourcesTab = lazy(() => import('./tabs/SourcesTab').then(module => ({ default: module.SourcesTab })))
const DatabaseTab = lazy(() => import('./tabs/DatabaseTab').then(module => ({ default: module.DatabaseTab })))

interface SettingsDialogProps {
  preferences: ProviderPreferences | null
  onPreferencesChange: (preferences: ProviderPreferences) => void
}

export function SettingsDialog({ preferences, onPreferencesChange }: SettingsDialogProps) {
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

      {/* Широкая модалка с кастомным макетом */}
      <DialogContent className="!max-w-[1400px] w-[95vw] h-[85vh] p-0 flex flex-col overflow-hidden bg-slate-50 gap-0">
        <DialogHeader className="px-6 py-4 border-b bg-white shrink-0">
          <DialogTitle className="text-xl">Настройки</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Контентная область */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white p-6 relative">
            <Suspense fallback={<div className="text-sm text-slate-500">Загрузка раздела...</div>}>
              {activeTab === 'blacklist' && <BlacklistTab />}
              {activeTab === 'sources' && (
                <SourcesTab
                  key={JSON.stringify(preferences)}
                  preferences={preferences}
                  onPreferencesChange={onPreferencesChange}
                />
              )}
              {activeTab === 'database' && <DatabaseTab />}
            </Suspense>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
