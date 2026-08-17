export type SocialPlatform =
  | "vk"
  | "whatsapp"
  | "telegram"
  | "max"
  | "youtube"
  | "instagram"
  | "facebook"
  | "viber"
  | "ok"
  | "tiktok"
  | "x"
  | "link"

const PLATFORM_DOMAINS: Record<Exclude<SocialPlatform, "link">, readonly string[]> = {
  vk: ["vk.com", "vk.ru", "vkontakte.ru"],
  whatsapp: ["wa.me", "whatsapp.com"],
  telegram: ["t.me", "telegram.me", "telegram.org"],
  max: ["max.ru"],
  youtube: ["youtube.com", "youtu.be"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  viber: ["viber.com", "viber.click", "vb.me"],
  ok: ["ok.ru", "odnoklassniki.ru"],
  tiktok: ["tiktok.com"],
  x: ["x.com", "twitter.com"],
}

const hostFromUrl = (url: string) => {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

export function getSocialPlatform(url: string): SocialPlatform {
  const host = hostFromUrl(url)
  for (const [platform, domains] of Object.entries(PLATFORM_DOMAINS) as Array<
    [Exclude<SocialPlatform, "link">, readonly string[]]
  >) {
    if (domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return platform
    }
  }
  return "link"
}
