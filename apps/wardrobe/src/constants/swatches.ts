export interface Swatch {
  label: string;
  hex: string;
}

// Canonical colour palette for `wardrobe_item.color`. The frontend duplicates
// this list (components/pages/app/items/itemForm.ts) and is pinned against it
// by swatches.spec.ts — update both together.
export const SWATCHES: Swatch[] = [
  { label: 'Black', hex: '#111111' },
  { label: 'White', hex: '#F5F5F5' },
  { label: 'Gray', hex: '#808080' },
  { label: 'Beige', hex: '#D4C5A9' },
  { label: 'Brown', hex: '#6B4226' },
  { label: 'Navy', hex: '#1B2A4A' },
  { label: 'Blue', hex: '#1565C0' },
  { label: 'Green', hex: '#2E7D32' },
  { label: 'Red', hex: '#C62828' },
  { label: 'Pink', hex: '#E91E8C' },
  { label: 'Yellow', hex: '#F9A825' },
  { label: 'Orange', hex: '#E65100' },
  { label: 'Purple', hex: '#6A1B9A' },
];
