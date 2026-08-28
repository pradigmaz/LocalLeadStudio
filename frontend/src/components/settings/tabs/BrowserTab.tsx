import { useState } from 'react'
import { motion } from 'framer-motion'
import { MonitorCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrowserRoutingDialog } from '@/components/settings/BrowserRoutingDialog'
import { type BrowserRoutingSettings } from '@/lib/browser-routing'

interface BrowserTabProps {
  settings: BrowserRoutingSettings | null
  onSettingsChange: (settings: BrowserRoutingSettings) => void
}

export function BrowserTab({ settings, onSettingsChange }: BrowserTabProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const usesDedicatedBrowser = settings?.mode === 'dedicated'
  const currentBrowser = usesDedicatedBrowser ? settings?.browserLabel || 'Выбранный браузер' : 'Браузер Windows по умолчанию'

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex min-h-0 max-w-xl flex-1 flex-col gap-5 overflow-y-auto pr-1 pb-1"
      >
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Браузер</h3>
          <p className="mt-1 text-sm text-slate-500">
            Отдельный браузер применяется только к Яндекс Картам, VK, MAX, сайтам и онлайн-записи из карточек.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <MonitorCog className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-slate-900">{currentBrowser}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {usesDedicatedBrowser
                  ? 'Остальные ссылки открываются браузером Windows по умолчанию.'
                  : 'Все ссылки открываются браузером Windows по умолчанию.'}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Button onClick={() => setIsPickerOpen(true)} className="bg-indigo-600 text-white hover:bg-indigo-700">
              {usesDedicatedBrowser ? 'Изменить браузер' : 'Выбрать отдельный браузер'}
            </Button>
          </div>
        </div>
      </motion.div>

      <BrowserRoutingDialog
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        onboarding={false}
        onSettingsChange={onSettingsChange}
      />
    </>
  )
}
