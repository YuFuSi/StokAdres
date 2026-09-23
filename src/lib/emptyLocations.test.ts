import { describe, expect, it } from 'vitest'
import { findEmptyLocations } from './emptyLocations'

describe('findEmptyLocations', () => {
  it('ızgarayı en büyük görülen rafa kadar kurar, katlar 01–04', () => {
    const report = findEmptyLocations('G', ['G01-01', 'G01-02', 'G01-03', 'G01-04', 'G03-01'])
    expect(report.totalLocations).toBe(12) // 3 raf × 4 kat
    expect(report.filledLocations).toBe(5)
    expect(report.emptyLocations).toBe(7)
    expect(report.racks.map((r) => r.rack)).toEqual([2, 3]) // raf 1 tam dolu
    expect(report.racks[0].emptyLevels).toEqual(['01', '02', '03', '04'])
    expect(report.racks[1].emptyLevels).toEqual(['02', '03', '04'])
  })

  it('DİBİ yalnızca koridorda görüldüyse ızgaraya girer', () => {
    const without = findEmptyLocations('F', ['F01-01'])
    expect(without.totalLocations).toBe(4)
    const withFloor = findEmptyLocations('F', ['F01-01', 'F01-DİBİ'])
    expect(withFloor.totalLocations).toBe(5)
    expect(withFloor.racks[0].emptyLevels).toEqual(['02', '03', '04'])
  })

  it('biçim dışı ve başka koridor adreslerini ızgaraya katmaz', () => {
    const report = findEmptyLocations('H', ['H21-1', 'G05-01', 'H02-01'])
    expect(report.unparsed.sort()).toEqual(['G05-01', 'H21-1'])
    expect(report.totalLocations).toBe(8)
  })

  it('boş koridor boş rapor verir', () => {
    const report = findEmptyLocations('K', [])
    expect(report.totalLocations).toBe(0)
    expect(report.racks).toEqual([])
  })
})
