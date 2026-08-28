import { Button } from "@/components/ui/button"
import { Camera, Clock, ExternalLink, FolderOpen, Globe, Link, MessageCircle, Music2, Phone, PhoneCall, Play, Send } from "lucide-react"
import { motion } from "framer-motion"
import type { Lead } from "@/types"
import { formatDisplayUrl, isTildaSite, isYandexBusinessSite } from "@/lib/url"
import { dedupeSocialLinks, getSocialPlatform, type SocialPlatform } from "@/lib/social-platform"

const fadeLeft = { initial: { opacity: 0, x: -12 }, animate: { opacity: 1, x: 0 } };
const fadeRight = { initial: { opacity: 0, x: 12 }, animate: { opacity: 1, x: 0 } };

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  vk: "VK",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  max: "MAX",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  viber: "Viber",
  ok: "Одноклассники",
  tiktok: "TikTok",
  x: "X",
  link: "Ссылка",
}

function SocialPlatformIcon({ platform }: { platform: SocialPlatform }) {
  const boxClass = "flex size-6 shrink-0 items-center justify-center rounded-md"
  switch (platform) {
    case "vk":
      return <span className={`${boxClass} bg-[#0077ff] text-[9px] font-black tracking-[-0.08em] text-white`}>VK</span>
    case "whatsapp":
      return <span className={`${boxClass} bg-[#25d366] text-white`}><PhoneCall className="size-3.5" /></span>
    case "telegram":
      return <span className={`${boxClass} bg-[#229ed9] text-white`}><Send className="size-3.5" /></span>
    case "max":
      return <span className={`${boxClass} bg-slate-950 text-[8px] font-black tracking-[-0.08em] text-white`}>MAX</span>
    case "youtube":
      return <span className={`${boxClass} bg-[#ff0000] text-white`}><Play className="size-3.5 fill-current" /></span>
    case "instagram":
      return <span className={`${boxClass} bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcaf45] text-white`}><Camera className="size-3.5" /></span>
    case "facebook":
      return <span className={`${boxClass} bg-[#1877f2] text-sm font-black text-white`}>f</span>
    case "viber":
      return <span className={`${boxClass} bg-[#7360f2] text-white`}><MessageCircle className="size-3.5" /></span>
    case "ok":
      return <span className={`${boxClass} bg-[#ee8208] text-[8px] font-black text-white`}>OK</span>
    case "tiktok":
      return <span className={`${boxClass} bg-black text-white`}><Music2 className="size-3.5" /></span>
    case "x":
      return <span className={`${boxClass} bg-black text-xs font-black text-white`}>X</span>
    default:
      return <span className={`${boxClass} bg-slate-100 text-slate-600`}><Link className="size-3.5" /></span>
  }
};

const getSourceLabel = (source: string) => {
  if (source === 'yandex') return 'Открыть в Яндекс';
  return 'Открыть источник';
};

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
  const visibleSocialLinks = dedupeSocialLinks(socialLinks)
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
              websiteLinks.map((w, i) => {
                const platformLabel = isYandexBusinessSite(w)
                  ? "Сайт на Яндекс Бизнесе"
                  : isTildaSite(w)
                    ? "Сайт на Tilda"
                    : null

                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 overflow-hidden">
                    <a href={w} target="lead-studio-site" rel="noreferrer" className="text-sm font-medium text-primary hover:underline truncate" title={w}>
                      {formatDisplayUrl(w)}
                    </a>
                    {platformLabel && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        {platformLabel}
                      </span>
                    )}
                  </div>
                )
              })
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
                  target="lead-studio-site"
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
            {visibleSocialLinks.length > 0 ? (
              visibleSocialLinks.map((s, i) => {
                const platform = getSocialPlatform(s)
                return <a
                  key={i}
                  href={s}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 overflow-hidden rounded-lg px-2 py-1.5 text-sm font-medium text-primary hover:bg-slate-50 transition-colors"
                  title={s}
                  aria-label={`${SOCIAL_LABELS[platform]}: ${formatDisplayUrl(s)}`}
                >
                  <SocialPlatformIcon platform={platform} />
                  <span className="truncate">{formatDisplayUrl(s)}</span>
                </a>
              })
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
      </div>
    </div>
  );
}
