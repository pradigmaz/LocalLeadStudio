import assert from "node:assert/strict"
import test from "node:test"
import { isTildaSite } from "../src/lib/url.ts"

test("identifies hosted Tilda site domains", () => {
  assert.equal(isTildaSite("https://demo-project.tilda.ws/"), true)
  assert.equal(isTildaSite("demo-project.tilda.ws"), true)
})

test("keeps normal and lookalike domains out of the Tilda label", () => {
  assert.equal(isTildaSite("https://example.ru/"), false)
  assert.equal(isTildaSite("https://tilda.ws.example/"), false)
  assert.equal(isTildaSite("https://demo.tilda.ws.evil.com/"), false)
})
