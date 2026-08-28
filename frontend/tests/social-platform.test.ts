import assert from "node:assert/strict"
import test from "node:test"
import { dedupeSocialLinks, getSocialPlatform } from "../src/lib/social-platform.ts"

test("detects common social and messenger domains", () => {
  const cases = [
    ["https://vk.ru/example", "vk"],
    ["https://vk.com/example", "vk"],
    ["https://wa.me/79990000000", "whatsapp"],
    ["https://api.whatsapp.com/send?phone=79990000000", "whatsapp"],
    ["https://t.me/example", "telegram"],
    ["https://viber.click/79990000000", "viber"],
    ["https://max.ru/example", "max"],
    ["https://www.youtube.com/@example", "youtube"],
    ["https://youtu.be/example", "youtube"],
    ["https://example.org", "link"],
  ] as const

  for (const [url, expected] of cases) {
    assert.equal(getSocialPlatform(url), expected, url)
  }
})

test("deduplicates equivalent messenger links and keeps distinct VK pages", () => {
  assert.deepEqual(
    dedupeSocialLinks([
      "https://t.me/+79805415504",
      "https://t.me/79805415504",
      "https://wa.me/79805415504?text=hello",
      "https://api.whatsapp.com/send?phone=79805415504",
      "https://vk.ru/allauto_service",
      "https://vk.com/allauto_service",
      "https://vk.ru/club133296133",
    ]),
    [
      "https://t.me/+79805415504",
      "https://wa.me/79805415504?text=hello",
      "https://vk.ru/allauto_service",
      "https://vk.ru/club133296133",
    ],
  )
})

test("deduplicates Dikidi mirrors and keeps distinct profiles", () => {
  assert.deepEqual(
    dedupeSocialLinks([
      "https://dikidi.ru/1936893",
      "https://dikidi.net/1936893",
      "https://dikidi.net/1936894",
    ]),
    [
      "https://dikidi.ru/1936893",
      "https://dikidi.net/1936894",
    ],
  )
})
