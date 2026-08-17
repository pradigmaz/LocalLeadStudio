import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { buildPhotoGallery, movePhotoIndex } from "@/lib/photo-gallery"
import type { Lead } from "@/types"

export function LeadModalPhotos({ lead }: { lead: Lead }) {
  const [selection, setSelection] = useState<{ leadId: string; index: number } | null>(null)
  const photos = buildPhotoGallery(lead.photos || [], lead.name)
  const selectedIndex = selection?.leadId === lead.id ? selection.index : null
  const selectedPhoto = selectedIndex === null ? null : photos[selectedIndex] || null
  const selectedPhotoNumber = selectedIndex === null ? 0 : selectedIndex + 1

  useEffect(() => {
    if (selectedIndex === null) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      event.preventDefault()
      setSelection((current) => current === null
        ? null
        : { ...current, index: movePhotoIndex(current.index, event.key === "ArrowLeft" ? -1 : 1, photos.length) })
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedIndex, photos.length])

  if (!photos.length) return null

  const moveSelection = (direction: -1 | 1) => {
    setSelection((current) => current === null
      ? null
      : { ...current, index: movePhotoIndex(current.index, direction, photos.length) })
  }

  return (
    <>
      <motion.div
        className="flex flex-col gap-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Фотографии ({photos.length})</h4>
        <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
          {photos.map((photo, index) => (
            <motion.button
              key={`${photo.thumbnailUrl}-${index}`}
              type="button"
              className="relative h-28 w-44 shrink-0 overflow-hidden rounded-lg border bg-muted shadow-xs cursor-zoom-in focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ y: -2, scale: 1.02 }}
              transition={{ duration: 0.18, delay: index * 0.025 }}
              onClick={() => setSelection({ leadId: lead.id, index })}
              aria-label={`Открыть фотографию ${index + 1} из ${photos.length}`}
            >
              <img
                src={photo.thumbnailUrl}
                alt={`${photo.alt}, фото ${index + 1}`}
                className="size-full object-cover transition-transform duration-500 hover:scale-110"
                loading="lazy"
              />
            </motion.button>
          ))}
        </div>
      </motion.div>

      <Dialog open={selectedIndex !== null} onOpenChange={(open) => !open && setSelection(null)}>
        <DialogContent
          className="flex h-[min(90vh,960px)] w-[min(96vw,1200px)] max-w-none! flex-col gap-0 overflow-hidden border-white/15 bg-black p-0 text-white sm:max-w-none!"
          showCloseButton={false}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">Фотографии: {lead.name}</DialogTitle>
          {selectedPhoto && (
            <>
              <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm text-white/75">
                <span aria-live="polite">Фото {selectedPhotoNumber} из {photos.length}</span>
                <button
                  type="button"
                  className="rounded-full p-2 text-white transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                  onClick={() => setSelection(null)}
                  aria-label="Закрыть просмотр фотографий"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>

              <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
                {photos.length > 1 && (
                  <button
                    type="button"
                    className="absolute left-2 z-10 rounded-full bg-black/55 p-3 text-white shadow-lg transition-colors hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:left-5"
                    onClick={() => moveSelection(-1)}
                    aria-label="Предыдущая фотография"
                  >
                    <ChevronLeft className="size-6" aria-hidden="true" />
                  </button>
                )}

                <img
                  src={selectedPhoto.viewerUrl}
                  alt={selectedPhoto.alt}
                  className="max-h-full max-w-full rounded-lg border border-white/10 object-contain shadow-2xl"
                />

                {photos.length > 1 && (
                  <button
                    type="button"
                    className="absolute right-2 z-10 rounded-full bg-black/55 p-3 text-white shadow-lg transition-colors hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:right-5"
                    onClick={() => moveSelection(1)}
                    aria-label="Следующая фотография"
                  >
                    <ChevronRight className="size-6" aria-hidden="true" />
                  </button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
