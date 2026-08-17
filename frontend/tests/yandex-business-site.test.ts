import assert from "node:assert/strict"
import test from "node:test"
import { isYandexBusinessSite } from "../src/lib/url.ts"

test("identifies Yandex Business client-site hosts", () => {
  assert.equal(isYandexBusinessSite("https://place-est21.clients.site/"), true)
  assert.equal(isYandexBusinessSite("lunamel-voronezh.clients.site"), true)
})

test("keeps normal and lookalike domains out of the Yandex Business label", () => {
  assert.equal(isYandexBusinessSite("https://example.ru/"), false)
  assert.equal(isYandexBusinessSite("https://clients.site/"), false)
  assert.equal(isYandexBusinessSite("https://clients.site.example/"), false)
  assert.equal(isYandexBusinessSite("https://example.clients.site.evil.com/"), false)
})
