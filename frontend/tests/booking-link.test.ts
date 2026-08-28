import assert from "node:assert/strict"
import test from "node:test"
import { isBookingLink } from "../src/lib/url.ts"

test("does not classify Taplink as booking and retains booking services", () => {
  assert.equal(isBookingLink("https://dikidi.ru/1884292"), true)
  assert.equal(isBookingLink("https://n123.yclients.com/"), true)
  assert.equal(isBookingLink("https://taplink.cc/massage_expert"), false)
})
