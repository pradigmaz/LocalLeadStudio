import type { LeadPhoto } from "../types"

export type GalleryPhoto = {
  thumbnailUrl: string
  viewerUrl: string
  alt: string
}

const templateUrl = (template: string | undefined, size: string) =>
  template?.replace("%s", size) || ""

export function buildPhotoGallery(
  sourcePhotos: (LeadPhoto | string)[],
  fallbackAlt: string,
): GalleryPhoto[] {
  return sourcePhotos.flatMap((photo) => {
    if (typeof photo === "string") {
      return photo ? [{ thumbnailUrl: photo, viewerUrl: photo, alt: fallbackAlt }] : []
    }

    const thumbnailUrl = photo.url || photo.src || photo.path || templateUrl(photo.template, "L_height")
    if (!thumbnailUrl) return []

    return [{
      thumbnailUrl,
      viewerUrl: templateUrl(photo.template, "XXL_height") || thumbnailUrl,
      alt: photo.alt || fallbackAlt,
    }]
  })
}

export function movePhotoIndex(index: number, direction: -1 | 1, count: number) {
  if (count < 2) return 0
  return ((index + direction) % count + count) % count
}
