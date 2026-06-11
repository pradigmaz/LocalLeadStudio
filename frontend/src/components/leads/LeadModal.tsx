import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ExternalLink, Globe, Link, Phone, Star, Clock, Send } from "lucide-react"
import { motion } from "framer-motion"
import { useState, useEffect } from "react"
import { LeadModalPhotos } from "./LeadModalPhotos"
import type { Lead, LeadEvent } from "@/types"

interface ApiError {
  error?: string;
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Ошибка подключения';

interface LeadModalProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (leadId: string, newStatus: string) => void;
  onPriorityChange: (leadId: string, priority: number) => void;
  onLeadDeleted: (leadId: string) => void;
}

const STATUSES = [
  { id: 'NEW', label: 'Новый' },
  { id: 'POTENTIAL', label: 'Потенциальный' },
  { id: 'PROCESSED', label: 'Отработано' },
  { id: 'REJECT', label: 'Неликвид' },
  { id: 'CHAIN', label: 'Сетевик' }
];

const fadeDown = { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 } };
const fadeUp = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };
const fadeLeft = { initial: { opacity: 0, x: -12 }, animate: { opacity: 1, x: 0 } };
const fadeRight = { initial: { opacity: 0, x: 12 }, animate: { opacity: 1, x: 0 } };

export function LeadModal({ lead, isOpen, onClose, onStatusChange, onPriorityChange, onLeadDeleted }: LeadModalProps) {
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);

  useEffect(() => {
    if (lead?.id && isOpen) {
      setIsLoadingEvents(true);
      fetch(`/api/leads/${lead.id}/events`)
        .then(res => res.json())
        .then(data => setEvents(data.events || []))
        .finally(() => setIsLoadingEvents(false));
    } else {
      setEvents([]);
      setNewComment("");
    }
  }, [lead?.id, isOpen]);

  const handleAddComment = async () => {
    if (!newComment.trim() || !lead) return;
    try {
      const res = await fetch(`/api/leads/${lead.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: newComment })
      });
      if (res.ok) {
        setEvents([{
          event_type: "COMMENT",
          old_value: null,
          new_value: null,
          comment: newComment,
          created_at: new Date().toISOString()
        }, ...events]);
        setNewComment("");
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!lead) return null;

  const handleDeleteLead = async () => {
    if (!window.confirm(`Вы уверены, что хотите удалить лид "${lead.name}" и все его данные из базы?`)) return;
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
      if (res.ok) {
        alert("Лид удален из базы.");
        onLeadDeleted(lead.id);
        onClose();
      } else {
        const data: ApiError = await res.json().catch(() => ({}));
        alert(`Ошибка при удалении: ${data.error || 'Ошибка сервера'}`);
      }
    } catch (error: unknown) {
      alert(`Ошибка: ${getErrorMessage(error)}`);
    }
  };

  const handleBlacklistBrand = async () => {
    if (!window.confirm(`Добавить "${lead.name}" в чёрный список сетевиков? Он получит статус "Сетевик" и скроется.`)) return;
    const stored = localStorage.getItem('yamap_blacklist') || "";
    const words = stored.split(',').map(w => w.trim()).filter(Boolean);
    if (!words.includes(lead.name)) {
      words.push(lead.name);
      localStorage.setItem('yamap_blacklist', words.join(', '));
    }
    
    onStatusChange(lead.id, 'CHAIN');
    alert(`"${lead.name}" добавлен в чёрный список.`);
    onClose();
  };

  const formatUrl = (url: string) => {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      const host = parsed.hostname.replace(/^www\./, '');
      let path = parsed.pathname;
      if (path.length > 15) path = path.substring(0, 15) + '...';
      return host + (path !== '/' ? path : '');
    } catch {
      if (url.length > 30) return url.substring(0, 30) + '...';
      return url;
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl h-full flex flex-col p-0 bg-background overflow-hidden gap-0">
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
          <SheetDescription className="text-base text-muted-foreground">{lead.address || "Адрес не указан"}</SheetDescription>
          
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

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-6 space-y-8">
            <motion.div
              className="space-y-3"
              {...fadeUp}
              transition={{ duration: 0.2 }}
            >
              <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Изменить статус</h4>
              <ToggleGroup 
                type="single" 
                value={lead.lead_status} 
                onValueChange={(val) => val && onStatusChange(lead.id, val)}
                className="flex flex-wrap gap-2 justify-start"
              >
                {STATUSES.map(status => {
                  const isActive = lead.lead_status === status.id;
                  const getStatusBadgeStyles = (id: string) => {
                    switch(id) {
                      case 'NEW': return 'bg-blue-100 border-blue-400 text-blue-800';
                      case 'POTENTIAL': return 'bg-emerald-100 border-emerald-400 text-emerald-800';
                      case 'PROCESSED': return 'bg-amber-100 border-amber-400 text-amber-800';
                      case 'REJECT': return 'bg-slate-200 border-slate-400 text-slate-800';
                      case 'CHAIN': return 'bg-zinc-800 border-zinc-900 text-zinc-100';
                      default: return 'bg-slate-100 border-slate-400 text-slate-800';
                    }
                  };
                  return (
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

            <LeadModalPhotos lead={lead} />

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-6">
                <motion.div
                  className="space-y-4 bg-slate-50 p-4 rounded-lg border"
                  {...fadeLeft}
                  transition={{ duration: 0.22, delay: 0.03 }}
                >
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider border-b pb-2">Контакты</h4>
                  
                  {lead.phones && lead.phones.length > 0 ? (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                        <Phone className="size-4" />
                        Телефоны
                      </div>
                      {lead.phones.map((p, i) => (
                        <div key={i} className="flex flex-col">
                          <span className="font-semibold text-sm text-foreground">{p.number}</span>
                          {p.info && <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{p.info}</span>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                        <Phone className="size-4" />
                        Телефоны
                      </div>
                      <span className="text-sm text-muted-foreground italic">Не указаны</span>
                    </div>
                  )}

                  {lead.websites && lead.websites.length > 0 ? (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                        <Globe className="size-4" />
                        Сайты
                      </div>
                      {lead.websites.map((w, i) => {
                        const isBooking = /yclients|dikidi|prodoctorov|zoon|nethouse|taplink/i.test(w);
                        return (
                        <div key={i} className="flex items-center gap-2 overflow-hidden">
                          <a href={w} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline truncate" title={w}>
                            {formatUrl(w)}
                          </a>
                          {isBooking && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded uppercase font-bold shrink-0">Форма записи</span>}
                        </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                        <Globe className="size-4" />
                        Сайты
                      </div>
                      <span className="text-sm text-muted-foreground italic">Без сайта</span>
                    </div>
                  )}

                  {lead.social_links && lead.social_links.length > 0 ? (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                        <Link className="size-4" />
                        Соцсети
                      </div>
                      {lead.social_links.map((s, i) => {
                        const isBooking = /yclients|dikidi|prodoctorov|zoon|nethouse|taplink/i.test(s);
                        return (
                        <div key={i} className="flex items-center gap-2 overflow-hidden">
                          <a href={s} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline truncate" title={s}>
                            {formatUrl(s)}
                          </a>
                          {isBooking && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded uppercase font-bold shrink-0">Форма записи</span>}
                        </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                        <Link className="size-4" />
                        Соцсети
                      </div>
                      <span className="text-sm text-muted-foreground italic">Не указаны</span>
                    </div>
                  )}
                </motion.div>
              </div>

              <div className="space-y-4">
                <motion.div
                  className="flex flex-col gap-3 rounded-lg border bg-slate-50 p-4"
                  {...fadeRight}
                  transition={{ duration: 0.22, delay: 0.06 }}
                >
                  <div className="flex flex-col gap-3">
                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider border-b pb-2">Детали организации</h4>
                    
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground font-medium">Категория</span>
                      <div className="text-sm font-semibold text-slate-800">{lead.category || "Не указана"}</div>
                    </div>

                    {lead.region && (
                      <div className="space-y-1 pt-2 border-t border-slate-100">
                        <span className="text-xs text-muted-foreground font-medium">Регион</span>
                        <div className="text-sm font-medium text-slate-700">{lead.region}</div>
                      </div>
                    )}
                  </div>

                  {lead.source_url && (
                    <Button variant="outline" className="w-full shrink-0 bg-white" asChild>
                      <a href={lead.source_url} target="_blank" rel="noreferrer">
                        Открыть в Яндекс Картах
                        <ExternalLink className="ml-2 size-4" />
                      </a>
                    </Button>
                  )}
                </motion.div>

                {lead.reason && (
                  <motion.div
                    className="bg-orange-50 border border-orange-200 text-orange-900 p-4 rounded-lg"
                    {...fadeUp}
                    transition={{ duration: 0.2, delay: 0.09 }}
                  >
                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-2">Источник / Запрос</h4>
                    <p className="text-sm font-medium">{lead.reason}</p>
                  </motion.div>
                )}
              </div>
            </div>

            {/* History Section */}
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
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                    placeholder="Написать заметку или итог звонка..." 
                    className="flex-1 bg-white border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                  <Button onClick={handleAddComment} size="sm" className="shrink-0 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
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
          </div>
        </div>

        <div className="p-6 border-t bg-slate-50 flex gap-3 shrink-0">
          <Button variant="destructive" className="flex-1 font-medium transition-all" onClick={handleDeleteLead}>
            Снести лид из базы
          </Button>
          <Button variant="outline" className="flex-1 font-medium border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 transition-all" onClick={handleBlacklistBrand}>
            В чёрный список
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
