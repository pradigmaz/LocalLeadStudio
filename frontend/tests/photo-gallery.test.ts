import assert from "node:assert/strict"
import test from "node:test"
import { buildPhotoGallery, movePhotoIndex } from "../src/lib/photo-gallery.ts"

const template = "https://avatars.mds.yandex.net/get-altay/5316761/photo/%s"

test("uses a larger saved rendition when a lead photo has a Yandex template", () => {
  const photos = buildPhotoGallery([
    { url: template.replace("%s", "L_height"), template, alt: "Фасад" },
  ], "Центр")

  assert.deepEqual(photos, [{
    thumbnailUrl: template.replace("%s", "L_height"),
    viewerUrl: template.replace("%s", "XXL_height"),
    alt: "Фасад",
  }])
})

test("moves through every lead photo in both directions", () => {
  assert.equal(movePhotoIndex(0, -1, 3), 2)
  assert.equal(movePhotoIndex(2, 1, 3), 0)
  assert.equal(movePhotoIndex(0, 1, 1), 0)
})
