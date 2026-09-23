import { describe, expect, it } from 'vitest'
import { isSameAddress, planMove } from './addressMove'

const record = (id: string, productId: string) => ({ id, productId, stockCode: `K${id}`, stockName: 'AD', cartonCount: 3 })

describe('planMove', () => {
  it('hedefte aynı ürünü olan kaydı çakışma sayar, diğerlerini taşır', () => {
    const plan = planMove([record('1', 'p1'), record('2', 'p2'), record('3', 'p3')], new Set(['p2']))
    expect(plan.movable.map((r) => r.id)).toEqual(['1', '3'])
    expect(plan.conflicts.map((r) => r.id)).toEqual(['2'])
  })

  it('hedef boşsa hepsi taşınır', () => {
    const plan = planMove([record('1', 'p1')], new Set())
    expect(plan.movable).toHaveLength(1)
    expect(plan.conflicts).toHaveLength(0)
  })
})

describe('isSameAddress', () => {
  it('büyük/küçük harf ve boşluğu yok sayar', () => {
    expect(isSameAddress(' h21-01 ', 'H21-01')).toBe(true)
    expect(isSameAddress('H21-01', 'H21-02')).toBe(false)
  })
})
