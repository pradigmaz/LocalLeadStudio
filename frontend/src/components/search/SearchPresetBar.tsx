import { useState } from "react"
import { BookmarkPlus, Save } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type TabId = "builder" | "manual"

export interface Preset {
  id: string
  name: string
  type: TabId | "constructor"
  region?: string
  cities?: string[]
  niches?: string[]
  queries?: string
  minReviews?: number
  maxPerQuery?: number
  downloadPhotos?: boolean
  requirePhotos?: boolean
  fields_to_parse?: string[]
}

interface SearchPresetBarProps {
  activePresetId: string
  presets: Preset[]
  newPresetName: string
  onSelectPreset: (presetId: string) => void
  onPresetNameChange: (value: string) => void
  onSavePreset: () => void
}

export function SearchPresetBar({
  activePresetId,
  presets,
  newPresetName,
  onSelectPreset,
  onPresetNameChange,
  onSavePreset,
}: SearchPresetBarProps) {
  const [isSaveOpen, setIsSaveOpen] = useState(false)

  const handleSave = () => {
    onSavePreset()
    if (newPresetName.trim()) setIsSaveOpen(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="mb-4 flex flex-col gap-2 rounded-lg border bg-white p-3 shadow-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <BookmarkPlus className="size-4" />
          <span>Сценарий</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => setIsSaveOpen((value) => !value)}
        >
          {isSaveOpen ? "Скрыть" : "Сохранить"}
        </Button>
      </div>

      <Select value={activePresetId} onValueChange={onSelectPreset}>
        <SelectTrigger className="h-9 bg-background text-xs">
          <SelectValue placeholder="Без сценария" />
        </SelectTrigger>
        <SelectContent className="bg-popover text-xs">
          <SelectItem value="custom_empty">Без сценария</SelectItem>
          {presets.map((preset) => (
            <SelectItem key={preset.id} value={preset.id}>
              {preset.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isSaveOpen && (
        <div className="flex gap-2">
          <Input
            placeholder="Название сценария"
            value={newPresetName}
            onChange={(event) => onPresetNameChange(event.target.value)}
            className="h-8 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1.5 text-xs"
            onClick={handleSave}
          >
            <Save className="size-3.5" />
            OK
          </Button>
        </div>
      )}
    </motion.div>
  )
}
