import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Database, MapPinned, Shield } from "lucide-react"

export type SettingsTabId = "blacklist" | "sources" | "database"

interface SettingsSidebarProps {
  activeTab: SettingsTabId
  onTabChange: (tab: SettingsTabId) => void
}

const TABS = [
  { id: "blacklist", label: "Чёрный список", icon: Shield },
  { id: "sources", label: "Источники", icon: MapPinned },
  { id: "database", label: "База данных", icon: Database },
] as const

export function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
  return (
    <nav className="flex w-14 shrink-0 flex-col gap-1 overflow-y-auto border-r border-slate-200 bg-slate-50 p-2 sm:w-52 sm:p-3">
      <div className="flex flex-col gap-1">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <Button
              key={tab.id}
              variant={isActive ? "secondary" : "ghost"}
              aria-label={tab.label}
              className={cn(
                "h-10 justify-center gap-0 px-2 transition-all duration-200 focus-visible:border-indigo-500 focus-visible:ring-indigo-500/30 sm:justify-start sm:gap-3 sm:px-3",
                isActive
                  ? "bg-white shadow-sm border border-slate-200/60 font-medium text-slate-900"
                  : "font-normal text-slate-600 hover:text-slate-900 hover:bg-slate-100/50"
              )}
              onClick={() => onTabChange(tab.id as SettingsTabId)}
            >
              <Icon className={cn("size-4 shrink-0", isActive ? "text-indigo-600" : "text-slate-400")} />
              <span className="hidden truncate sm:inline">{tab.label}</span>
            </Button>
          )
        })}
      </div>
    </nav>
  )
}
