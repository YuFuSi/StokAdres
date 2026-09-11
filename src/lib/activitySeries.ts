// Genel Bakış > "Son 14 gün" grafiğinin veri serisi.
//
// Veritabanı yalnızca kayıt eklenen günleri döndürür (address_daily_activity).
// Grafikte boş günler de görünmeli, yoksa 3 günlük bir ara çubukların
// yan yana gelmesiyle kaybolur. Saf modül.

export type DailyActivity = {
  /** YYYY-MM-DD, depo saatine (Europe/Istanbul) göre. */
  day: string
  createdCount: number
}

export function lastDaysSeries(activity: DailyActivity[], days: number, today: Date = new Date()): DailyActivity[] {
  const countByDay = new Map(activity.map((item) => [item.day, item.createdCount]))
  const series: DailyActivity[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    // Yerel takvim günü: uygulama depodaki bilgisayarda (Türkiye saati) çalışıyor.
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    series.push({ day, createdCount: countByDay.get(day) ?? 0 })
  }
  return series
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
