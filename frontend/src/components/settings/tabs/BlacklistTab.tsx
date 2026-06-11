import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

const defaultBlacklist = "Пятерочка, Магнит, Перекресток, Сбербанк, ВТБ";

export function BlacklistTab() {
  const [blacklist, setBlacklist] = useState(() => localStorage.getItem('yamap_blacklist') || defaultBlacklist)

  const saveBlacklist = () => {
    localStorage.setItem('yamap_blacklist', blacklist)
    toast.success('Чёрный список сохранён!')
    window.dispatchEvent(new Event('yamap_blacklist_updated'))
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col gap-4 flex-1 overflow-y-auto min-h-0 pr-2 pb-4"
    >
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Чёрный список</h3>
        <p className="text-sm text-slate-500 mt-1">
          Укажите ключевые слова (через запятую) для авто-отбраковки сетевиков. Если эти слова будут в названии, парсер пометит лид как "Сетевик".
        </p>
      </div>

      <Textarea
        value={blacklist}
        onChange={(e) => setBlacklist(e.target.value)}
        placeholder="Пятерочка, Магнит..."
        className="bg-white font-mono text-sm border-slate-200 focus:ring-indigo-500 flex-1 min-h-[300px] resize-none"
      />

      <div className="flex justify-end pt-2">
        <Button onClick={saveBlacklist} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm">
          Сохранить список
        </Button>
      </div>
    </motion.div>
  )
}
