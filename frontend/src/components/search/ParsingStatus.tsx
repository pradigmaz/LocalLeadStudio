import { useEffect, useMemo, useState } from "react"
import { Activity, Clock3, Loader2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { RunJobStatus } from "@/types"

interface ParsingStatusProps {
  job: RunJobStatus
  onCancel: () => Promise<void>
}

const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const rest = safeSeconds % 60
  return `${minutes}:${rest.toString().padStart(2, "0")}`
}

const getElapsedSeconds = (startedAt: string | null | undefined, now: number) => {
  if (!startedAt) return 0
  const started = new Date(startedAt).getTime()
  if (Number.isNaN(started)) return 0
  return (now - started) / 1000
}

export function ParsingStatus({ job, onCancel }: ParsingStatusProps) {
  const [now, setNow] = useState(() => Date.now())
  const [isCancelling, setIsCancelling] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const elapsedSeconds = getElapsedSeconds(job.started_at, now)

  const progress = useMemo(() => {
    const total = job.query_total || 0
    if (!total) return 0
    return Math.min(100, Math.round(((job.query_index || 0) / total) * 100))
  }, [job.query_index, job.query_total])

  const isStopping = job.status === "CANCEL_REQUESTED"
  const currentQuery = job.current_query?.trim() || "Подготовка запроса"
  const providerLabel = job.current_provider === "2gis" ? "2GIS" : job.current_provider === "yandex" ? "Яндекс" : "Источник"

  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      await onCancel()
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <section
      role="status"
      aria-live="polite"
      className="relative flex w-[480px] flex-col gap-1.5 rounded-lg border border-indigo-100 bg-white/95 px-3 py-2 text-slate-700 shadow-sm"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
          {isStopping ? <Activity className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 text-sm font-medium text-slate-900">
              {isStopping ? "Останавливаю сбор" : "Идет парсинг"}
            </span>
            <Badge variant="outline" className="h-5 shrink-0 rounded-md border-indigo-100 bg-indigo-50 px-1.5 text-[11px] text-indigo-700">
              {job.query_index || 0}/{job.query_total || 0}
            </Badge>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
              <Clock3 className="size-3" />
              {formatDuration(elapsedSeconds)}
            </span>
            <span className="truncate text-xs text-slate-500">{currentQuery}</span>
          </div>
          <div className="flex min-w-0 items-center gap-3 overflow-hidden whitespace-nowrap text-xs text-slate-500">
            <span>{providerLabel} {job.provider_index || 0}/{job.provider_total || 0}</span>
            <span>прсм. {job.scan_count || 0}</span>
            <span>созд. {job.created_count || 0}</span>
            <span>доп. {job.enriched_count || 0}</span>
            <span>без изм. {job.existing_count || 0}</span>
          </div>
          {job.blocked_source && (
            <div className="mt-0.5 truncate text-xs font-medium text-amber-700">
              Блокировка источника: {job.blocked_source === "2gis" ? "2GIS" : job.blocked_source}
            </div>
          )}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-0.5 text-right text-xs leading-4 text-slate-500">
          <span>сохр. {job.saved_count || 0}</span>
          <span>проп. {job.skipped_count || 0}</span>
          <span>дубли {job.duplicate_count || 0}</span>
          <span className={(job.error_count || 0) > 0 ? "text-red-600" : ""}>ошибки {job.error_count || 0}</span>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="Остановить сбор"
          aria-label="Остановить сбор"
          onClick={handleCancel}
          disabled={isStopping || isCancelling}
          className="size-7 shrink-0 text-slate-500 hover:text-red-600"
        >
          <XCircle className="size-4" />
        </Button>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </section>
  )
}
