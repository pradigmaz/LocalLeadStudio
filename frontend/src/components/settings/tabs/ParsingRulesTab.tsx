import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight, Plus, Settings2, MapPin, Building2, Search } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

interface Area {
  id: string;
  parent_id?: string;
  name: string;
  city_count?: number;
  areas?: Area[];
}

type StoredPreset = {
  id: string;
  name: string;
  type: "constructor";
  region: string;
  cities: string[];
  niches: string[];
  minReviews: number;
  maxPerQuery: number;
  downloadPhotos: boolean;
  requirePhotos: boolean;
  fields_to_parse: string[];
};

let cachedCategories: string[] | null = null;
const cachedRegionsByMode = new Map<string, Area[]>();

export function ParsingRulesTab() {
  const [includeSmallSettlements, setIncludeSmallSettlements] = useState(false)
  const initialRegionMode = includeSmallSettlements ? "all" : "compact"
  const [categories, setCategories] = useState<string[]>(() => cachedCategories ?? [])
  const [areas, setAreas] = useState<Area[]>(() => cachedRegionsByMode.get(initialRegionMode) ?? [])
  const [loading, setLoading] = useState(() => !(cachedCategories && cachedRegionsByMode.has(initialRegionMode)))
  const [searchAreas, setSearchAreas] = useState<Area[]>([])
  const [searchingCities, setSearchingCities] = useState(false)

  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set())
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [openRegionIds, setOpenRegionIds] = useState<Set<string>>(new Set())
  const [loadingRegionIds, setLoadingRegionIds] = useState<Set<string>>(new Set())

  const [searchRegion, setSearchRegion] = useState("")
  const [searchCat, setSearchCat] = useState("")
  const [customCity, setCustomCity] = useState("")
  const [customCat, setCustomCat] = useState("")

  // Form options
  const [options, setOptions] = useState({
    parseSites: true,
    parseSocials: true,
    parsePhotos: true,
    parsePhones: true,
    minReviews: 0,
    maxPerQuery: 50
  })

  const normalizedRegionSearch = searchRegion.trim().toLowerCase()
  const isSearchingRegions = normalizedRegionSearch.length > 0
  const normalizedCategorySearch = searchCat.trim().toLowerCase()
  const regionMode = includeSmallSettlements ? "all" : "compact"
  const smallParam = includeSmallSettlements ? "&include_small=true" : ""

  useEffect(() => {
    const cachedRegions = cachedRegionsByMode.get(regionMode)
    if (cachedCategories && cachedRegions) {
      queueMicrotask(() => {
        setCategories(cachedCategories ?? [])
        setAreas(cachedRegions)
        setLoading(false)
      })
      return
    }

    const controller = new AbortController()
    queueMicrotask(() => setLoading(true))
    Promise.all([
      cachedCategories
        ? Promise.resolve(cachedCategories)
        : fetch('/api/settings/categories', { signal: controller.signal }).then(r => r.json()),
      fetch(`/api/settings/cities?summary=true${smallParam}`, { signal: controller.signal }).then(r => r.json())
    ]).then(([cats, cityData]) => {
      const nextCategories = Array.isArray(cats) ? cats : Object.keys(cats)
      const nextRegions = Array.isArray(cityData.areas) ? cityData.areas : []
      cachedCategories = nextCategories
      cachedRegionsByMode.set(regionMode, nextRegions)
      setCategories(nextCategories)
      setAreas(nextRegions)
      setLoading(false)
    }).catch((error) => {
      if (error.name !== 'AbortError') console.error(error)
      setLoading(false)
    })

    return () => controller.abort()
  }, [regionMode, smallParam])

  useEffect(() => {
    if (!normalizedRegionSearch) {
      queueMicrotask(() => {
        setSearchAreas([])
        setSearchingCities(false)
      })
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setSearchingCities(true)
      fetch(
        `/api/settings/cities?q=${encodeURIComponent(normalizedRegionSearch)}&limit_regions=80&limit_cities=200${smallParam}`,
        { signal: controller.signal },
      )
        .then(r => r.json())
        .then(data => setSearchAreas(Array.isArray(data.areas) ? data.areas : []))
        .catch((error) => {
          if (error.name !== 'AbortError') console.error(error)
        })
        .finally(() => setSearchingCities(false))
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [normalizedRegionSearch, smallParam])

  const toggleCity = (city: string) => {
    const next = new Set(selectedCities)
    if (next.has(city)) next.delete(city)
    else next.add(city)
    setSelectedCities(next)
  }

  const toggleCategory = (cat: string) => {
    const next = new Set(selectedCategories)
    if (next.has(cat)) next.delete(cat)
    else next.add(cat)
    setSelectedCategories(next)
  }

  const handleAddCustomCity = () => {
    const city = customCity.trim()
    if (!city) return
    const next = new Set(selectedCities)
    next.add(city)
    setSelectedCities(next)
    setCustomCity("")
    toast.success(`Город "${city}" добавлен.`)
  }

  const handleAddCustomCat = () => {
    const category = customCat.trim()
    if (!category) return
    const next = new Set(selectedCategories)
    next.add(category)
    setSelectedCategories(next)
    setCustomCat("")
    toast.success(`Ниша "${category}" добавлена.`)
  }

  const filteredAreas = useMemo(
    () => (isSearchingRegions ? searchAreas : areas),
    [areas, isSearchingRegions, searchAreas],
  )

  const filteredCategories = useMemo(
    () => categories.filter(c => c.toLowerCase().includes(normalizedCategorySearch)).slice(0, 200),
    [categories, normalizedCategorySearch],
  )

  const mergeRegionCities = (regionId: string, cities: Area[]) => {
    const merge = (region: Area) => region.id === regionId
      ? { ...region, areas: cities, city_count: region.city_count ?? cities.length }
      : region
    setAreas(prev => prev.map(merge))
    setSearchAreas(prev => prev.map(merge))
  }

  const loadRegionCities = async (region: Area): Promise<Area[]> => {
    if (region.areas && (!region.city_count || region.areas.length >= region.city_count)) {
      return region.areas
    }

    setLoadingRegionIds(prev => new Set(prev).add(region.id))
    try {
      const response = await fetch(`/api/settings/cities?region_id=${encodeURIComponent(region.id)}${smallParam}`)
      const data = await response.json()
      const fullRegion = Array.isArray(data.areas) ? data.areas[0] : null
      const cities: Area[] = Array.isArray(fullRegion?.areas) ? fullRegion.areas : []
      mergeRegionCities(region.id, cities)
      return cities
    } catch (error) {
      console.error(error)
      return []
    } finally {
      setLoadingRegionIds(prev => {
        const next = new Set(prev)
        next.delete(region.id)
        return next
      })
    }
  }

  const toggleRegion = (region: Area, open: boolean) => {
    const next = new Set(openRegionIds)
    if (open) {
      next.add(region.id)
      if (!region.areas) void loadRegionCities(region)
    } else {
      next.delete(region.id)
    }
    setOpenRegionIds(next)
  }

  const visibleCities = (region: Area) => {
    return region.areas || []
  }

  const toggleRegionCities = async (region: Area) => {
    const cityRows = await loadRegionCities(region)
    const cities = cityRows.map(city => city.name)
    if (cities.length === 0) return

    const next = new Set(selectedCities)
    const shouldSelect = cities.some(city => !next.has(city))
    cities.forEach(city => {
      if (shouldSelect) next.add(city)
      else next.delete(city)
    })
    setSelectedCities(next)
  }

  const removeCity = (city: string) => {
    const next = new Set(selectedCities)
    next.delete(city)
    setSelectedCities(next)
  }

  const removeCategory = (category: string) => {
    const next = new Set(selectedCategories)
    next.delete(category)
    setSelectedCategories(next)
  }

  const selectedCityList = useMemo(() => [...selectedCities].slice(0, 40), [selectedCities])
  const selectedCategoryList = useMemo(() => [...selectedCategories].slice(0, 30), [selectedCategories])
  const hiddenSelectedCount = Math.max(0, selectedCities.size - selectedCityList.length)
    + Math.max(0, selectedCategories.size - selectedCategoryList.length)

  const handleCreatePreset = () => {
    const cities = [...selectedCities];
    const niches = [...selectedCategories];
    if (cities.length === 0 || niches.length === 0) {
      toast.error("Выберите хотя бы один город и одну нишу.");
      return;
    }

    const fieldsToParse = [
      options.parseSites ? "sites" : null,
      options.parseSocials ? "socials" : null,
      options.parsePhones ? "phones" : null,
      options.parsePhotos ? "photos" : null,
    ].filter((field): field is string => Boolean(field));

    const preset: StoredPreset = {
      id: `rules_${Date.now()}`,
      name: `Правила сбора: ${cities.length}x${niches.length}`,
      type: "constructor",
      region: "Настройки",
      cities,
      niches,
      minReviews: options.minReviews,
      maxPerQuery: options.maxPerQuery,
      downloadPhotos: options.parsePhotos,
      requirePhotos: options.parsePhotos,
      fields_to_parse: fieldsToParse,
    };

    const stored = localStorage.getItem("yamap_presets_json");
    let presets: unknown;
    try {
      presets = stored ? JSON.parse(stored) : [];
    } catch {
      toast.error("Список пресетов повреждён.");
      return;
    }
    if (!Array.isArray(presets)) {
      toast.error("Список пресетов повреждён.");
      return;
    }

    localStorage.setItem("yamap_presets_json", JSON.stringify([...presets, preset]));
    window.dispatchEvent(new Event("yamap_presets_updated"));
    toast.success("Пресет добавлен в быстрые сценарии.");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-4 pb-4 min-h-0"
    >
      <div className="shrink-0">
        <h3 className="text-lg font-semibold text-slate-900">Конструктор поиска</h3>
        <p className="text-sm text-slate-500 mt-1">
          Выберите географию и ниши. Если города нет в базе, добавьте его вручную.
        </p>
      </div>

      <div className="flex flex-1 min-h-0 gap-4 mt-2">
        {/* Города */}
        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden border-slate-200">
          <div className="p-3 border-b bg-slate-50 shrink-0">
            <h4 className="font-medium flex items-center justify-between text-slate-700">
              <span className="flex items-center gap-2"><MapPin className="size-4" /> Города</span>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-mono">{selectedCities.size} выбрано</span>
            </h4>
            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Поиск по базе..."
                  className="pl-8 h-9 text-sm"
                  value={searchRegion}
                  onChange={(e) => setSearchRegion(e.target.value)}
                />
              </div>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <Checkbox
                checked={includeSmallSettlements}
                onCheckedChange={(checked) => setIncludeSmallSettlements(Boolean(checked))}
              />
              <span>Показывать сёла, деревни, мелкие посёлки</span>
            </label>
          </div>

          <ScrollArea className="flex-1 min-h-0 bg-white p-3">
            {loading ? <p className="text-sm text-slate-400">Загрузка регионов...</p> : (
              <div className="flex flex-col gap-1">
                {searchingCities && (
                  <div className="px-1.5 py-1 text-xs text-slate-400">Ищем города...</div>
                )}
                {filteredAreas.slice(0, isSearchingRegions ? 80 : 120).map(region => {
                  const isOpen = isSearchingRegions || openRegionIds.has(region.id)
                  const cities = isOpen ? visibleCities(region) : []
                  const regionLoaded = Boolean(region.areas && (!region.city_count || region.areas.length >= region.city_count))
                  const allRegionCities = regionLoaded ? region.areas?.map(city => city.name) || [] : []
                  const selectedInRegion = allRegionCities.filter(city => selectedCities.has(city)).length
                  const regionCityCount = region.city_count ?? region.areas?.length ?? 0
                  return (
                  <Collapsible key={region.id} open={isOpen} onOpenChange={(open) => toggleRegion(region, open)}>
                    <div className="flex items-center gap-2 rounded-md p-1 hover:bg-slate-50">
                      <Checkbox
                        checked={allRegionCities.length > 0 && selectedInRegion === allRegionCities.length}
                        onCheckedChange={() => void toggleRegionCities(region)}
                        aria-label={`Выбрать все города: ${region.name}`}
                      />
                      <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-1 text-left text-sm font-medium text-slate-700">
                        <ChevronRight className="size-4 shrink-0 text-slate-400" />
                        <span className="truncate">{region.name}</span>
                        {selectedInRegion > 0 && (
                          <span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{selectedInRegion}</span>
                        )}
                        {selectedInRegion === 0 && regionCityCount > 0 && (
                          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{regionCityCount}</span>
                        )}
                      </CollapsibleTrigger>
                    </div>
                    {isOpen && (
                    <CollapsibleContent className="pl-6 flex flex-col gap-1 py-1">
                      {loadingRegionIds.has(region.id) && (
                        <div className="px-1.5 py-1 text-xs text-slate-400">Загрузка городов...</div>
                      )}
                      {cities.slice(0, 200).map(city => (
                        <label key={city.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer">
                          <Checkbox
                            checked={selectedCities.has(city.name)}
                            onCheckedChange={() => toggleCity(city.name)}
                          />
                          <span className="text-sm text-slate-600">{city.name}</span>
                        </label>
                      ))}
                      {cities.length > 200 && (
                        <div className="px-1.5 py-1 text-xs text-slate-400">Уточните поиск, показаны первые 200.</div>
                      )}
                    </CollapsibleContent>
                    )}
                  </Collapsible>
                )})}
              </div>
            )}
          </ScrollArea>

          <div className="p-3 border-t bg-slate-50 shrink-0 space-y-2">
            <div className="text-xs font-medium text-slate-500">Нет города в списке?</div>
            <div className="flex gap-2">
            <Input
              placeholder="Добавить город вручную"
              className="h-8 text-sm"
              value={customCity}
              onChange={(e) => setCustomCity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomCity()}
            />
            <Button size="sm" variant="secondary" onClick={handleAddCustomCity}><Plus className="size-4" /></Button>
            </div>
          </div>
        </Card>

        {/* Ниши */}
        <Card className="flex-1 min-h-0 flex flex-col overflow-hidden border-slate-200">
          <div className="p-3 border-b bg-slate-50 shrink-0">
            <h4 className="font-medium flex items-center justify-between text-slate-700">
              <span className="flex items-center gap-2"><Building2 className="size-4" /> Ниши</span>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-mono">{selectedCategories.size} выбрано</span>
            </h4>
            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Поиск по справочнику..."
                  className="pl-8 h-9 text-sm"
                  value={searchCat}
                  onChange={(e) => setSearchCat(e.target.value)}
                />
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0 bg-white p-3">
            <div className="flex flex-col gap-1">
              {filteredCategories.map(cat => (
                <label key={cat} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer">
                  <Checkbox
                    checked={selectedCategories.has(cat)}
                    onCheckedChange={() => toggleCategory(cat)}
                  />
                  <span className="text-sm text-slate-700">{cat}</span>
                </label>
              ))}
            </div>
          </ScrollArea>

          <div className="p-3 border-t bg-slate-50 shrink-0 space-y-2">
            <div className="text-xs font-medium text-slate-500">Нет ниши в справочнике?</div>
            <div className="flex gap-2">
            <Input
              placeholder="Добавить нишу вручную"
              className="h-8 text-sm"
              value={customCat}
              onChange={(e) => setCustomCat(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCustomCat()}
            />
            <Button size="sm" variant="secondary" onClick={handleAddCustomCat}><Plus className="size-4" /></Button>
            </div>
          </div>
        </Card>

        {/* Опции Парсинга */}
        <Card className="w-[280px] min-h-0 shrink-0 flex flex-col overflow-hidden border-slate-200">
          <div className="p-3 border-b bg-slate-50 shrink-0">
            <h4 className="font-medium flex items-center gap-2 text-slate-700">
              <Settings2 className="size-4" />
              Сбор данных
            </h4>
          </div>
          <ScrollArea className="flex-1 min-h-0 bg-white p-4">
            <div className="space-y-4">
              <label className="flex items-center space-x-2">
                <Checkbox checked={options.parseSites} onCheckedChange={(c) => setOptions({...options, parseSites: !!c})} />
                <span className="text-sm font-medium">Парсить Сайты</span>
              </label>
              <label className="flex items-center space-x-2">
                <Checkbox checked={options.parseSocials} onCheckedChange={(c) => setOptions({...options, parseSocials: !!c})} />
                <span className="text-sm font-medium">Парсить Соцсети</span>
              </label>
              <label className="flex items-center space-x-2">
                <Checkbox checked={options.parsePhones} onCheckedChange={(c) => setOptions({...options, parsePhones: !!c})} />
                <span className="text-sm font-medium">Собирать Телефоны</span>
              </label>
              <label className="flex items-center space-x-2">
                <Checkbox checked={options.parsePhotos} onCheckedChange={(c) => setOptions({...options, parsePhotos: !!c})} />
                <span className="text-sm font-medium">Скачивать Фото</span>
              </label>

              <div className="pt-4 border-t space-y-3 mt-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Минимум отзывов</Label>
                  <Input
                    type="number"
                    value={options.minReviews}
                    onChange={e => setOptions({...options, minReviews: Number(e.target.value)})}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Лимит лидов с запроса</Label>
                  <Input
                    type="number"
                    value={options.maxPerQuery}
                    onChange={e => setOptions({...options, maxPerQuery: Number(e.target.value)})}
                    className="h-8"
                  />
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="p-3 border-t bg-slate-50 shrink-0">
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={handleCreatePreset}>Сформировать Пресет</Button>
          </div>
        </Card>
      </div>

      {(selectedCities.size > 0 || selectedCategories.size > 0) && (
        <div className="shrink-0 rounded-lg border border-indigo-100 bg-indigo-50 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-indigo-900">
              {selectedCategories.size} ниш × {selectedCities.size} городов = {selectedCategories.size * selectedCities.size} запросов
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-indigo-700"
              onClick={() => {
                setSelectedCities(new Set())
                setSelectedCategories(new Set())
              }}
            >
              Очистить
            </Button>
          </div>
          <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
            {selectedCityList.map(city => (
              <button key={`city-${city}`} className="rounded-full bg-white px-2 py-1 text-xs text-slate-700 shadow-xs" onClick={() => removeCity(city)}>
                {city} ×
              </button>
            ))}
            {selectedCategoryList.map(category => (
              <button key={`cat-${category}`} className="rounded-full bg-indigo-100 px-2 py-1 text-xs text-indigo-800" onClick={() => removeCategory(category)}>
                {category} ×
              </button>
            ))}
            {hiddenSelectedCount > 0 && (
              <span className="rounded-full bg-white/70 px-2 py-1 text-xs text-slate-500">
                +{hiddenSelectedCount} еще
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
