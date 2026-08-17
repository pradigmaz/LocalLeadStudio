import assert from "node:assert/strict"
import test from "node:test"
import { visibleCityNames } from "../src/components/search/city-search.ts"

test("keeps city search inside the selected region set", () => {
  const result = visibleCityNames({
    scopedAreas: [
      { id: "1844-1", name: "Воронеж" },
      { id: "1844-2", name: "Нововоронеж" },
    ],
    globalAreas: [{ id: "1828-1", name: "Брянск" }],
    hasSelectedRegions: true,
    query: "брян",
  })

  assert.deepEqual(result, [])
})

test("uses the union of cities from multiple selected regions", () => {
  const result = visibleCityNames({
    scopedAreas: [
      { id: "1844-1", name: "Воронеж" },
      { id: "1828-1", name: "Брянск" },
    ],
    globalAreas: [],
    hasSelectedRegions: true,
    query: "брян",
  })

  assert.deepEqual(result, ["Брянск"])
})
