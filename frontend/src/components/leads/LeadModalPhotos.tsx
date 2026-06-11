import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import type { Lead, LeadPhoto } from "@/types"

const photoUrl = (photo: LeadPhoto | string) => {
  if (typeof photo === "string") return photo;
  return photo.url || photo.src || photo.path || photo.template?.replace("%s", "L_height") || "";
};

export function LeadModalPhotos({ lead }: { lead: Lead }) {
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; alt: string } | null>(null);

  useEffect(() => {
    if (!selectedPhoto) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedPhoto(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPhoto]);

  const photos = (lead.photos || [])
    .map((photo) => ({ url: photoUrl(photo), alt: typeof photo === "string" ? lead.name : photo.alt || lead.name }))
    .filter((photo) => photo.url);

  if (!photos.length) return null;

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
          {photos.map((photo, i) => (
            <motion.div
              key={`${photo.url}-${i}`}
              className="relative h-28 w-44 shrink-0 overflow-hidden rounded-lg border bg-muted shadow-xs cursor-zoom-in"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ y: -2, scale: 1.02 }}
              transition={{ duration: 0.18, delay: i * 0.025 }}
              onClick={() => setSelectedPhoto(photo)}
            >
              <img
                src={photo.url}
                alt={`${photo.alt} photo ${i + 1}`}
                className="size-full object-cover transition-transform duration-500 hover:scale-110"
                loading="lazy"
              />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {typeof document !== "undefined" ? createPortal(
        <AnimatePresence>
          {selectedPhoto && (
            <motion.div
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md cursor-zoom-out pointer-events-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSelectedPhoto(null)}
            >
              <motion.button
                className="absolute top-4 right-4 text-white hover:text-slate-200 bg-white/10 hover:bg-white/20 active:scale-95 rounded-full p-2 transition-all shadow-md z-[10000]"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPhoto(null);
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <X className="size-6" />
              </motion.button>
              <motion.div
                className="relative max-w-[95vw] max-h-[90vh] flex items-center justify-center p-4"
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 260 }}
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={selectedPhoto.url}
                  alt={selectedPhoto.alt}
                  className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl border border-white/10"
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      ) : null}
    </>
  );
}
