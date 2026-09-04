export const ADDRESS_RECORDS_STORAGE_KEY = 'stokadres-data-v1'

export function getLocalStorage(): Storage | undefined {
  try {
    if (typeof window === 'undefined') return undefined
    return window.localStorage
  } catch {
    return undefined
  }
}
