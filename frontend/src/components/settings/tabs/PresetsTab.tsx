import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Trash2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown } from 'lucide-react'

interface Preset {
  id: string;
  name: string;
  type?: string;
  cities?: string[];
  niches?: string[];
  queries?: string;
}

const loadPresets = () => {
  const stored = localStorage.getItem('yamap_presets_json')
  if (!stored) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed as Preset[] : []
  } catch {
    return []
  }
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Неизвестная ошибка'

export function PresetsTab() {
  const [presets, setPresets] = useState<Preset[]>(loadPresets)
  const [rawJson, setRawJson] = useState(() => JSON.stringify(loadPresets(), null, 2))

  const handleDelete = (id: string) => {
    if (!window.confirm("Удалить этот пресет? Отменить действие будет нельзя.")) return
    const updated = presets.filter(p => p.id !== id)
    setPresets(updated)
    setRawJson(JSON.stringify(updated, null, 2))
    localStorage.setItem('yamap_presets_json', JSON.stringify(updated))
    window.dispatchEvent(new Event('yamap_presets_updated'))
    toast.success("Пресет удалён")
  }

  const handleSaveJson = () => {
    try {
      const parsed = JSON.parse(rawJson)
      if (!Array.isArray(parsed)) throw new Error("Пресеты должны быть массивом JSON")
      setPresets(parsed)
      localStorage.setItem('yamap_presets_json', JSON.stringify(parsed))
      window.dispatchEvent(new Event('yamap_presets_updated'))
      toast.success("Пресеты успешно обновлены!")
    } catch (e: unknown) {
      toast.error(`Ошибка разбора JSON: ${getErrorMessage(e)}`)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-4 flex-1 overflow-y-auto min-h-0 pr-2 pb-4"
    >
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Ваши пресеты</h3>
        <p className="text-sm text-slate-500 mt-1">
          Здесь хранятся сохраненные настройки парсинга для быстрого запуска.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pr-2">
        {presets.map(p => (
          <Card key={p.id} className="shadow-sm border-slate-200">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium text-slate-900">{p.name}</div>
                <div className="text-sm text-slate-500 mt-0.5">
                  {p.type === 'constructor'
                    ? `${p.cities?.join(', ') || 'нет городов'} / ${p.niches?.join(', ') || 'нет ниш'}`
                    : `${p.queries?.split('\n').filter(Boolean).length || 0} запросов`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-red-500 hover:bg-red-50 hover:text-red-600"
                onClick={() => handleDelete(p.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {presets.length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
            У вас пока нет сохраненных пресетов
          </div>
        )}
      </div>

      <Collapsible className="border border-slate-200 rounded-lg overflow-hidden shrink-0 mt-4 bg-slate-50">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between p-4 h-auto font-medium hover:bg-slate-100 rounded-none">
            Управление через JSON (Экспорт/Импорт)
            <ChevronDown className="size-4 text-slate-400" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t border-slate-200 bg-white">
          <Textarea
            value={rawJson}
            onChange={e => setRawJson(e.target.value)}
            className="font-mono text-xs min-h-[200px]"
          />
          <Button onClick={handleSaveJson} className="mt-3 w-full bg-slate-900 text-white hover:bg-slate-800">
            Применить JSON
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </motion.div>
  )
}
