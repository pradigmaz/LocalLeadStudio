import type { ReactNode } from "react"
import { Plus, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Area } from "./searchBuilderTypes"

interface SummaryCardProps {
  icon: ReactNode
  title: string
  value: string
  detail: string
  action: string
  onClick: () => void
}

export function SummaryCard({ icon, title, value, detail, action, onClick }: SummaryCardProps) {
  return (
    <button
      type="button"
      className="w-full rounded-lg border bg-white p-3 text-left shadow-xs transition-colors hover:bg-slate-50"
      onClick={onClick}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">{icon}{title}</span>
        <Badge variant="secondary" className="text-xs">{action}</Badge>
      </div>
      <div className="truncate text-sm font-semibold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </button>
  )
}

interface RegionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  regions: Area[]
  selectedRegionNames: string[]
  search: string
  onSearchChange: (value: string) => void
  onToggle: (region: Area) => void
}

export function RegionDialog({ open, onOpenChange, regions, selectedRegionNames, search, onSearchChange, onToggle }: RegionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82vh] p-0 sm:max-w-[460px]">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-base">Выбор региона</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <SearchInput value={search} onChange={onSearchChange} placeholder="Поиск региона..." />
          <SelectedStrip selected={selectedRegionNames} onToggleName={(name) => {
            const region = regions.find((item) => item.name === name)
            if (region) onToggle(region)
          }} />
          <ScrollArea className="mt-3 h-[48vh] rounded-md border">
            <div className="p-2">
              {regions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => onToggle(region)}
                >
                  <Checkbox checked={selectedRegionNames.includes(region.name)} onCheckedChange={() => onToggle(region)} />
                  <span className="min-w-0 flex-1 truncate">{region.name}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface EntityDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  items: string[]
  selected: string[]
  loading?: boolean
  onToggle: (value: string) => void
  customValue: string
  customPlaceholder: string
  onCustomChange: (value: string) => void
  onCustomAdd: () => void
  extraControl?: ReactNode
}

export function EntityDialog(props: EntityDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[86vh] p-0 sm:max-w-[520px]">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-base">{props.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 p-4">
          <SearchInput value={props.search} onChange={props.onSearchChange} placeholder={props.searchPlaceholder} />
          {props.extraControl}
          <div className="flex gap-2">
            <Input
              value={props.customValue}
              onChange={(event) => props.onCustomChange(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && props.onCustomAdd()}
              placeholder={props.customPlaceholder}
              className="h-8 text-xs"
            />
            <Button size="sm" variant="outline" className="h-8" onClick={props.onCustomAdd}>
              <Plus className="size-3.5" />
            </Button>
          </div>
          <SelectedStrip selected={props.selected} onToggleName={props.onToggle} />
          <ScrollArea className="h-[44vh] rounded-md border">
            <div className="space-y-1 p-2">
              {props.loading && <div className="px-2 py-1 text-xs text-slate-400">Загрузка...</div>}
              {props.items.map((item) => {
                const checked = props.selected.includes(item)
                return (
                  <button
                    key={item}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                    onClick={() => props.onToggle(item)}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => props.onToggle(item)} />
                    <span className="min-w-0 flex-1 truncate">{item}</span>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 bg-white pl-8 text-sm"
      />
    </div>
  )
}

function SelectedStrip({ selected, onToggleName }: { selected: string[]; onToggleName: (value: string) => void }) {
  if (selected.length === 0) {
    return <div className="rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-500">Ничего не выбрано</div>
  }

  return (
    <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto rounded-md bg-slate-50 p-2">
      {selected.slice(0, 40).map((item) => (
        <button
          key={item}
          type="button"
          className="rounded-full bg-white px-2 py-1 text-xs text-slate-700 shadow-xs"
          onClick={() => onToggleName(item)}
        >
          {item} ×
        </button>
      ))}
      {selected.length > 40 && <span className="px-2 py-1 text-xs text-slate-500">+{selected.length - 40}</span>}
    </div>
  )
}
