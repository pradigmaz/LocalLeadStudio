import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Search, Star } from "lucide-react"
import type { Lead } from "@/types"

interface LeadsTableProps {
  leads: Lead[];
  onLeadClick: (lead: Lead) => void;
}

export function LeadsTable({ leads, onLeadClick }: LeadsTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("NEW");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [cityFilter, setCityFilter] = useState<string>("ALL");
  const [reviewFilter, setReviewFilter] = useState<string>("ALL");

  const uniqueCities = useMemo(
    () => Array.from(new Set(leads.map(l => l.city).filter(Boolean))).sort(),
    [leads]
  );

  // Filter logic
  const filteredLeads = useMemo(() => leads.filter(lead => {
    const matchesSearch =
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.address || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.category || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "ALL" || lead.lead_status === statusFilter;

    const matchesType = typeFilter === "ALL" || lead.lead_type === typeFilter;

    const matchesCity = cityFilter === "ALL" || lead.city === cityFilter;

    let matchesReviews = true;
    const revCount = lead.review_count || 0;
    if (reviewFilter === "0-10") matchesReviews = revCount <= 10;
    else if (reviewFilter === "10-50") matchesReviews = revCount > 10 && revCount <= 50;
    else if (reviewFilter === "50-100") matchesReviews = revCount > 50 && revCount <= 100;
    else if (reviewFilter === "100+") matchesReviews = revCount > 100;

    return matchesSearch && matchesStatus && matchesType && matchesCity && matchesReviews;
  }), [leads, searchTerm, statusFilter, typeFilter, cityFilter, reviewFilter]);

  const sortedLeads = useMemo(() => [...filteredLeads].sort((a, b) => {
    // 1. Priority
    const priorityA = a.priority || 0;
    const priorityB = b.priority || 0;
    if (priorityA !== priorityB) {
      if (priorityA === 0) return 1;
      if (priorityB === 0) return -1;
      return priorityA - priorityB;
    }

    // 2. Type: NEW_SITE first (list already arrives created_at DESC from API)
    if (a.lead_type !== b.lead_type) {
      if (a.lead_type === 'NEW_SITE') return -1;
      if (b.lead_type === 'NEW_SITE') return 1;
    }
    return 0;
  }), [filteredLeads]);

  if (leads.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-12 text-center border-2 border-dashed rounded-xl bg-white/50 backdrop-blur-md">
        <svg className="w-12 h-12 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
        <p className="font-medium">В базе пока нет записей</p>
        <p className="text-sm mt-1">Запустите поиск для сбора данных</p>
      </div>
    );
  }

  const getStatusBadgeStyles = (status: string) => {
    switch(status) {
      case 'NEW': return 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20 border-none shadow-none font-medium';
      case 'POTENTIAL': return 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 border-none shadow-none font-medium';
      case 'IN_PROGRESS': return 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20 border-none shadow-none font-medium';
      case 'PROCESSED': return 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 border-none shadow-none font-medium';
      case 'REJECT': return 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-600/20 border-none shadow-none font-medium';
      case 'CHAIN': return 'bg-zinc-800 text-zinc-100 ring-1 ring-inset ring-zinc-700 border-none shadow-none font-medium';
      default: return 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-600/20 border-none shadow-none font-medium';
    }
  };

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'NEW': return 'Новый';
      case 'POTENTIAL': return 'Потенциальный';
      case 'IN_PROGRESS': return 'В работе';
      case 'PROCESSED': return 'Отработано';
      case 'REJECT': return 'Неликвид';
      case 'CHAIN': return 'Сетевик';
      default: return status;
    }
  }

  const isViewedNewLead = (lead: Lead) => lead.lead_status === 'NEW' && Boolean(lead.viewed_at);

  return (
    <div className="p-1.5 rounded-4xl bg-slate-50/50 border border-slate-200/50 shadow-sm flex flex-col">
      <div className="rounded-[1.625rem] bg-white/80 backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)] border border-slate-100 overflow-hidden flex flex-col flex-1">
        {/* Фильтры и поиск */}
        <div className="p-5 border-b border-slate-100 bg-white/40 flex flex-wrap items-center gap-5 shrink-0">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Поиск по названию, адресу или категории..."
              className="bg-white/80 backdrop-blur-sm border-slate-200/60 shadow-sm hover:border-slate-300 focus-visible:ring-emerald-500/20 transition-all rounded-xl pl-10 h-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex gap-3">
            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
            >
              <SelectTrigger className="w-[210px] bg-white/80 backdrop-blur-sm border-slate-200/60 shadow-sm hover:bg-slate-50 transition-all rounded-xl h-10 font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl shadow-lg border-slate-100">
                <SelectItem value="NEW" className="rounded-lg cursor-pointer">Новые</SelectItem>
                <SelectItem value="POTENTIAL" className="rounded-lg cursor-pointer">Потенциальные</SelectItem>
                <SelectItem value="IN_PROGRESS" className="rounded-lg cursor-pointer">В работе</SelectItem>
                <SelectItem value="PROCESSED" className="rounded-lg cursor-pointer">Отработанные</SelectItem>
                <SelectItem value="REJECT" className="rounded-lg cursor-pointer">Неликвид</SelectItem>
                <SelectItem value="ALL" className="rounded-lg cursor-pointer">Все статусы</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={typeFilter}
              onValueChange={setTypeFilter}
            >
              <SelectTrigger className="w-[150px] bg-white/80 backdrop-blur-sm border-slate-200/60 shadow-sm hover:bg-slate-50 transition-all rounded-xl h-10 font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl shadow-lg border-slate-100">
                <SelectItem value="ALL" className="rounded-lg cursor-pointer">Все сайты</SelectItem>
                <SelectItem value="NEW_SITE" className="rounded-lg cursor-pointer">Новый сайт</SelectItem>
                <SelectItem value="REDESIGN" className="rounded-lg cursor-pointer">Редизайн</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-50/40 backdrop-blur-md">
            <TableRow className="border-slate-100 hover:bg-transparent">
              <TableHead className="w-[300px] text-slate-500 font-medium py-3">Название / Адрес</TableHead>
              <TableHead className="w-[200px] py-3">
                <Select value={cityFilter} onValueChange={setCityFilter}>
                  <SelectTrigger className="h-8 border-none shadow-none bg-transparent px-2 font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100/50 rounded-lg transition-all focus:ring-0">
                    <div className="flex items-center gap-1.5">
                      <span>Город:</span>
                      <span className="text-slate-900"><SelectValue placeholder="Все" /></span>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl shadow-lg border-slate-100">
                    <SelectItem value="ALL" className="rounded-lg cursor-pointer">Все города</SelectItem>
                    {uniqueCities.map(city => (
                      <SelectItem key={city} value={city} className="rounded-lg cursor-pointer">{city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableHead>
              <TableHead className="text-slate-500 font-medium py-3">Статус</TableHead>
              <TableHead className="text-slate-500 font-medium py-3">Тип</TableHead>
              <TableHead className="text-right text-slate-500 font-medium py-3">Рейтинг</TableHead>
              <TableHead className="text-right w-[150px] py-3">
                <Select value={reviewFilter} onValueChange={setReviewFilter}>
                  <SelectTrigger className="h-8 border-none shadow-none bg-transparent px-2 font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100/50 rounded-lg transition-all focus:ring-0 flex justify-end w-full">
                    <div className="flex items-center gap-1.5 justify-end w-full">
                      <span>Отзывы:</span>
                      <span className="text-slate-900"><SelectValue placeholder="Все" /></span>
                    </div>
                  </SelectTrigger>
                  <SelectContent align="end" className="rounded-xl shadow-lg border-slate-100">
                    <SelectItem value="ALL" className="rounded-lg cursor-pointer">Все</SelectItem>
                    <SelectItem value="0-10" className="rounded-lg cursor-pointer">0-10</SelectItem>
                    <SelectItem value="10-50" className="rounded-lg cursor-pointer">10-50</SelectItem>
                    <SelectItem value="50-100" className="rounded-lg cursor-pointer">50-100</SelectItem>
                    <SelectItem value="100+" className="rounded-lg cursor-pointer">100+</SelectItem>
                  </SelectContent>
                </Select>
              </TableHead>
            </TableRow>
          </TableHeader>
          
          {filteredLeads.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={6} className="p-0">
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-16 text-center bg-slate-50/30 border border-dashed border-slate-200/60 rounded-3xl m-6 transition-all">
                    <svg className="w-12 h-12 mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                    <p className="font-medium text-slate-600">Ничего не найдено</p>
                    <p className="text-sm mt-1">Попробуйте изменить параметры фильтрации</p>
                  </div>
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody className="divide-y divide-slate-100/50">
              {sortedLeads.map((lead) => (
                <tr
                  key={lead.id}
                  className={`cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group border-transparent ${isViewedNewLead(lead)
                    ? 'bg-slate-50/80 grayscale opacity-75 hover:bg-slate-100/80 hover:opacity-100 hover:shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:border-slate-200/70'
                    : 'hover:bg-slate-50/60 hover:shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:border-slate-100/50'}`}
                  onClick={() => onLeadClick(lead)}
                >
                <TableCell className="font-medium align-middle py-4">
                  <div className="flex items-center gap-2">
                    {(lead.priority || 0) > 0 && (
                      <Badge variant="outline" className="bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20 border-none shadow-none px-1.5 py-0 h-5 shrink-0 text-[10px] font-bold">
                        {lead.priority}
                      </Badge>
                    )}
                    <div className="line-clamp-1 group-hover:text-emerald-700 transition-colors duration-300">{lead.name}</div>
                    {isViewedNewLead(lead) && (
                      <Badge variant="outline" className="bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-500/10 border-none shadow-none px-1.5 py-0 h-5 shrink-0 text-[10px] font-medium">
                        Просмотрено
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 line-clamp-1 mt-1 font-normal group-hover:text-slate-500 transition-colors duration-300">{lead.address || "Адрес не указан"}</div>
                </TableCell>
                <TableCell className="align-middle text-sm text-slate-500">
                  {lead.city || "-"}
                </TableCell>
                <TableCell className="align-middle">
                  <Badge variant="outline" className={`${getStatusBadgeStyles(lead.lead_status)} ${isViewedNewLead(lead) ? 'opacity-70' : ''}`}>
                    {getStatusLabel(lead.lead_status)}
                  </Badge>
                </TableCell>
                <TableCell className="align-middle">
                  {lead.lead_type === 'REDESIGN' ? (
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-600/20 border-none shadow-none font-medium">
                      Редизайн
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-500/10 border-none shadow-none font-medium">
                      Новый сайт
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right align-middle">
                  <div className="flex items-center justify-end gap-1.5 text-amber-600">
                    <Star className="size-3.5 fill-current" />
                    <span className="font-medium">{typeof lead.rating === 'number' ? lead.rating.toFixed(1) : (lead.rating || '-')}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground text-sm align-middle">
                  {lead.review_count || 0}
                </TableCell>
              </tr>
              ))}
            </tbody>
          )}
        </Table>
      </div>
      </div>
    </div>
  )
}
