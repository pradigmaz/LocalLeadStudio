import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, Database, Settings, Trash2, Download, Upload } from 'lucide-react';
import { motion } from 'framer-motion';

interface Preset {
  id: string;
  name: string;
  type?: string;
  cities?: string[];
  niches?: string[];
  queries?: string;
}

interface ApiError {
  error?: string;
}

const defaultBlacklist = "Пятерочка, Магнит, Перекресток, Сбербанк, ВТБ";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Ошибка сети/подключения';

export function SettingsDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const [blacklist, setBlacklist] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [rawJson, setRawJson] = useState("");
  const [isCleaning, setIsCleaning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSettings = () => {
    setBlacklist(localStorage.getItem('yamap_blacklist') || defaultBlacklist);

    const storedPresets = localStorage.getItem('yamap_presets_json');
      if (storedPresets) {
        try {
          const parsed = JSON.parse(storedPresets) as Preset[];
          setPresets(parsed);
          setRawJson(JSON.stringify(parsed, null, 2));
        } catch {
          setPresets([]);
          setRawJson("[]");
        }
      } else {
        setPresets([]);
        setRawJson("[]");
      }
  };

  const handleOpenChange = (open: boolean) => {
    if (open) {
      loadSettings();
    }
    setIsOpen(open);
  };

  const saveBlacklist = () => {
    localStorage.setItem('yamap_blacklist', blacklist);
    alert('Чёрный список сохранён!');
    window.dispatchEvent(new Event('yamap_blacklist_updated'));
  };

  const handleDeletePreset = (id: string) => {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    setRawJson(JSON.stringify(updated, null, 2));
    localStorage.setItem('yamap_presets_json', JSON.stringify(updated));
    window.dispatchEvent(new Event('yamap_presets_updated'));
  };

  const handleSaveRawJson = () => {
    try {
      const parsed = JSON.parse(rawJson);
      if (!Array.isArray(parsed)) throw new Error("Пресеты должны быть массивом JSON");
      setPresets(parsed);
      localStorage.setItem('yamap_presets_json', JSON.stringify(parsed));
      window.dispatchEvent(new Event('yamap_presets_updated'));
      alert("Пресеты успешно импортированы!");
    } catch (error: unknown) {
      alert(`Ошибка разбора JSON: ${getErrorMessage(error)}`);
    }
  };

  const handleCleanDB = async () => {
    if (!window.confirm("Удалить все неликвидные и сетевые лиды?")) return;
    setIsCleaning(true);
    try {
      const res = await fetch('/api/settings/clean_db', { method: 'POST' });
      const data: ApiError = await res.json().catch(() => ({}));
      if (res.ok) {
        alert("База успешно очищена от мусора.");
        window.location.reload();
      } else {
        alert(`Ошибка при очистке БД: ${data.error || res.statusText || 'Неизвестная ошибка'}`);
      }
    } catch (error: unknown) {
      console.error(error);
      alert(`Ошибка при очистке БД: ${getErrorMessage(error)}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleResetDB = async () => {
    if (!window.confirm("ВНИМАНИЕ! Это действие удалит ВСЕ лиды из базы. Вы уверены?")) return;
    setIsCleaning(true);
    try {
      const res = await fetch('/api/settings/reset_db', { method: 'POST' });
      const data: ApiError = await res.json().catch(() => ({}));
      if (res.ok) {
        alert("База данных полностью сброшена.");
        window.location.reload();
      } else {
        alert(`Ошибка при сбросе БД: ${data.error || res.statusText || 'Неизвестная ошибка'}`);
      }
    } catch (error: unknown) {
      console.error(error);
      alert(`Ошибка при сбросе БД: ${getErrorMessage(error)}`);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleExportDB = () => {
    window.location.href = '/api/settings/export';
  };

  const handleImportDB = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCleaning(true);
    try {
      const buffer = await file.arrayBuffer();
      const res = await fetch('/api/settings/import', {
        method: 'POST',
        body: buffer,
        headers: {
          'Content-Type': 'application/octet-stream'
        }
      });
      const data: ApiError = await res.json().catch(() => ({}));
      if (res.ok) {
        alert("База данных успешно импортирована.");
        window.location.reload();
      } else {
        alert(`Ошибка при импорте БД: ${data.error || res.statusText || 'Неизвестная ошибка'}`);
      }
    } catch (error: unknown) {
      console.error(error);
      alert(`Ошибка при импорте БД: ${getErrorMessage(error)}`);
    } finally {
      setIsCleaning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 shrink-0">
          <Settings className="size-4" />
          Настройки
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Настройки парсера</DialogTitle>
        </DialogHeader>
 
        <Tabs defaultValue="blacklist" className="w-full flex-1 flex flex-col min-h-0 mt-4">
          <TabsList className="grid w-full grid-cols-3 shrink-0">
            <TabsTrigger value="blacklist">Чёрный список</TabsTrigger>
            <TabsTrigger value="presets">Пресеты</TabsTrigger>
            <TabsTrigger value="db">База данных</TabsTrigger>
          </TabsList>
 
          <TabsContent value="blacklist" className="pt-4 flex-1 flex flex-col min-h-0 overflow-hidden">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-1 flex-col gap-4 min-h-0"
            >
            <div className="flex flex-1 flex-col gap-2 min-h-0">
              <p className="text-sm text-muted-foreground shrink-0">
                Укажите ключевые слова (через запятую) для авто-отбраковки сетевиков. Если эти слова будут в названии, парсер пометит лид как "Сетевик".
              </p>
              <Textarea 
                value={blacklist}
                onChange={(e) => setBlacklist(e.target.value)}
                placeholder="Пятерочка, Магнит..."
                className="bg-white font-mono text-sm border-slate-200 focus:ring-primary/20 focus-visible:ring-primary/20 resize-y flex-1 min-h-[150px]"
              />
            </div>
            <Button onClick={saveBlacklist} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium shrink-0 shadow-sm transition-colors">Сохранить список</Button>
            </motion.div>
          </TabsContent>
 
          <TabsContent value="presets" className="pt-4 flex-1 flex flex-col min-h-0 overflow-hidden">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-1 flex-col gap-3 min-h-0"
            >
              <ScrollArea className="min-h-0 flex-1 rounded-lg border bg-slate-50/50 p-2">
                <div className="flex flex-col gap-2">
                  {presets.map(p => (
                    <Card key={p.id} className="gap-0 rounded-lg py-3 shadow-xs">
                      <CardContent className="flex items-center justify-between gap-3 px-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-slate-900">{p.name}</div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {p.type === 'constructor' 
                              ? `${p.cities?.join(', ') || 'нет городов'} / ${p.niches?.join(', ') || 'нет ниш'}`
                              : `${p.queries?.split('\n').filter(Boolean).length || 0} запросов`}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0 text-red-500 hover:bg-red-50 hover:text-red-700"
                          onClick={() => handleDeletePreset(p.id)}
                          aria-label="Удалить пресет"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {presets.length === 0 && (
                    <div className="rounded-lg border border-dashed bg-white py-8 text-center text-xs text-muted-foreground">
                      Пресеты отсутствуют.
                    </div>
                  )}
                </div>
              </ScrollArea>

              <Collapsible className="shrink-0 rounded-lg border bg-white">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="h-9 w-full justify-between px-3 text-xs font-medium">
                    Импорт / экспорт JSON
                    <ChevronDown className="size-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t p-3">
                  <div className="flex flex-col gap-2">
                    <Textarea
                      value={rawJson}
                      onChange={(e) => setRawJson(e.target.value)}
                      rows={5}
                      className="font-mono text-[11px] bg-white border-slate-200 resize-y"
                    />
                    <Button onClick={handleSaveRawJson} className="h-8 w-full text-xs">
                      Импортировать JSON
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </motion.div>
          </TabsContent>
 
          <TabsContent value="db" className="pt-4 flex-1 overflow-y-auto space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4"
            >
              <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Database className="size-4 text-slate-500" />
                Резервное копирование
              </h4>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-medium text-sm text-slate-900">Экспорт / Импорт БД</h5>
                    <p className="text-xs text-muted-foreground">Скачайте текущую БД или загрузите из файла `.db`.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportDB} disabled={isCleaning} className="bg-white">
                      <Download className="size-4 mr-1" /> Экспорт
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isCleaning} className="bg-white">
                      <Upload className="size-4 mr-1" /> Импорт
                    </Button>
                    <input type="file" ref={fileInputRef} onChange={handleImportDB} accept=".db" className="hidden" />
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex flex-col gap-4 rounded-xl border border-red-100 bg-red-50/50 p-4"
            >
              <h4 className="flex items-center gap-2 text-sm font-semibold text-red-900">
                <Trash2 className="size-4" />
                Опасная зона
              </h4>

              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="font-medium text-sm text-slate-900">Очистка мусора</h5>
                    <p className="text-xs text-muted-foreground">Удаляет лиды со статусами Неликвид, Сетевик, Мусор.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCleanDB} disabled={isCleaning} className="bg-white border-red-200 hover:bg-red-100 text-red-700 hover:text-red-800">
                    Очистить
                  </Button>
                </div>
 
                <div className="flex items-center justify-between border-t border-red-100 pt-3">
                  <div>
                    <h5 className="font-medium text-sm text-red-700">Полный сброс базы</h5>
                    <p className="text-xs text-red-600/80">Удаляет абсолютно все лиды и результаты парсинга.</p>
                  </div>
                  <Button variant="destructive" size="sm" onClick={handleResetDB} disabled={isCleaning}>
                    Сбросить БД
                  </Button>
                </div>
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
