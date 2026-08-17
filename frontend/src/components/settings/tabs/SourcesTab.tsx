import { useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getErrorMessage, JSON_ACTION_HEADERS, readJson } from '@/lib/api'
import type { ProviderPreferences } from '@/types'

interface SourcesTabProps {
  preferences: ProviderPreferences | null
  onPreferencesChange: (preferences: ProviderPreferences) => void
}

const clampMultiplier = (value: number) => Math.max(1, Math.min(20, Number.isFinite(value) ? value : 5))

export function SourcesTab({ preferences, onPreferencesChange }: SourcesTabProps) {
  const [maxScanMultiplier, setMaxScanMultiplier] = useState(preferences?.max_scan_multiplier ?? 5)
  const [isSaving, setIsSaving] = useState(false)

  const save = async () => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/settings/preferences', {
        method: 'POST',
        headers: JSON_ACTION_HEADERS,
        body: JSON.stringify({
          max_scan_multiplier: clampMultiplier(maxScanMultiplier),
        }),
      })
      if (response.status === 404) {
        throw new Error('API настроек не найден. Перезапустите backend/dev-сервер.')
      }
      const nextPreferences = await readJson<ProviderPreferences>(response)
      onPreferencesChange(nextPreferences)
      setMaxScanMultiplier(nextPreferences.max_scan_multiplier)
      toast.success('Настройки поиска сохранены')
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
      className="flex min-h-0 max-w-xl flex-1 flex-col gap-5 overflow-y-auto pr-1 pb-1"
    >
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Источники</h3>
        <p className="mt-1 text-sm text-slate-500">
          Поиск ведётся через Яндекс Карты.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">Глубина сканирования</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={maxScanMultiplier}
              onChange={(event) => setMaxScanMultiplier(Number(event.target.value))}
              className="w-32 bg-white"
            />
            <p className="text-xs leading-5 text-slate-500">
              Поле "Карточек / запрос" умножается на это число, минимум 30 и максимум 100 просмотренных позиций.
            </p>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button onClick={save} disabled={isSaving} className="bg-indigo-600 text-white hover:bg-indigo-700">
              {isSaving ? 'Сохранение...' : 'Сохранить настройки'}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
