import type { Settings } from '@shared/types'

let settingsCache: Settings | null = null

export async function getSettings(): Promise<Settings> {
  if (!settingsCache) settingsCache = await window.api.getSettings()
  return settingsCache
}

export async function setSettings(s: Settings): Promise<void> {
  settingsCache = s
  await window.api.setSettings(s)
}

export async function getRecent(): Promise<string[]> {
  return window.api.getRecent()
}

export async function addRecent(path: string): Promise<string[]> {
  return window.api.addRecent(path)
}
