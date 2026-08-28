import type { LeadStatus } from "@/types"

export const LEAD_STATUS_SUMMARY: ReadonlyArray<{ status: LeadStatus; label: string }> = [
  { status: "NEW", label: "Новые" },
  { status: "POTENTIAL", label: "Потенциальные" },
  { status: "IN_PROGRESS", label: "В работе" },
  { status: "PROCESSED", label: "Отработано" },
  { status: "REJECT", label: "Неликвид" },
  { status: "JUNK", label: "Мусор" },
  { status: "CHAIN", label: "Сетевик" },
]

export function countLeadStatuses(leads: Iterable<{ lead_status: LeadStatus }>): Record<LeadStatus, number> {
  const counts = Object.fromEntries(LEAD_STATUS_SUMMARY.map(({ status }) => [status, 0])) as Record<LeadStatus, number>

  for (const lead of leads) {
    counts[lead.lead_status] += 1
  }

  return counts
}
