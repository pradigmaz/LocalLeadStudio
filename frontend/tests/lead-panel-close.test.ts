import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { fileURLToPath } from "node:url"

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url))
const appSource = readFileSync(appPath, "utf8")

test("closes the lead panel after a potential status is confirmed", () => {
  assert.match(
    appSource,
    /if \(newStatus === 'REJECT' \|\| newStatus === 'POTENTIAL'\) \{/,
  )
})
