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

function socialLinkKey(url: string): string {
  const value = url.trim()
  try {
    const parsed = new URL(value.includes("://") ? value : `https://${value}`)
    const platform = getSocialPlatform(value)
    const path = parsed.pathname.replace(/^\/+|\/+$/g, "")
    if (platform === "telegram") {
      const phone = path.replace(/^\+/, "")
      if (/^\d{7,15}$/.test(phone)) return `telegram:${phone}`
    }
    if (platform === "whatsapp") {
      const phone = (parsed.searchParams.get("phone") || path).replace(/\D/g, "")
      if (phone) return `whatsapp:${phone}`
    }
    if (platform === "vk") return `vk:${path.toLowerCase()}`
    const host = parsed.hostname.toLowerCase()
    if (path && (host === "dikidi.ru" || host.endsWith(".dikidi.ru") || host === "dikidi.net" || host.endsWith(".dikidi.net"))) {
      return `dikidi:${path.toLowerCase()}`
    }
  } catch {
    // Keep malformed links distinct rather than hiding a potentially useful contact.
  }
  return value
}

export function dedupeSocialLinks(links: readonly string[]): string[] {
  const seen = new Set<string>()
  return links.filter((link) => {
    const value = link.trim()
    if (!value) return false
    const key = socialLinkKey(value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
