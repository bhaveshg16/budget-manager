import { describe, it, expect } from 'vitest'
import { heatLevel } from './heat'

describe('heatLevel', () => {
  it('is 0 for no spend or no max', () => {
    expect(heatLevel(0, 1000)).toBe(0)
    expect(heatLevel(500, 0)).toBe(0)
  })
  it('scales 1..5 relative to the max', () => {
    expect(heatLevel(1000, 1000)).toBe(5)
    expect(heatLevel(1, 1000)).toBe(1)
    expect(heatLevel(600, 1000)).toBe(3)
  })
})
