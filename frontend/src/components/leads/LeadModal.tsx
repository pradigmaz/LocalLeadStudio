import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { getApiErrorMessage, getErrorMessage, JSON_ACTION_HEADERS, LOCAL_ACTION_HEADERS, readJson } from "@/lib/api"
import type { Lead, LeadEvent, LeadStatus } from "@/types"
import { LeadModalConfirmDialogs } from "./LeadModalConfirmDialogs"
import { LeadModalHeader } from "./LeadModalHeader"
import { LeadModalHistory } from "./LeadModalHistory"
import { LeadModalInfoGrid } from "./LeadModalInfoGrid"
import { LeadModalPhotos } from "./LeadModalPhotos"
import { LeadModalStatusControls } from "./LeadModalStatusControls"

interface ApiError {
  error?: string;
  detail?: unknown;
}

interface LeadModalProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (leadId: string, newStatus: LeadStatus) => void;
  onPriorityChange: (leadId: string, priority: number) => void;
  onLeadDeleted: (leadId: string) => void;
}

const BOOKING_LINK_RE = /yclients|dikidi|prodoctorov|zoon|nethouse|taplink/i;

const dedupeLinks = (links: string[]) => [...new Set(links.filter(Boolean))];

export function LeadModal({ lead, isOpen, onClose, onStatusChange, onPriorityChange, onLeadDeleted }: LeadModalProps) {
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBlacklistDialogOpen, setIsBlacklistDialogOpen] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);

  const loadLeadEvents = useCallback(async (leadId: string, isCancelled: () => boolean) => {
    setIsLoadingEvents(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/events`);
      const data = await readJson<{ events?: LeadEvent[] }>(res);
      if (!isCancelled()) setEvents(data.events || []);
    } catch (error) {
      if (!isCancelled()) console.error("Failed to load lead events", error);
    } finally {
      if (!isCancelled()) setIsLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;
    queueMicrotask(() => {
      if (isCancelled) return;
      if (lead && isOpen) {
        void loadLeadEvents(lead.id, () => isCancelled);
      } else {
        setEvents([]);
        setNewComment("");
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [lead, isOpen, loadLeadEvents]);

  if (!lead) return null;

  const handleAddComment = async () => {
    const comment = newComment.trim();
    if (!comment) return;
    try {
      const res = await fetch(`/api/leads/${lead.id}/events`, {
        method: "POST",
        headers: JSON_ACTION_HEADERS,
        body: JSON.stringify({ comment })
      });
      if (res.ok) {
        setEvents(current => [{
          event_type: "COMMENT",
          old_value: null,
          new_value: null,
          comment,
          created_at: new Date().toISOString()
        }, ...current]);
        setNewComment("");
      } else {
        const data: ApiError = await res.json().catch(() => ({}));
        toast.error(`Ошибка при добавлении комментария: ${getApiErrorMessage(data, "Ошибка сервера")}`);
      }
    } catch (error: unknown) {
      toast.error(`Ошибка: ${getErrorMessage(error)}`);
    }
  };

  const handleDeleteLead = async () => {
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'DELETE',
        headers: LOCAL_ACTION_HEADERS
      });
      if (res.ok) {
        toast.success("Лид удален из базы.");
        onLeadDeleted(lead.id);
        onClose();
      } else {
        const data: ApiError = await res.json().catch(() => ({}));
        toast.error(`Ошибка при удалении: ${getApiErrorMessage(data, 'Ошибка сервера')}`);
      }
    } catch (error: unknown) {
      toast.error(`Ошибка: ${getErrorMessage(error)}`);
    } finally {
      setIsDeleteDialogOpen(false);
    }
  };

  const handleBlacklistBrand = async () => {
    const stored = localStorage.getItem('yamap_blacklist') || "";
    const words = stored.split(',').map(w => w.trim()).filter(Boolean);
    if (!words.includes(lead.name)) {
      words.push(lead.name);
      localStorage.setItem('yamap_blacklist', words.join(', '));
    }

    onStatusChange(lead.id, 'CHAIN');
    toast.success(`"${lead.name}" добавлен в чёрный список.`);
    setIsBlacklistDialogOpen(false);
    onClose();
  };

  const handleOpenLeadFolder = async () => {
    setIsOpeningFolder(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/open-folder`, { method: "POST", headers: LOCAL_ACTION_HEADERS });
      const data: ApiError & { path?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(getApiErrorMessage(data, "Папка карточки не найдена"));
        return;
      }
      toast.success("Папка карточки открыта");
    } catch (error: unknown) {
      toast.error(`Ошибка: ${getErrorMessage(error)}`);
    } finally {
      setIsOpeningFolder(false);
    }
  };

  const websiteLinks = dedupeLinks(lead.websites || []).filter(link => !BOOKING_LINK_RE.test(link));
  const socialLinks = dedupeLinks(lead.social_links || []).filter(link => !BOOKING_LINK_RE.test(link));
  const bookingLinks = dedupeLinks([
    ...(lead.websites || []),
    ...(lead.social_links || []),
  ].filter(link => BOOKING_LINK_RE.test(link)));

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl h-full flex flex-col p-0 bg-background overflow-hidden gap-0">
        <LeadModalHeader lead={lead} />

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-6 space-y-8">
            <LeadModalStatusControls
              lead={lead}
              onStatusChange={onStatusChange}
              onPriorityChange={onPriorityChange}
            />
            <LeadModalPhotos lead={lead} />
            <LeadModalInfoGrid
              lead={lead}
              websiteLinks={websiteLinks}
              socialLinks={socialLinks}
              bookingLinks={bookingLinks}
              isOpeningFolder={isOpeningFolder}
              onOpenLeadFolder={handleOpenLeadFolder}
            />
            <LeadModalHistory
              events={events}
              isLoadingEvents={isLoadingEvents}
              newComment={newComment}
              onCommentChange={setNewComment}
              onAddComment={handleAddComment}
            />
          </div>
        </div>

        <div className="p-6 border-t bg-slate-50 flex gap-3 shrink-0">
          <Button variant="destructive" className="flex-1 font-medium transition-all" onClick={() => setIsDeleteDialogOpen(true)}>
            Снести лид из базы
          </Button>
          <Button variant="outline" className="flex-1 font-medium border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 transition-all" onClick={() => setIsBlacklistDialogOpen(true)}>
            В чёрный список
          </Button>
        </div>
      </SheetContent>

      <LeadModalConfirmDialogs
        lead={lead}
        isDeleteDialogOpen={isDeleteDialogOpen}
        isBlacklistDialogOpen={isBlacklistDialogOpen}
        onDeleteDialogChange={setIsDeleteDialogOpen}
        onBlacklistDialogChange={setIsBlacklistDialogOpen}
        onDeleteLead={handleDeleteLead}
        onBlacklistBrand={handleBlacklistBrand}
      />
    </Sheet>
  )
}
