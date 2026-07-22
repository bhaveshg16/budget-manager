// Bucket a value into a 0..5 heat level, normalized against the visible max.
// 0 = no spend (rendered bare); 1..5 = increasing intensity.
export function heatLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (value <= 0 || max <= 0) return 0
  return Math.min(5, Math.ceil((value / max) * 5)) as 1 | 2 | 3 | 4 | 5
}
