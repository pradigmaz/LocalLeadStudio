import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { fileURLToPath } from "node:url"

const appPath = fileURLToPath(new URL("../src/App.tsx", import.meta.url))
const appSource = readFileSync(appPath, "utf8")

test("lets the collection sidebar collapse and return through an accessible toggle", () => {
  assert.match(appSource, /const \[isSidebarCollapsed, setIsSidebarCollapsed\] = useState\(false\)/)
  assert.match(appSource, /onClick=\{\(\) => setIsSidebarCollapsed\(current => !current\)\}/)
  assert.match(appSource, /aria-label=\{isSidebarCollapsed \? "Показать конструктор сбора" : "Скрыть конструктор сбора"\}/)
  assert.match(appSource, /isSidebarCollapsed \? "w-0 border-r-0" : "w-\[26rem\] border-r"/)
})
