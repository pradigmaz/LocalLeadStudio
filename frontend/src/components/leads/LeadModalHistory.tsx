import { Button } from "@/components/ui/button"
import { Clock, Send } from "lucide-react"
import { motion } from "framer-motion"
import type { LeadEvent } from "@/types"

const fadeUp = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

interface LeadModalHistoryProps {
  events: LeadEvent[];
  isLoadingEvents: boolean;
  newComment: string;
  onCommentChange: (comment: string) => void;
  onAddComment: () => void;
}

export function LeadModalHistory({
  events,
  isLoadingEvents,
  newComment,
  onCommentChange,
  onAddComment,
}: LeadModalHistoryProps) {
  return (
    <motion.div
      className="mt-8 border-t pt-8 pb-4"
      {...fadeUp}
      transition={{ duration: 0.2, delay: 0.12 }}
    >
      <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
        <Clock className="size-4" />
        История и заметки
      </h4>

      <div className="bg-slate-50 rounded-lg p-4 mb-6 border">
        <div className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => onCommentChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAddComment()}
            placeholder="Написать заметку или итог звонка..."
            className="flex-1 bg-white border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <Button onClick={onAddComment} size="sm" className="shrink-0 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
            <Send className="size-4" />
            Отправить
          </Button>
        </div>
      </div>

      <div className="space-y-0">
        {isLoadingEvents ? (
          <div className="text-sm text-muted-foreground text-center py-4">Загрузка истории...</div>
        ) : events.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4 italic">Истории пока нет</div>
        ) : (
          events.map((ev, i) => {
            const isLast = i === events.length - 1;
            return (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center w-4 shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-indigo-400 bg-white mt-1.5 z-10" />
                  {!isLast && <div className="w-px h-full bg-slate-200 -mt-2" />}
                </div>
                <div className="flex-1 pb-6">
                  <div className="text-[11px] font-medium text-slate-400 mb-1 uppercase tracking-wider">
                    {new Date(ev.created_at.endsWith('Z') ? ev.created_at : ev.created_at + 'Z').toLocaleString('ru-RU')}
                  </div>
                  {ev.event_type === 'STATUS_CHANGE' ? (
                    <div className="text-sm bg-slate-50 p-2.5 rounded-md border text-slate-700">
                      Статус изменен: <span className="font-medium line-through text-slate-400 mr-1">{ev.old_value || '—'}</span> &rarr; <span className="font-medium text-slate-900 ml-1">{ev.new_value}</span>
                    </div>
                  ) : ev.event_type === 'COMMENT' ? (
                    <div className="text-sm bg-white border border-indigo-100 p-3 rounded-md shadow-sm whitespace-pre-wrap text-slate-800 relative">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-400 rounded-l-md" />
                      {ev.comment}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-600">{ev.comment || ev.event_type}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}
