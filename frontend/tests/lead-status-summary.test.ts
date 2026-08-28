import assert from "node:assert/strict"
import test from "node:test"
import { LEAD_STATUS_SUMMARY, countLeadStatuses } from "../src/lib/lead-status.ts"

test("reports every lead status, including statuses with no leads", () => {
  const counts = countLeadStatuses([
    { lead_status: "POTENTIAL" },
    { lead_status: "REJECT" },
    { lead_status: "REJECT" },
  ])

  assert.deepEqual(LEAD_STATUS_SUMMARY.map(({ status, label }) => [status, label, counts[status]]), [
    ["NEW", "Новые", 0],
    ["POTENTIAL", "Потенциальные", 1],
    ["IN_PROGRESS", "В работе", 0],
    ["PROCESSED", "Отработано", 0],
    ["REJECT", "Неликвид", 2],
    ["JUNK", "Мусор", 0],
    ["CHAIN", "Сетевик", 0],
  ])
})
