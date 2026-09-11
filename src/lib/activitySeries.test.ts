import { describe, expect, it } from 'vitest'
import { lastDaysSeries } from './activitySeries'

describe('lastDaysSeries', () => {
  it('boş günleri sıfırla doldurur, en eski gün önce gelir', () => {
    const series = lastDaysSeries([{ day: '2026-09-10', createdCount: 2703 }, { day: '2026-09-08', createdCount: 120 }], 4, new Date(2026, 8, 11, 15, 30))
    expect(series).toEqual([
      { day: '2026-09-08', createdCount: 120 },
      { day: '2026-09-09', createdCount: 0 },
      { day: '2026-09-10', createdCount: 2703 },
      { day: '2026-09-11', createdCount: 0 },
    ])
  })

  it('ay sınırını doğru geçer', () => {
    const series = lastDaysSeries([], 3, new Date(2026, 9, 1))
    expect(series.map((item) => item.day)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01'])
  })

  it('pencere dışındaki günleri yok sayar', () => {
    const series = lastDaysSeries([{ day: '2026-08-01', createdCount: 5 }], 14, new Date(2026, 8, 11))
    expect(series).toHaveLength(14)
    expect(series.every((item) => item.createdCount === 0)).toBe(true)
  })
})
