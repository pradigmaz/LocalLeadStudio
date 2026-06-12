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
      className="min-w-[460px] max-w-[720px] rounded-md border border-indigo-100 bg-white/90 px-3 py-2 text-slate-700 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
          {isStopping ? <Activity className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">
              {isStopping ? "Останавливаю сбор" : "Идет парсинг"}
            </span>
            <Badge variant="outline" className="rounded-md border-indigo-100 bg-indigo-50 text-indigo-700">
              {job.query_index || 0}/{job.query_total || 0}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <Clock3 className="size-3" />
              {formatDuration(elapsedSeconds)}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-slate-500">{currentQuery}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-right text-[11px] leading-4 text-slate-500">
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
          className="text-slate-500 hover:text-red-600"
        >
          <XCircle className="size-4" />
        </Button>
      </div>
    </section>
  )
}
