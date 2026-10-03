// Generation state of the item's product image. Deliberately separate from
// `ItemStatus` (active | washing | missing | need-repair) — the two describe
// unrelated things and must never be conflated.
export enum ImageStatus {
  Pending = 'pending',
  Ready = 'ready',
  Failed = 'failed',
}
