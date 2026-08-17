import assert from "node:assert/strict"
import test from "node:test"
import { getSocialPlatform } from "../src/lib/social-platform.ts"

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
