import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getErrorMessage, JSON_ACTION_HEADERS, readJson } from '@/lib/api'
import type { ProviderPreferences, ProviderSource } from '@/types'

interface SourcesTabProps {
  preferences: ProviderPreferences | null
  onPreferencesChange: (preferences: ProviderPreferences) => void
}

const DEFAULT_PREFERENCES: ProviderPreferences = {
  provider_priority: 'yandex',
  enabled_providers: ['yandex', '2gis'],
  max_scan_multiplier: 5,
  twogis_mode: 'browser',
  twogis_browser: 'auto',
  twogis_browser_path: '',
  twogis_quiet_mode: true,
}
const SOURCE_LABELS: Record<ProviderSource, string> = {
  yandex: 'Яндекс Карты',
  '2gis': '2GIS',
}

const clampMultiplier = (value: number) => Math.max(1, Math.min(20, Number.isFinite(value) ? value : 5))

export function SourcesTab({ preferences, onPreferencesChange }: SourcesTabProps) {
  const [form, setForm] = useState<ProviderPreferences>(preferences ?? DEFAULT_PREFERENCES)
  const [isSaving, setIsSaving] = useState(false)

  const toggleProvider = (source: ProviderSource, checked: boolean) => {
    setForm((prev) => {
      const enabled = new Set(prev.enabled_providers)
      if (checked) enabled.add(source)
      else enabled.delete(source)
      const enabledProviders = Array.from(enabled) as ProviderSource[]
      const safeEnabled = enabledProviders.length ? enabledProviders : [source]
      const providerPriority = safeEnabled.includes(prev.provider_priority ?? 'yandex')
        ? prev.provider_priority ?? 'yandex'
        : safeEnabled[0]
      return { ...prev, enabled_providers: safeEnabled, provider_priority: providerPriority }
    })
  }

  const save = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/settings/preferences', {
        method: 'POST',
        headers: JSON_ACTION_HEADERS,
        body: JSON.stringify({
          provider_priority: form.provider_priority ?? 'yandex',
          enabled_providers: form.enabled_providers,
          max_scan_multiplier: clampMultiplier(form.max_scan_multiplier),
          twogis_mode: 'browser',
          twogis_browser: form.twogis_browser || 'auto',
          twogis_browser_path: form.twogis_browser_path || '',
          twogis_quiet_mode: form.twogis_quiet_mode,
        }),
      })
      if (response.status === 404) {
        throw new Error('API настроек не найден. Перезапустите backend/dev-сервер.')
      }
      const nextPreferences = await readJson<ProviderPreferences>(response)
      onPreferencesChange(nextPreferences)
      setForm(nextPreferences)
      toast.success('Источники сохранены')
    } catch (error: unknown) {
      toast.error(`Ошибка сохранения: ${getErrorMessage(error)}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-2 pb-4"
    >
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Источники</h3>
        <p className="mt-1 text-sm text-slate-500">
          Приоритет задаёт, чей результат первым создаёт карточку. Второй источник только дополняет пустые поля.
        </p>
      </div>

      <div className="grid max-w-2xl gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-700">Приоритет</Label>
          <Select
            value={form.provider_priority ?? 'yandex'}
            onValueChange={(value) => setForm((prev) => ({ ...prev, provider_priority: value as ProviderSource }))}
          >
            <SelectTrigger className="w-full bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {form.enabled_providers.map((source) => (
                <SelectItem key={source} value={source}>{SOURCE_LABELS[source]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-700">Активные источники</Label>
          <div className="grid grid-cols-2 gap-2">
            {(['yandex', '2gis'] as ProviderSource[]).map((source) => (
              <label key={source} className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
                <Checkbox
                  checked={form.enabled_providers.includes(source)}
                  onCheckedChange={(checked) => toggleProvider(source, Boolean(checked))}
                />
                <span>{SOURCE_LABELS[source]}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-700">Глубина сканирования</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={form.max_scan_multiplier}
            onChange={(event) => setForm((prev) => ({ ...prev, max_scan_multiplier: Number(event.target.value) }))}
            className="w-32 bg-white"
          />
          <p className="text-xs text-slate-500">
            Поле "Карточек / запрос" умножается на это число, минимум 30 и максимум 100 просмотренных позиций.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-slate-700">Браузер 2GIS</Label>
          <Select
            value={form.twogis_browser || 'auto'}
            onValueChange={(value) => setForm((prev) => ({ ...prev, twogis_browser: value }))}
          >
            <SelectTrigger className="w-full bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Авто: все найденные браузеры</SelectItem>
              <SelectItem value="chrome">Google Chrome</SelectItem>
              <SelectItem value="edge">Microsoft Edge</SelectItem>
              <SelectItem value="yandex">Яндекс Браузер</SelectItem>
              <SelectItem value="opera">Opera</SelectItem>
              <SelectItem value="opera_gx">Opera GX</SelectItem>
              <SelectItem value="brave">Brave</SelectItem>
              <SelectItem value="vivaldi">Vivaldi</SelectItem>
              <SelectItem value="firefox">Mozilla Firefox</SelectItem>
              <SelectItem value="safari">Safari / WebKit</SelectItem>
              <SelectItem value="custom">Свой путь</SelectItem>
            </SelectContent>
          </Select>
          {form.twogis_browser === 'custom' && (
            <Input
              value={form.twogis_browser_path || ''}
              onChange={(event) => setForm((prev) => ({ ...prev, twogis_browser_path: event.target.value }))}
              placeholder="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
              className="bg-white font-mono text-xs"
            />
          )}
        </div>

        <label className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
          <Checkbox
            checked={form.twogis_quiet_mode ?? true}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, twogis_quiet_mode: Boolean(checked) }))}
          />
          <span>Тихий запуск 2GIS: окно уводится за экран</span>
        </label>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          2GIS v1 работает через отдельный профиль браузера. Авто ищет Chrome, Edge, Яндекс, Opera, Brave, Vivaldi, Firefox и WebKit.
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={isSaving} className="bg-indigo-600 text-white hover:bg-indigo-700">
          {isSaving ? 'Сохранение...' : 'Сохранить источники'}
        </Button>
      </div>
    </motion.div>
  )
}
