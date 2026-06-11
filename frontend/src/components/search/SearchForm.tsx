import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Toggle } from "@/components/ui/toggle"
import { toast } from "sonner"
import type { RunConfig } from "@/types"
import { REGIONS, NICHES } from "./data"
import { SearchPresetBar, type Preset } from "./SearchPresetBar"

type TabId = 'builder' | 'manual';

interface SearchFormProps {
  onRun: (config: RunConfig) => Promise<void>;
  isLoading: boolean;
}

const defaultConfig = (): RunConfig => ({
  queries: "",
  runName: "ramon_test",
  maxPerQuery: 10,
  minReviews: 1,
  outputDir: "lead_studio_data",
  excludeChains: localStorage.getItem('yamap_blacklist') || "Пятерочка, Магнит, Перекресток, Сбербанк, ВТБ",
  skipWithSite: false,
  keepSitesForRedesign: true,
  requirePhotos: true,
  downloadPhotos: false,
  fields_to_parse: ["sites", "socials", "phones", "photos"]
});

export function SearchForm({ onRun, isLoading }: SearchFormProps) {
  const [selectedRegion, setSelectedRegion] = useState<string>('Воронежская область');
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedNicheItems, setSelectedNicheItems] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('builder');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>("");
  const [newPresetName, setNewPresetName] = useState("");

  const [config, setConfig] = useState<RunConfig>(defaultConfig);

  const builderQueries = selectedCities.flatMap((city) =>
    selectedNicheItems.map((niche) => `${city} ${niche}`)
  ).join('\n');

  const runConfig = activeTab === 'builder' ? { ...config, queries: builderQueries } : config;

  const handleChange = <K extends keyof RunConfig>(field: K, value: RunConfig[K]) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const toggleCity = (city: string) => {
    setSelectedCities(prev => prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]);
  };

  const toggleNicheItem = (item: string) => {
    setSelectedNicheItems(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
  };

  // Load presets & blacklist
  useEffect(() => {
    const loadPresets = () => {
      const stored = localStorage.getItem('yamap_presets_json');
      if (stored) {
        try {
          setPresets(JSON.parse(stored));
        } catch {
          setPresets([]);
        }
      } else {
        const defaultPresets: Preset[] = [
          {
            id: '1',
            name: 'Рамонь: кафе и бассейны (Конструктор)',
            type: 'constructor',
            region: 'Воронежская область',
            cities: ['Рамонь', 'Берёзово'],
            niches: ['кафе', 'бассейны']
          },
          {
            id: '2',
            name: 'Воронеж: рестораны и бьюти (Конструктор)',
            type: 'constructor',
            region: 'Воронежская область',
            cities: ['Воронеж'],
            niches: ['рестораны', 'салоны красоты', 'барбершопы']
          }
        ];
        localStorage.setItem('yamap_presets_json', JSON.stringify(defaultPresets));
        setPresets(defaultPresets);
      }
    };

    loadPresets();
    window.addEventListener('yamap_presets_updated', loadPresets);
    return () => window.removeEventListener('yamap_presets_updated', loadPresets);
  }, []);

  const handleSelectPreset = (presetId: string) => {
    setActivePresetId(presetId);
    if (!presetId || presetId === 'custom_empty') {
      return;
    }

    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    if (preset.type === 'constructor') {
      setSelectedRegion(preset.region || 'Воронежская область');
      setSelectedCities(preset.cities || []);
      setSelectedNicheItems(preset.niches || []);
      setConfig(prev => ({
        ...prev,
        minReviews: preset.minReviews ?? prev.minReviews,
        maxPerQuery: preset.maxPerQuery ?? prev.maxPerQuery,
        downloadPhotos: preset.downloadPhotos ?? prev.downloadPhotos,
        requirePhotos: preset.requirePhotos ?? prev.requirePhotos,
        fields_to_parse: preset.fields_to_parse ?? prev.fields_to_parse,
      }));
      setActiveTab('builder');
    } else if (preset.type === 'manual') {
      handleChange('queries', preset.queries || '');
      setActiveTab('manual');
    }
  };

  const handleSavePreset = () => {
    if (!newPresetName.trim()) {
      toast.error("Укажите имя пресета!");
      return;
    }

    const newPreset: Preset = {
      id: Date.now().toString(),
      name: `${newPresetName} (${activeTab === 'builder' ? 'Конструктор' : 'Ручной'})`,
      type: activeTab === 'builder' ? 'constructor' : 'manual'
    };

    if (activeTab === 'builder') {
      newPreset.region = selectedRegion;
      newPreset.cities = selectedCities;
      newPreset.niches = selectedNicheItems;
      newPreset.minReviews = config.minReviews;
      newPreset.maxPerQuery = config.maxPerQuery;
      newPreset.downloadPhotos = config.downloadPhotos;
      newPreset.requirePhotos = config.requirePhotos;
      newPreset.fields_to_parse = config.fields_to_parse;
    } else {
      newPreset.queries = config.queries;
    }

    const updated = [...presets, newPreset];
    setPresets(updated);
    localStorage.setItem('yamap_presets_json', JSON.stringify(updated));
    window.dispatchEvent(new Event('yamap_presets_updated'));
    
    setNewPresetName("");
    setActivePresetId(newPreset.id);
    toast.success(`Пресет "${newPreset.name}" сохранён!`);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50/50 min-h-0">
      <div className="p-4 border-b bg-white shrink-0">
        <h2 className="font-semibold text-lg">Параметры парсинга</h2>
        <p className="text-sm text-muted-foreground">Настройте критерии для отбора</p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4">
          <SearchPresetBar
            activePresetId={activePresetId}
            presets={presets}
            newPresetName={newPresetName}
            onSelectPreset={handleSelectPreset}
            onPresetNameChange={setNewPresetName}
            onSavePreset={handleSavePreset}
          />

          <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as TabId)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="builder">Конструктор</TabsTrigger>
              <TabsTrigger value="manual">Ручной ввод</TabsTrigger>
            </TabsList>
            
            <TabsContent value="builder" className="space-y-6">
              <div className="space-y-3">
                <Label>Регион</Label>
                <Select 
                  value={selectedRegion} 
                  onValueChange={(val) => {
                    setSelectedRegion(val);
                    setSelectedCities([]);
                  }}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Выберите регион" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    {Object.keys(REGIONS).map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Города</Label>
                  <Badge variant="secondary" className="text-xs">{selectedCities.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {REGIONS[selectedRegion as keyof typeof REGIONS]?.map((city: string) => {
                    const isSelected = selectedCities.includes(city);
                    return (
                      <Toggle
                        key={city}
                        variant="outline"
                        size="sm"
                        className={`text-xs border-slate-200 transition-all duration-100 active:scale-90 select-none ${
                          isSelected 
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-semibold' 
                            : 'bg-white hover:bg-slate-50 text-slate-700'
                        }`}
                        pressed={isSelected}
                        onPressedChange={() => toggleCity(city)}
                      >
                        {isSelected && <span className="mr-1 text-[10px] font-bold">✓</span>}
                        {city}
                      </Toggle>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Категории</Label>
                  <Badge variant="secondary" className="text-xs">{selectedNicheItems.length}</Badge>
                </div>
                <div className="flex flex-col gap-4">
                  {NICHES.map(niche => (
                    <div key={niche.id} className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{niche.label}</div>
                      <div className="flex flex-wrap gap-2">
                        {niche.items.map(item => {
                          const isSelected = selectedNicheItems.includes(item);
                          return (
                            <Toggle
                              key={item}
                              variant="outline"
                              size="sm"
                              className={`text-xs border-slate-200 transition-all duration-100 active:scale-90 select-none ${
                                isSelected 
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm font-semibold' 
                                  : 'bg-white hover:bg-slate-50 text-slate-700'
                              }`}
                              pressed={isSelected}
                              onPressedChange={() => toggleNicheItem(item)}
                            >
                              {isSelected && <span className="mr-1 text-[10px] font-bold">✓</span>}
                              {item}
                            </Toggle>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="manual" className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="queries">Ваши запросы (один на строку)</Label>
                </div>
                <Textarea 
                  id="queries"
                  value={activeTab === 'builder' ? builderQueries : config.queries}
                  onChange={(e) => handleChange('queries', e.target.value)}
                  placeholder="Воронеж кафе..."
                  className="min-h-[300px] resize-y bg-white font-mono text-sm"
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <div className="p-4 bg-white border-t mt-auto shrink-0 flex flex-col items-center gap-3">
        {runConfig.queries.split('\n').filter(q => q.trim()).length > 1 && (
          <div className="text-[11px] text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-md border border-amber-200 w-full text-center leading-tight">
            Будет выполнено {runConfig.queries.split('\n').filter(q => q.trim()).length} поисковых запросов. Парсинг может занять несколько минут.
          </div>
        )}
        <Button
          size="lg"
          className="w-full font-medium bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:opacity-90 shadow-lg hover:shadow-xl transition-all duration-300"
          onClick={() => onRun(runConfig)} 
          disabled={isLoading || (!runConfig.queries.trim())}
        >
          {isLoading ? (
            <span className="flex items-center gap-2 text-white">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              Запуск парсера...
            </span>
          ) : (
            <span className="text-white text-base">Запустить парсер</span>
          )}
        </Button>
      </div>
    </div>
  )
}
