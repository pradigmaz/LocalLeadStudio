import { Badge } from "@/components/ui/badge"
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Star } from "lucide-react"
import { motion } from "framer-motion"
import type { Lead } from "@/types"

const fadeDown = { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 } };

interface LeadModalHeaderProps {
  lead: Lead;
}

export function LeadModalHeader({ lead }: LeadModalHeaderProps) {
  return (
    <SheetHeader className="p-6 pb-4 shrink-0 border-b">
      <motion.div
        className="flex items-center gap-2 mb-2"
        {...fadeDown}
        transition={{ duration: 0.18 }}
      >
        {lead.lead_type === 'REDESIGN' ? (
          <Badge variant="outline" className="bg-purple-50 text-purple-700 hover:bg-purple-50 border-purple-200">
            Редизайн
          </Badge>
        ) : (
          <Badge variant="outline" className="text-slate-500">
            Новый сайт
          </Badge>
        )}
      </motion.div>
      <SheetTitle className="text-2xl font-bold">{lead.name}</SheetTitle>
      <SheetDescription className="text-base text-muted-foreground">
        {lead.address || "Адрес не указан"}
      </SheetDescription>

      <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-slate-600">
        <div className="flex items-center gap-1.5 text-amber-600 font-semibold">
          <Star className="size-4 fill-current" />
          <span>{typeof lead.rating === 'number' ? lead.rating.toFixed(1) : (lead.rating || '-')}</span>
        </div>
        <div className="text-slate-300">•</div>
        <div>
          <span className="font-semibold text-slate-900">{lead.review_count || 0}</span> отзывов
        </div>
        {lead.city && (
          <>
            <div className="text-slate-300">•</div>
            <div className="text-slate-900 font-medium">{lead.city}</div>
          </>
        )}
      </div>
    </SheetHeader>
  );
}
