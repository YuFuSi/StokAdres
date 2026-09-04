export async function copyToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('Clipboard API kullanılamıyor.')
  await navigator.clipboard.writeText(text)
}
