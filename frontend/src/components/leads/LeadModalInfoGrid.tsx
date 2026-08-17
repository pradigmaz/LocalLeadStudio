import { Button } from "@/components/ui/button"
import { Clock, ExternalLink, FolderOpen, Globe, Link, Phone } from "lucide-react"
import { motion } from "framer-motion"
import type { Lead } from "@/types"
import { formatDisplayUrl } from "@/lib/url"

const fadeLeft = { initial: { opacity: 0, x: -12 }, animate: { opacity: 1, x: 0 } };
const fadeRight = { initial: { opacity: 0, x: 12 }, animate: { opacity: 1, x: 0 } };
const fadeUp = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };

const getSocialLabel = (url: string) => {
  if (/vk\.com|vkontakte/i.test(url)) return 'VK';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YouTube';
  if (/t\.me|telegram/i.test(url)) return 'Telegram';
  if (/wa\.me|whatsapp/i.test(url)) return 'WhatsApp';
  if (/viber/i.test(url)) return 'Viber';
  return 'Ссылка';
};

const getSourceLabel = (source: string) => {
  if (source === 'yandex') return 'Открыть в Яндекс';
  return 'Открыть источник';
};

const getReasonText = (reason: string) => reason.replace(/^Парсинг\s+2gis:\s*/i, 'Поисковый запрос: ');

interface LeadModalInfoGridProps {
  lead: Lead;
  websiteLinks: string[];
  socialLinks: string[];
  bookingLinks: string[];
  isOpeningFolder: boolean;
  onOpenLeadFolder: () => void;
}

export function LeadModalInfoGrid({
  lead,
  websiteLinks,
  socialLinks,
  bookingLinks,
  isOpeningFolder,
  onOpenLeadFolder,
}: LeadModalInfoGridProps) {
  const sourceLinks = lead.sources && lead.sources.length > 0
    ? lead.sources.filter((source) => source.source !== '2gis' && source.source_url)
    : lead.source_url
      ? [{ source: 'yandex', source_url: lead.source_url }]
      : [];

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-6">
        <motion.div
          className="space-y-4 bg-slate-50 p-4 rounded-lg border"
          {...fadeLeft}
          transition={{ duration: 0.22, delay: 0.03 }}
        >
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider border-b pb-2">Контакты</h4>

          <div className="space-y-2">
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
              <Phone className="size-4" />
              Телефоны
            </div>
            {lead.phones && lead.phones.length > 0 ? (
              lead.phones.map((p, i) => (
                <div key={i} className="flex flex-col">
                  <span className="font-semibold text-sm text-foreground">{p.number}</span>
                  {p.info && <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{p.info}</span>}
                </div>
              ))
            ) : (
              <span className="text-sm text-muted-foreground italic">Не указаны</span>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
              <Globe className="size-4" />
              Сайты
            </div>
            {websiteLinks.length > 0 ? (
              websiteLinks.map((w, i) => (
                <div key={i} className="flex items-center gap-2 overflow-hidden">
                  <a href={w} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline truncate" title={w}>
                    {formatDisplayUrl(w)}
                  </a>
                </div>
              ))
            ) : (
              <span className="text-sm text-muted-foreground italic">Без сайта</span>
            )}
          </div>

          {bookingLinks.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
                <Clock className="size-4" />
                Онлайн-запись
              </div>
              {bookingLinks.map((s, i) => (
                <a
                  key={i}
                  href={s}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50 transition-colors"
                  title={s}
                >
                  <span className="truncate">{formatDisplayUrl(s)}</span>
                  <ExternalLink className="size-3.5 shrink-0" />
                </a>
              ))}
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="text-xs text-muted-foreground font-medium flex items-center gap-2">
              <Link className="size-4" />
              Соцсети и мессенджеры
            </div>
            {socialLinks.length > 0 ? (
              socialLinks.map((s, i) => (
                <a
                  key={i}
                  href={s}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5 text-sm font-medium text-primary hover:bg-slate-50 transition-colors"
                  title={s}
                >
                  <span className="min-w-18 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                    {getSocialLabel(s)}
                  </span>
                  <span className="truncate">{formatDisplayUrl(s)}</span>
                </a>
              ))
            ) : (
              <span className="text-sm text-muted-foreground italic">Не указаны</span>
            )}
          </div>
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

          {sourceLinks.map((source) => (
            <Button key={`${source.source}:${source.source_url}`} variant="outline" className="w-full shrink-0 bg-white" asChild>
              <a href={source.source_url} target="_blank" rel="noreferrer">
                {getSourceLabel(source.source)}
                <ExternalLink className="ml-2 size-4" />
              </a>
            </Button>
          ))}
          <Button
            variant="outline"
            className="w-full shrink-0 bg-white"
            onClick={onOpenLeadFolder}
            disabled={isOpeningFolder}
          >
            Открыть папку карточки
            <FolderOpen className="ml-2 size-4" />
          </Button>
        </motion.div>

        {lead.reason && (
          <motion.div
            className="bg-orange-50 border border-orange-200 text-orange-900 p-4 rounded-lg"
            {...fadeUp}
            transition={{ duration: 0.2, delay: 0.09 }}
          >
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-2">Источник / Запрос</h4>
            <p className="text-sm font-medium">{getReasonText(lead.reason)}</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
