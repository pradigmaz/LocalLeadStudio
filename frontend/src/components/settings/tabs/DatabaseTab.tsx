import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Download, Upload, AlertTriangle } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { getApiErrorMessage, getErrorMessage, LOCAL_ACTION_HEADERS, readJson } from '@/lib/api'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface ApiError {
  error?: string;
  detail?: unknown;
}

export function DatabaseTab() {
  const [isCleaning, setIsCleaning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleResetDB = async () => {
    setIsCleaning(true)
    try {
      const res = await fetch('/api/settings/reset_db', { method: 'POST', headers: LOCAL_ACTION_HEADERS })
      await readJson<{ success: boolean }>(res)
      toast.success("База данных полностью сброшена.")
      window.location.reload()
    } catch (e: unknown) {
      toast.error(`Ошибка при сбросе БД: ${getErrorMessage(e)}`)
    } finally {
      setIsCleaning(false)
    }
  }

  const handleExportDB = () => {
    window.location.href = '/api/settings/export'
  }

  const handleImportDB = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsCleaning(true)
    try {
      const buffer = await file.arrayBuffer()
      const res = await fetch('/api/settings/import', {
        method: 'POST',
        body: buffer,
        headers: { 'Content-Type': 'application/octet-stream', ...LOCAL_ACTION_HEADERS }
      })
      const data: ApiError = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success("База данных успешно импортирована.")
        window.location.reload()
      } else {
        toast.error(`Ошибка при импорте БД: ${getApiErrorMessage(data, res.statusText)}`)
      }
    } catch (e: unknown) {
      toast.error(`Ошибка сети: ${getErrorMessage(e)}`)
    } finally {
      setIsCleaning(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
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
        <h3 className="text-lg font-semibold text-slate-900">Управление базой данных</h3>
        <p className="text-sm text-slate-500 mt-1">
          Экспорт, импорт или полный сброс локальной SQLite базы данных.
        </p>
      </div>

      <div className="grid gap-4 mt-2">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-4 flex flex-col gap-3">
            <h4 className="font-medium text-slate-900">Экспорт / Импорт БД</h4>
            <p className="text-sm text-slate-500 mb-2">Скачать базу данных для бекапа или загрузить резервную копию.</p>
            <div className="flex gap-3">
              <Button onClick={handleExportDB} className="flex-1 bg-slate-900 text-white hover:bg-slate-800">
                <Download className="size-4 mr-2" />
                Скачать (.db)
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => fileInputRef.current?.click()} disabled={isCleaning}>
                <Upload className="size-4 mr-2" />
                Загрузить (.db)
              </Button>
              <input type="file" accept=".db" className="hidden" ref={fileInputRef} onChange={handleImportDB} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-200 shadow-sm bg-red-50/50">
          <CardContent className="p-4 flex flex-col gap-3">
            <h4 className="font-medium text-red-900 flex items-center gap-2">
              <AlertTriangle className="size-4" /> Опасная зона
            </h4>
            <p className="text-sm text-red-800/80 mb-2">
              Полный сброс БД. Все спарсенные данные, организации, лиды и история будут безвозвратно удалены.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">Удалить всю базу данных</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-red-600">Внимание! Полный сброс</AlertDialogTitle>
                  <AlertDialogDescription>Вы уверены? Это действие уничтожит ВСЕ собранные данные в приложении.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetDB} className="bg-red-600 hover:bg-red-700">Я уверен, сбросить БД</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
