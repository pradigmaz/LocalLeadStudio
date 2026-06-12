import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Shield, Database } from "lucide-react"

export type SettingsTabId = "blacklist" | "database"

interface SettingsSidebarProps {
  activeTab: SettingsTabId
  onTabChange: (tab: SettingsTabId) => void
}

const TABS = [
  { id: "blacklist", label: "Чёрный список", icon: Shield },
  { id: "database", label: "База данных", icon: Database },
] as const

export function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
  return (
    <nav className="w-[240px] shrink-0 border-r bg-slate-50/30 p-4 flex flex-col gap-1.5 overflow-y-auto">
      <div className="flex flex-col gap-1.5">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <Button
              key={tab.id}
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "justify-start gap-3 px-3 relative transition-all duration-200",
                isActive
                  ? "bg-white shadow-sm border border-slate-200/60 font-medium text-slate-900"
                  : "font-normal text-slate-600 hover:text-slate-900 hover:bg-slate-100/50"
              )}
              onClick={() => onTabChange(tab.id as SettingsTabId)}
            >
              <Icon className={cn("size-4 shrink-0", isActive ? "text-indigo-600" : "text-slate-400")} />
              <span className="truncate">{tab.label}</span>
            </Button>
          )
        })}
      </div>
    </nav>
  )
}
