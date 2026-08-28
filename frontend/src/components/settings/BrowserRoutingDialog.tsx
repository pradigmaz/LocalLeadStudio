import { useState } from 'react'
import { ChevronLeft, LoaderCircle, MonitorCog, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getErrorMessage } from '@/lib/api'
import {
  getBrowserRoutingApi,
  type BrowserCandidate,
  type BrowserRoutingSettings,
} from '@/lib/browser-routing'

interface BrowserRoutingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onboarding: boolean
  onSettingsChange: (settings: BrowserRoutingSettings) => void
}

const DEFAULT_SETTINGS: BrowserRoutingSettings = {
  onboarding: 'complete',
  mode: 'default',
  browserPath: '',
  browserLabel: '',
}

export function BrowserRoutingDialog({
  open,
  ...props
}: BrowserRoutingDialogProps) {
  if (!open) return null

  return <OpenBrowserRoutingDialog {...props} />
}

function OpenBrowserRoutingDialog({
  onOpenChange,
  onboarding,
  onSettingsChange,
}: Omit<BrowserRoutingDialogProps, 'open'>) {
  const [step, setStep] = useState<'offer' | 'choose'>('offer')
  const [browsers, setBrowsers] = useState<BrowserCandidate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadBrowsers = async () => {
    const api = getBrowserRoutingApi()
    if (!api) {
      setError('Настройка отдельного браузера доступна только в desktop-версии LeadStudio.')
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setBrowsers(await api.listBrowsers())
    } catch (nextError: unknown) {
      setError(getErrorMessage(nextError))
    } finally {
      setIsLoading(false)
    }
  }

  const showBrowserPicker = () => {
    setStep('choose')
    void loadBrowsers()
  }

  const saveSettings = async (nextSettings: BrowserRoutingSettings) => {
    const api = getBrowserRoutingApi()
    if (!api) {
      setError('Настройка отдельного браузера доступна только в desktop-версии LeadStudio.')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const saved = await api.saveSettings(nextSettings)
      onSettingsChange(saved)
      onOpenChange(false)
    } catch (nextError: unknown) {
      setError(getErrorMessage(nextError))
    } finally {
      setIsSaving(false)
    }
  }

  const useDefaultBrowser = () => void saveSettings({ ...DEFAULT_SETTINGS })

  const selectBrowser = (browser: BrowserCandidate) => void saveSettings({
    onboarding: 'complete',
    mode: 'dedicated',
    browserPath: browser.path,
    browserLabel: browser.label,
  })

  const chooseExecutable = async () => {
    const api = getBrowserRoutingApi()
    if (!api) return
    setError(null)
    try {
      const browser = await api.chooseExecutable()
      if (browser) selectBrowser(browser)
    } catch (nextError: unknown) {
      setError(getErrorMessage(nextError))
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="border-slate-200 bg-slate-50 sm:max-w-[36rem]">
        {step === 'offer' ? (
          <>
            <DialogHeader>
              <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <ShieldCheck className="size-6" />
              </div>
              <DialogTitle>{onboarding ? 'Отдельный браузер без VPN' : 'Браузер для специальных ссылок'}</DialogTitle>
              <DialogDescription className="leading-6">
                Яндекс Карты, VK, MAX, сайты и онлайн-запись из карточек можно открывать в отдельном браузере. Остальные ссылки останутся в браузере Windows по умолчанию.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-3 gap-2 sm:justify-between">
              <Button
                variant="outline"
                className="focus-visible:border-indigo-500 focus-visible:ring-indigo-500/30"
                onClick={useDefaultBrowser}
                disabled={isSaving}
              >
                Использовать браузер Windows по умолчанию
              </Button>
              <Button onClick={showBrowserPicker} disabled={isSaving} className="bg-indigo-600 text-white hover:bg-indigo-700">
                Выбрать браузер
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <Button variant="ghost" size="sm" className="-ml-2 w-fit gap-1 text-slate-600" onClick={() => setStep('offer')}>
                <ChevronLeft className="size-4" />
                Назад
              </Button>
              <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                <MonitorCog className="size-6" />
              </div>
              <DialogTitle>Выберите отдельный браузер</DialogTitle>
              <DialogDescription>
                Для Яндекс Карт, VK, MAX, сайтов и онлайн-записи. Yandex Browser рекомендуется для работы без VPN.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                  <LoaderCircle className="size-4 animate-spin" />
                  Ищем установленные браузеры...
                </div>
              ) : browsers.length > 0 ? (
                browsers.map((browser) => (
                  <Button
                    key={browser.path}
                    variant="outline"
                    className="h-auto w-full justify-between gap-3 border-slate-200 bg-white px-4 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50"
                    onClick={() => selectBrowser(browser)}
                    disabled={isSaving}
                  >
                    <span className="min-w-0 truncate font-medium text-slate-900">{browser.label}</span>
                    {browser.recommended && <span className="shrink-0 text-xs font-medium text-indigo-700">Рекомендуем</span>}
                  </Button>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-sm leading-6 text-slate-600">
                  Подходящий браузер не найден автоматически. Укажите файл браузера вручную.
                </p>
              )}
            </div>

            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <DialogFooter className="mt-3 gap-2 sm:justify-between">
              <Button variant="outline" onClick={chooseExecutable} disabled={isSaving}>
                Указать файл .exe
              </Button>
              <Button variant="ghost" onClick={useDefaultBrowser} disabled={isSaving}>
                Использовать по умолчанию
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
