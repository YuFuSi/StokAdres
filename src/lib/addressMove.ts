// Adres taşıma planı: "H21-01'deki her şey H22-01'e geçti".
//
// Saf modül: Supabase import etmez (CLAUDE.md Tuzak #11). Veritabanında
// (product_id, lower(trim(address))) aktif kayıtlar için benzersiz; hedefte aynı
// ürünün aktif kaydı varsa taşıma o kaydı ezerdi/reddedilirdi. Bu yüzden
// çakışanlar taşınmaz, ayrıca raporlanır — hangisinin korunacağına kullanıcı
// karar verir.

export type MoveCandidate = { id: string; productId: string; stockCode: string; stockName: string; cartonCount: number }

export type MovePlan<T extends MoveCandidate = MoveCandidate> = {
  movable: T[]
  /** Hedef adreste aynı ürünün aktif kaydı zaten var. */
  conflicts: T[]
}

export function planMove<T extends MoveCandidate>(source: T[], destinationProductIds: ReadonlySet<string>): MovePlan<T> {
  const movable: T[] = []
  const conflicts: T[] = []
  for (const record of source) (destinationProductIds.has(record.productId) ? conflicts : movable).push(record)
  return { movable, conflicts }
}

/** Aynı adres (büyük/küçük harf ve boşluk farkı yok sayılır) mı? */
export function isSameAddress(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}
