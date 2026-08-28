import assert from "node:assert/strict"
import test from "node:test"
import { buildLeadPageUrl, DEFAULT_LEAD_LIST_FILTERS, LEAD_PAGE_SIZE } from "../src/lib/lead-page.ts"

test("builds a paged API request from the active table filters", () => {
  const url = new URL(
    buildLeadPageUrl(LEAD_PAGE_SIZE, {
      ...DEFAULT_LEAD_LIST_FILTERS,
      search: "Салон",
      status: "POTENTIAL",
      leadType: "REDESIGN",
      city: "Воронеж",
      reviewRange: "50-100",
    }),
    "http://localhost",
  )

  assert.equal(url.pathname, "/api/leads")
  assert.equal(url.searchParams.get("offset"), "50")
  assert.equal(url.searchParams.get("limit"), "50")
  assert.equal(url.searchParams.get("search"), "Салон")
  assert.equal(url.searchParams.get("status"), "POTENTIAL")
  assert.equal(url.searchParams.get("lead_type"), "REDESIGN")
  assert.equal(url.searchParams.get("city"), "Воронеж")
  assert.equal(url.searchParams.get("review_range"), "50-100")
})
