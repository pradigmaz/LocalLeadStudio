import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Settings2 } from "lucide-react"
import type { ProviderPreferences, ProviderSource, RunConfig } from "@/types"
import { SearchBuilderPanel } from "./SearchBuilderPanel"
import type { BuilderState } from "./searchBuilderTypes"

type TabId = "builder" | "manual"

interface SearchFormProps {
  onRun: (config: RunConfig) => Promise<void>
  isLoading: boolean
  preferences: ProviderPreferences | null
}

const FIELD_LABELS = [
  ["sites", "Сайты"],
  ["socials", "Соцсети"],
  ["phones", "Телефоны"],
  ["photos", "Фото"],
] as const

const MAX_SAFE_QUERIES = 40
const MAX_SAFE_PER_QUERY = 10
const MIN_SAFE_DELAY_SECONDS = 8
const DEFAULT_ENABLED_PROVIDERS: ProviderSource[] = ["yandex", "2gis"]

const defaultBuilderState: BuilderState = {
  regionNames: [],
  cities: [],
  niches: [],
}

const defaultConfig = (preferences?: ProviderPreferences | null): RunConfig => ({
  queries: "",
  runName: "lead_search",
  maxQueries: MAX_SAFE_QUERIES,
  maxPerQuery: 10,
  requestDelaySeconds: MIN_SAFE_DELAY_SECONDS,
  minReviews: 1,
  outputDir: "lead_studio_data",
  excludeChains: localStorage.getItem("yamap_blacklist") || "Пятерочка, Магнит, Перекресток, Сбербанк, ВТБ",
  skipWithSite: false,
  keepSitesForRedesign: true,
  requirePhotos: true,
  downloadPhotos: false,
  fields_to_parse: ["sites", "socials", "phones", "photos"],
  providerPriority: preferences?.provider_priority ?? "yandex",
  enabledProviders: preferences?.enabled_providers?.length ? preferences.enabled_providers : DEFAULT_ENABLED_PROVIDERS,
  max_scan_multiplier: preferences?.max_scan_multiplier ?? 5,
})

const normalizeQueryLine = (line: string) => line.replace(/\s+/g, " ").trim()
const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))

const buildQueryStats = (value: string) => {
  const rawLines = value.split("\n")
  const normalized = rawLines.map(normalizeQueryLine).filter(Boolean)
  const unique: string[] = []
  const seen = new Set<string>()
  let duplicates = 0

  normalized.forEach((line) => {
    const key = line.toLowerCase()
    if (seen.has(key)) {
      duplicates += 1
      return
    }
    seen.add(key)
    unique.push(line)
  })

  return {
    rawCount: rawLines.filter((line) => line.trim()).length,
    unique,
    duplicates,
    shortCount: unique.filter((line) => line.split(" ").length < 2).length,
  }
}

export function SearchForm({ onRun, isLoading, preferences }: SearchFormProps) {
  const [builderState, setBuilderState] = useState<BuilderState>(defaultBuilderState)
  const [activeTab, setActiveTab] = useState<TabId>("builder")
  const [showParserOptions, setShowParserOptions] = useState(false)
  const [config, setConfig] = useState<RunConfig>(() => defaultConfig(preferences))

  const builderQueries = useMemo(() => (
    builderState.cities.flatMap((city) =>
      builderState.niches.map((niche) => `${city} ${niche}`)
    ).join("\n")
  ), [builderState.cities, builderState.niches])

  const manualStats = useMemo(() => buildQueryStats(config.queries), [config.queries])
  const manualQueries = manualStats.unique.join("\n")
  const requestedQueries = activeTab === "builder" ? builderQueries : manualQueries
  const safeMaxQueries = clampNumber(config.maxQueries, 1, MAX_SAFE_QUERIES)
  const requestedQueryCount = requestedQueries.split("\n").filter((query) => query.trim()).length
  const limitedQueries = requestedQueries.split("\n").filter((query) => query.trim()).slice(0, safeMaxQueries).join("\n")
  const queryCount = limitedQueries.split("\n").filter((query) => query.trim()).length
  const runConfig = {
    ...config,
    queries: limitedQueries,
    maxQueries: safeMaxQueries,
    maxPerQuery: clampNumber(config.maxPerQuery, 1, MAX_SAFE_PER_QUERY),
    requestDelaySeconds: clampNumber(config.requestDelaySeconds, MIN_SAFE_DELAY_SECONDS, 60),
    providerPriority: preferences?.provider_priority ?? config.providerPriority ?? "yandex",
    enabledProviders: preferences?.enabled_providers?.length
      ? preferences.enabled_providers
      : config.enabledProviders?.length
        ? config.enabledProviders
        : DEFAULT_ENABLED_PROVIDERS,
    max_scan_multiplier: preferences?.max_scan_multiplier ?? config.max_scan_multiplier ?? 5,
  }

  const handleChange = <K extends keyof RunConfig>(field: K, value: RunConfig[K]) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
  }

  const toggleField = (field: string, checked: boolean) => {
    setConfig((prev) => {
      const fields = new Set(prev.fields_to_parse ?? [])
      if (checked) fields.add(field)
      else fields.delete(field)
      return { ...prev, fields_to_parse: Array.from(fields) }
    })
  }

  const cleanManualQueries = () => {
    handleChange("queries", manualQueries)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50/50">
      <div className="shrink-0 border-b bg-white p-4">
        <h2 className="text-lg font-semibold">Конструктор сбора</h2>
        <p className="text-sm text-muted-foreground">География, ниши и параметры запуска</p>
      </div>

      <div className="stable-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="p-4">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)} className="w-full">
            <TabsList className="mb-4 grid w-full grid-cols-2">
              <TabsTrigger value="builder">Конструктор</TabsTrigger>
              <TabsTrigger value="manual">Ручной ввод</TabsTrigger>
            </TabsList>

            <TabsContent value="builder">
              <SearchBuilderPanel value={builderState} onChange={setBuilderState} />
            </TabsContent>

            <TabsContent value="manual" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="queries">Ручной список</Label>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={cleanManualQueries}>
                    Очистить
                  </Button>
                </div>
                <Textarea
                  id="queries"
                  value={config.queries}
                  onChange={(event) => handleChange("queries", event.target.value)}
                  placeholder="Воронеж кафе&#10;Семилуки стоматология"
                  className="min-h-[240px] resize-y bg-white font-mono text-sm"
                />
                <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-slate-600">
                  <div className="rounded-md border bg-white px-2 py-1">{manualStats.rawCount} строк</div>
                  <div className="rounded-md border bg-white px-2 py-1">{manualStats.unique.length} уник.</div>
                  <div className="rounded-md border bg-white px-2 py-1">{manualStats.duplicates} дублей</div>
                </div>
                {manualStats.shortCount > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
                    {manualStats.shortCount} коротких запросов. Лучше писать город + ниша.
                  </div>
                )}
                {manualStats.unique.length > MAX_SAFE_QUERIES && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
                    {manualStats.unique.length} запросов. В запуск уйдут первые {MAX_SAFE_QUERIES}, чтобы не ловить блокировку.
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-5 rounded-lg border bg-white p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-medium text-slate-800"
              onClick={() => setShowParserOptions((value) => !value)}
            >
              <span className="flex items-center gap-2">
                <Settings2 className="size-4 text-slate-500" />
                Параметры сбора
              </span>
              <Badge variant="secondary" className="text-xs">
                {showParserOptions ? "Скрыть" : "Открыть"}
              </Badge>
            </button>

            {showParserOptions && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Запросов за запуск</Label>
                    <Input
                      type="number"
                      min={1}
                      max={MAX_SAFE_QUERIES}
                      value={config.maxQueries}
                      onChange={(event) => handleChange("maxQueries", Number(event.target.value))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Мин. отзывов</Label>
                    <Input
                      type="number"
                      value={config.minReviews}
                      onChange={(event) => handleChange("minReviews", Number(event.target.value))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Карточек / запрос</Label>
                    <Input
                      type="number"
                      min={1}
                      max={MAX_SAFE_PER_QUERY}
                      value={config.maxPerQuery}
                      onChange={(event) => handleChange("maxPerQuery", Number(event.target.value))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-500">Пауза, сек</Label>
                    <Input
                      type="number"
                      min={MIN_SAFE_DELAY_SECONDS}
                      max={60}
                      value={config.requestDelaySeconds}
                      onChange={(event) => handleChange("requestDelaySeconds", Number(event.target.value))}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {FIELD_LABELS.map(([field, label]) => (
                    <label key={field} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                      <Checkbox
                        checked={(config.fields_to_parse ?? []).includes(field)}
                        onCheckedChange={(checked) => toggleField(field, Boolean(checked))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                  <Checkbox
                    checked={config.downloadPhotos}
                    onCheckedChange={(checked) => handleChange("downloadPhotos", Boolean(checked))}
                  />
                  <span>Скачивать фото</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                  <Checkbox
                    checked={config.requirePhotos}
                    onCheckedChange={(checked) => handleChange("requirePhotos", Boolean(checked))}
                  />
                  <span>Только с фото</span>
                </label>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-auto flex shrink-0 flex-col items-center gap-3 border-t bg-white p-4">
        <div className="w-full rounded-md border bg-slate-50 px-2.5 py-1.5 text-center text-[11px] text-slate-600">
          {queryCount} запросов к сбору{requestedQueryCount > queryCount ? ` из ${requestedQueryCount}` : ""}. Источник: {runConfig.providerPriority === "2gis" ? "2GIS" : "Яндекс"}.
        </div>
        <Button
          size="lg"
          className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 font-medium shadow-lg transition-all duration-300 hover:opacity-90 hover:shadow-xl"
          onClick={() => onRun(runConfig)}
          disabled={isLoading || !runConfig.queries.trim()}
        >
          {isLoading ? (
            <span className="flex items-center gap-2 text-white">
              <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Запуск сбора...
            </span>
          ) : (
            <span className="text-base text-white">Запустить сбор</span>
          )}
        </Button>
      </div>
    </div>
  )
}
