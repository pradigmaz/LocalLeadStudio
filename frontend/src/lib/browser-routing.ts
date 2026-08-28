export type BrowserRoutingMode = 'default' | 'dedicated'
export type BrowserRoutingOnboarding = 'pending' | 'complete'

export interface BrowserRoutingSettings {
  onboarding: BrowserRoutingOnboarding
  mode: BrowserRoutingMode
  browserPath: string
  browserLabel: string
}

export interface BrowserCandidate {
  id: string
  label: string
  path: string
  recommended: boolean
}

interface BrowserRoutingApi {
  getSettings: () => Promise<BrowserRoutingSettings>
  listBrowsers: () => Promise<BrowserCandidate[]>
  saveSettings: (settings: BrowserRoutingSettings) => Promise<BrowserRoutingSettings>
  chooseExecutable: () => Promise<BrowserCandidate | null>
}

declare global {
  interface Window {
    browserRouting?: BrowserRoutingApi
  }
}

export function getBrowserRoutingApi() {
  return typeof window === 'undefined' ? undefined : window.browserRouting
}
