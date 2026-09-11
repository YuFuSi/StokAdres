import { supabase } from '../lib/supabase'
import { stockCodeVariants } from '../lib/stockCodeVariants'
import { chunk, findProductsByStockCodes, normalizeStockCode } from './productLookup'

// "Bunu mu demek istediniz?" — İçe Aktar önizlemesinde "Stok yok" çıkan
// kodlar için kayıtlı öneriler. Öneriler asla kendiliğinden yazılmaz.
//
// İki aşama, ucuzdan pahalıya:
//   1. variant: Gemini'nin tipik okuma hataları (lib/stockCodeVariants.ts)
//      mevcut parçalı eşleme ile aranır. Bulunan eşleşme güvenilirdir.
//   2. similar: varyant bulunamazsa sunucuda trigram benzerliği
//      (suggest_stock_codes). Yalnızca ipucu.

export type StockCodeSuggestion = {
  stockCode: string
  stockName: string
  source: 'variant' | 'similar'
}

/** Tek seferde öneri aranan en fazla kayıtsız kod. Yanlış işlem türüyle
 *  yapıştırılmış 500 satırlık bir listede yüzlerce istek atılmasın. */
export const SUGGESTION_CODE_LIMIT = 100
const RPC_CHUNK_SIZE = 50

/** Anahtar: normalize edilmiş giriş kodu (normalizeStockCode). */
export async function suggestStockCodes(codes: string[]): Promise<Map<string, StockCodeSuggestion[]>> {
  const inputs = new Map<string, string>()
  for (const code of codes) {
    const trimmed = code.trim()
    if (trimmed && inputs.size < SUGGESTION_CODE_LIMIT) inputs.set(normalizeStockCode(trimmed), trimmed)
  }
  const suggestions = new Map<string, StockCodeSuggestion[]>()
  if (inputs.size === 0) return suggestions

  const variantsByKey = new Map([...inputs].map(([key, raw]) => [key, stockCodeVariants(raw)]))
  const products = await findProductsByStockCodes([...variantsByKey.values()].flat())

  const unresolved: string[] = []
  for (const [key, raw] of inputs) {
    const found = new Map<string, StockCodeSuggestion>()
    for (const variant of variantsByKey.get(key) ?? []) {
      const product = products.get(normalizeStockCode(variant))
      if (product) found.set(product.id, { stockCode: product.stockCode, stockName: product.stockName, source: 'variant' })
    }
    if (found.size > 0) suggestions.set(key, [...found.values()])
    else unresolved.push(raw)
  }

  for (const part of chunk(unresolved, RPC_CHUNK_SIZE)) {
    const { data, error } = await supabase.rpc('suggest_stock_codes', { p_codes: part, p_limit: 3 })
    if (error) throw new Error(`Benzer stok kodları aranırken hata: ${error.message}`)
    for (const row of data ?? []) {
      const key = normalizeStockCode(row.input_code)
      const list = suggestions.get(key) ?? []
      list.push({ stockCode: row.stock_code, stockName: row.stock_name, source: 'similar' })
      suggestions.set(key, list)
    }
  }

  return suggestions
}
