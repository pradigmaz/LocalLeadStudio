import { lazy, Suspense, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Settings } from 'lucide-react'
import { SettingsSidebar, type SettingsTabId } from './SettingsSidebar'

const BlacklistTab = lazy(() => import('./tabs/BlacklistTab').then(module => ({ default: module.BlacklistTab })))
const PresetsTab = lazy(() => import('./tabs/PresetsTab').then(module => ({ default: module.PresetsTab })))
const DatabaseTab = lazy(() => import('./tabs/DatabaseTab').then(module => ({ default: module.DatabaseTab })))
const ParsingRulesTab = lazy(() => import('./tabs/ParsingRulesTab').then(module => ({ default: module.ParsingRulesTab })))

export function SettingsDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTabId>("parsing_rules")

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
          <DialogTitle className="text-xl">Настройки поиска</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Контентная область */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden bg-white p-6 relative">
            <Suspense fallback={<div className="text-sm text-slate-500">Загрузка раздела...</div>}>
              {activeTab === 'blacklist' && <BlacklistTab />}
              {activeTab === 'presets' && <PresetsTab />}
              {activeTab === 'database' && <DatabaseTab />}
              {activeTab === 'parsing_rules' && <ParsingRulesTab />}
            </Suspense>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
