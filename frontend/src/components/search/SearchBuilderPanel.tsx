import { useEffect, useMemo, useState } from "react"
import { Building2, MapPin } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import type { Area, BuilderState } from "./searchBuilderTypes"
import { EntityDialog, RegionDialog, SummaryCard } from "./SearchBuilderDialogs"

interface SearchBuilderPanelProps {
  value: BuilderState
  onChange: (value: BuilderState) => void
}

const uniqueNames = (areas: Area[]) => Array.from(new Set(areas.map((area) => area.name).filter(Boolean)))

export function SearchBuilderPanel({ value, onChange }: SearchBuilderPanelProps) {
  const [regions, setRegions] = useState<Area[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>([])
  const [regionCities, setRegionCities] = useState<Area[]>([])
  const [citySearchResults, setCitySearchResults] = useState<Area[]>([])
  const [includeSmallSettlements, setIncludeSmallSettlements] = useState(false)
  const [loadingCities, setLoadingCities] = useState(false)

  const [regionDialogOpen, setRegionDialogOpen] = useState(false)
  const [cityDialogOpen, setCityDialogOpen] = useState(false)
  const [nicheDialogOpen, setNicheDialogOpen] = useState(false)
  const [regionSearch, setRegionSearch] = useState("")
  const [citySearch, setCitySearch] = useState("")
  const [categorySearch, setCategorySearch] = useState("")
  const [customCity, setCustomCity] = useState("")
  const [customCategory, setCustomCategory] = useState("")

  const smallParam = includeSmallSettlements ? "&include_small=true" : ""
  const normalizedRegionSearch = regionSearch.trim().toLowerCase()
  const normalizedCitySearch = citySearch.trim().toLowerCase()
  const normalizedCategorySearch = categorySearch.trim().toLowerCase()

  const visibleRegions = useMemo(() => (
    regions
      .filter((region) => region.name.toLowerCase().includes(normalizedRegionSearch))
      .slice(0, 80)
  ), [normalizedRegionSearch, regions])

  const visibleCities = useMemo(() => {
    const source = normalizedCitySearch ? citySearchResults : regionCities
    return uniqueNames(source).slice(0, 100)
  }, [citySearchResults, normalizedCitySearch, regionCities])

  const visibleCategories = useMemo(() => (
    categories
      .filter((category) => category.toLowerCase().includes(normalizedCategorySearch))
      .slice(0, 100)
  ), [categories, normalizedCategorySearch])

  const queryCount = value.cities.length * value.niches.length

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetch("/api/settings/categories", { signal: controller.signal }).then((response) => response.json()),
      fetch(`/api/settings/cities?summary=true${smallParam}`, { signal: controller.signal }).then((response) => response.json()),
    ]).then(([cats, cityData]) => {
      const nextRegions = Array.isArray(cityData.areas) ? cityData.areas : []
      const nextCategories = Array.isArray(cats) ? cats : Object.keys(cats)
      setRegions(nextRegions)
      setCategories(nextCategories)
    }).catch((error) => {
      if (error.name !== "AbortError") console.error(error)
    })

    return () => controller.abort()
  }, [smallParam])

  useEffect(() => {
    const ids = regions
      .filter((region) => value.regionNames.includes(region.name))
      .map((region) => region.id)
    if (ids.join("|") !== selectedRegionIds.join("|")) {
      queueMicrotask(() => setSelectedRegionIds(ids))
    }
  }, [regions, selectedRegionIds, value.regionNames])

  useEffect(() => {
    if (selectedRegionIds.length === 0) {
      queueMicrotask(() => setRegionCities([]))
      return
    }

    const controller = new AbortController()
    queueMicrotask(() => setLoadingCities(true))
    Promise.all(
      selectedRegionIds.map((regionId) =>
        fetch(`/api/settings/cities?region_id=${encodeURIComponent(regionId)}${smallParam}`, { signal: controller.signal })
          .then((response) => response.json())
      ),
    )
      .then((responses) => {
        const cities = responses.flatMap((data) => {
          const region = Array.isArray(data.areas) ? data.areas[0] : null
          return Array.isArray(region?.areas) ? region.areas : []
        })
        setRegionCities(cities)
      })
      .catch((error) => {
        if (error.name !== "AbortError") console.error(error)
      })
      .finally(() => setLoadingCities(false))

    return () => controller.abort()
  }, [selectedRegionIds, smallParam])

  useEffect(() => {
    if (!normalizedCitySearch) {
      queueMicrotask(() => setCitySearchResults([]))
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      queueMicrotask(() => setLoadingCities(true))
      fetch(
        `/api/settings/cities?q=${encodeURIComponent(normalizedCitySearch)}&limit_regions=40&limit_cities=80${smallParam}`,
        { signal: controller.signal },
      )
        .then((response) => response.json())
        .then((data) => {
          const areas = Array.isArray(data.areas) ? data.areas : []
          setCitySearchResults(areas.flatMap((region: Area) => region.areas || []))
        })
        .catch((error) => {
          if (error.name !== "AbortError") console.error(error)
        })
        .finally(() => setLoadingCities(false))
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [normalizedCitySearch, smallParam])

  const update = (patch: Partial<BuilderState>) => onChange({ ...value, ...patch })
  const toggleCity = (city: string) => update({
    cities: value.cities.includes(city)
      ? value.cities.filter((item) => item !== city)
      : [...value.cities, city],
  })
  const toggleNiche = (niche: string) => update({
    niches: value.niches.includes(niche)
      ? value.niches.filter((item) => item !== niche)
      : [...value.niches, niche],
  })

  const toggleRegion = (region: Area) => {
    const nextNames = value.regionNames.includes(region.name)
      ? value.regionNames.filter((name) => name !== region.name)
      : [...value.regionNames, region.name]
    update({ regionNames: nextNames, cities: [] })
    setCitySearch("")
  }

  const addCustomCity = () => {
    const city = customCity.trim()
    if (!city) return
    update({ cities: value.cities.includes(city) ? value.cities : [...value.cities, city] })
    setCustomCity("")
  }

  const addCustomCategory = () => {
    const category = customCategory.trim()
    if (!category) return
    update({ niches: value.niches.includes(category) ? value.niches : [...value.niches, category] })
    setCustomCategory("")
  }

  return (
    <div className="space-y-3">
      <SummaryCard
        icon={<MapPin className="size-4 text-indigo-600" />}
        title="География"
        value={value.regionNames.length ? value.regionNames.slice(0, 2).join(", ") : "Не выбрано"}
        detail={value.regionNames.length > 2 ? `+${value.regionNames.length - 2} ещё` : `${value.cities.length} городов выбрано`}
        action="Выбрать"
        onClick={() => setRegionDialogOpen(true)}
      />
      <SummaryCard
        icon={<MapPin className="size-4 text-slate-500" />}
        title="Города"
        value={value.cities.length ? value.cities.slice(0, 3).join(", ") : "Не выбраны"}
        detail={value.cities.length > 3 ? `+${value.cities.length - 3} ещё` : "Выбор из региона или поиск"}
        action="Выбрать"
        onClick={() => setCityDialogOpen(true)}
      />
      <SummaryCard
        icon={<Building2 className="size-4 text-slate-500" />}
        title="Ниши"
        value={value.niches.length ? value.niches.slice(0, 3).join(", ") : "Не выбраны"}
        detail={value.niches.length > 3 ? `+${value.niches.length - 3} ещё` : "Категории или ручной ввод"}
        action="Выбрать"
        onClick={() => setNicheDialogOpen(true)}
      />
      <div className="rounded-lg border bg-white p-3 text-center text-sm text-slate-600">
        <span className="font-semibold text-slate-900">{queryCount}</span> запросов: {value.cities.length} городов × {value.niches.length} ниш
      </div>

      <RegionDialog
        open={regionDialogOpen}
        onOpenChange={setRegionDialogOpen}
        regions={visibleRegions}
        selectedRegionNames={value.regionNames}
        search={regionSearch}
        onSearchChange={setRegionSearch}
        onToggle={toggleRegion}
      />
      <EntityDialog
        open={cityDialogOpen}
        onOpenChange={setCityDialogOpen}
        title="Выбор городов"
        search={citySearch}
        onSearchChange={setCitySearch}
        searchPlaceholder="Поиск города..."
        items={visibleCities}
        selected={value.cities}
        loading={loadingCities}
        onToggle={toggleCity}
        customValue={customCity}
        customPlaceholder="Добавить город вручную"
        onCustomChange={setCustomCity}
        onCustomAdd={addCustomCity}
        extraControl={(
          <label className="flex items-center gap-2 text-xs text-slate-500">
            <Checkbox
              checked={includeSmallSettlements}
              onCheckedChange={(checked) => setIncludeSmallSettlements(Boolean(checked))}
            />
            <span>Показывать сёла, деревни, мелкие посёлки</span>
          </label>
        )}
      />
      <EntityDialog
        open={nicheDialogOpen}
        onOpenChange={setNicheDialogOpen}
        title="Выбор ниш"
        search={categorySearch}
        onSearchChange={setCategorySearch}
        searchPlaceholder="Поиск ниши..."
        items={visibleCategories}
        selected={value.niches}
        onToggle={toggleNiche}
        customValue={customCategory}
        customPlaceholder="Добавить нишу вручную"
        onCustomChange={setCustomCategory}
        onCustomAdd={addCustomCategory}
      />
    </div>
  )
}
