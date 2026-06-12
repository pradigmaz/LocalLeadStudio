import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { motion } from "framer-motion"
import type { Lead, LeadStatus } from "@/types"

type StatusAction = { id: LeadStatus; label: string; hint?: string };

const STATUS_ACTIONS: Partial<Record<LeadStatus, StatusAction[]>> = {
  NEW: [
    { id: 'POTENTIAL', label: 'Потенциальный' },
    { id: 'REJECT', label: 'Неликвид' },
  ],
  POTENTIAL: [
    { id: 'IN_PROGRESS', label: 'Взять в работу' },
    { id: 'REJECT', label: 'Неликвид' },
  ],
  IN_PROGRESS: [
    { id: 'PROCESSED', label: 'Отработано' },
    {
      id: 'POTENTIAL',
      label: 'Потенциальный',
      hint: 'Вернуть сюда, если лид взяли в работу ошибочно или решили отложить без закрытия.',
    },
  ],
};

const FALLBACK_STATUS_ACTIONS: StatusAction[] = [
  { id: 'POTENTIAL', label: 'Потенциальный' },
  { id: 'REJECT', label: 'Неликвид' },
];

const fadeUp = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

const getStatusBadgeStyles = (id: string) => {
  switch(id) {
    case 'NEW': return 'bg-blue-100 border-blue-400 text-blue-800';
    case 'POTENTIAL': return 'bg-emerald-100 border-emerald-400 text-emerald-800';
    case 'IN_PROGRESS': return 'bg-indigo-100 border-indigo-400 text-indigo-800';
    case 'PROCESSED': return 'bg-amber-100 border-amber-400 text-amber-800';
    case 'REJECT': return 'bg-slate-200 border-slate-400 text-slate-800';
    case 'CHAIN': return 'bg-zinc-800 border-zinc-900 text-zinc-100';
    default: return 'bg-slate-100 border-slate-400 text-slate-800';
  }
};

interface LeadModalStatusControlsProps {
  lead: Lead;
  onStatusChange: (leadId: string, newStatus: LeadStatus) => void;
  onPriorityChange: (leadId: string, priority: number) => void;
}

export function LeadModalStatusControls({ lead, onStatusChange, onPriorityChange }: LeadModalStatusControlsProps) {
  return (
    <motion.div
      className="space-y-3"
      {...fadeUp}
      transition={{ duration: 0.2 }}
    >
      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Изменить статус</h4>
      <ToggleGroup
        type="single"
        value={lead.lead_status}
        onValueChange={(val) => val && onStatusChange(lead.id, val as LeadStatus)}
        className="flex flex-wrap gap-2 justify-start"
      >
        {(STATUS_ACTIONS[lead.lead_status] ?? FALLBACK_STATUS_ACTIONS).map(status => {
          const isActive = lead.lead_status === status.id;
          const statusButton = (
            <ToggleGroupItem
              key={status.id}
              value={status.id}
              variant="outline"
              className={`relative rounded-full px-4 py-1.5 text-xs font-medium transition-colors border ${
                isActive
                  ? 'border-transparent bg-transparent hover:bg-transparent data-[state=on]:bg-transparent scale-105'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="status-indicator"
                  className={`absolute inset-0 rounded-full border shadow-sm ${getStatusBadgeStyles(status.id)}`}
                  initial={false}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className={`relative z-10 ${isActive ? getStatusBadgeStyles(status.id).split(' ').find(c => c.startsWith('text-')) : ''}`}>
                {status.label}
              </span>
            </ToggleGroupItem>
          );

          if (!status.hint) return statusButton;

          return (
            <TooltipProvider key={status.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  {statusButton}
                </TooltipTrigger>
                <TooltipContent>
                  {status.hint}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </ToggleGroup>

      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mt-6">Очередность (Приоритет)</h4>
      <ToggleGroup
        type="single"
        value={lead.priority?.toString() || "0"}
        onValueChange={(val) => val && onPriorityChange(lead.id, parseInt(val))}
        className="flex flex-wrap gap-2 justify-start"
      >
        <ToggleGroupItem value="1" variant="outline" className="data-[state=on]:bg-indigo-100 data-[state=on]:text-indigo-800 data-[state=on]:border-indigo-300">1-й (Высший)</ToggleGroupItem>
        <ToggleGroupItem value="2" variant="outline" className="data-[state=on]:bg-indigo-50 data-[state=on]:text-indigo-700 data-[state=on]:border-indigo-200">2-й</ToggleGroupItem>
        <ToggleGroupItem value="3" variant="outline" className="data-[state=on]:bg-slate-100 data-[state=on]:text-slate-800 data-[state=on]:border-slate-300">3-й</ToggleGroupItem>
        <ToggleGroupItem value="0" variant="outline" className="text-muted-foreground">Без приоритета</ToggleGroupItem>
      </ToggleGroup>
    </motion.div>
  );
}
