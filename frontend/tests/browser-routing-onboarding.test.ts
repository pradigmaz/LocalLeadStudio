import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"
import { fileURLToPath } from "node:url"

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url))
const settingsDialogPath = fileURLToPath(new URL("../src/components/settings/SettingsDialog.tsx", import.meta.url))
const settingsSidebarPath = fileURLToPath(new URL("../src/components/settings/SettingsSidebar.tsx", import.meta.url))
const browserDialogPath = fileURLToPath(new URL("../src/components/settings/BrowserRoutingDialog.tsx", import.meta.url))

test("offers a separate browser on first launch and keeps a visible settings entry", () => {
  assert.equal(existsSync(browserDialogPath), true, "browser onboarding dialog must exist")

  const appSource = readFileSync(appPath, "utf8")
  const settingsDialogSource = readFileSync(settingsDialogPath, "utf8")
  const settingsSidebarSource = readFileSync(settingsSidebarPath, "utf8")
  const browserDialogSource = readFileSync(browserDialogPath, "utf8")

  assert.match(appSource, /BrowserRoutingDialog/)
  assert.match(appSource, /onboarding === 'pending'/)
  assert.match(browserDialogSource, /Отдельный браузер без VPN/)
  assert.match(browserDialogSource, /Использовать браузер Windows по умолчанию/)
  assert.match(browserDialogSource, /Выбрать браузер/)
  assert.match(browserDialogSource, /sm:max-w-\[36rem\]/, "onboarding dialog must fit both actions without overflow")
  assert.match(browserDialogSource, /focus-visible:border-indigo-500/, "onboarding focus state must match the dialog accent")
  assert.match(settingsDialogSource, /BrowserTab/)
  assert.match(settingsSidebarSource, /Браузер/)
})
