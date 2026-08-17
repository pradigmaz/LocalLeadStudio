import type { Area } from "./searchBuilderTypes"

interface VisibleCityNamesOptions {
  scopedAreas: Area[]
  globalAreas: Area[]
  hasSelectedRegions: boolean
  query: string
}

const normalize = (value: string) => value.toLowerCase().replace(/ё/g, "е").trim()

export function visibleCityNames({ scopedAreas, globalAreas, hasSelectedRegions, query }: VisibleCityNamesOptions) {
  const needle = normalize(query)
  const source = hasSelectedRegions ? scopedAreas : globalAreas
  return Array.from(new Set(
    source
      .filter((area) => !needle || normalize(area.name).includes(needle))
      .map((area) => area.name)
      .filter(Boolean),
  )).slice(0, 100)
}
