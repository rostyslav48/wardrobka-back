import * as fs from 'fs';
import * as path from 'path';
import { SWATCHES } from './swatches';

// wardrobe_item.color is validated against this backend list; the frontend
// (a separate repo, checked out as a sibling of this one) duplicates it in
// components/pages/app/items/itemForm.ts. This test reads that file's source
// so drift between the two surfaces as a failing test rather than a swatch
// the form silently can't render.
describe('SWATCHES', () => {
  it('matches the frontend swatch list (labels and hex values)', () => {
    const frontendItemFormPath = path.resolve(
      __dirname,
      '../../../../../wardrobe-assistant-front/components/pages/app/items/itemForm.ts',
    );
    const source = fs.readFileSync(frontendItemFormPath, 'utf8');

    const block = source.match(/export const SWATCHES = \[([\s\S]*?)\n\];/);
    if (!block) {
      throw new Error(
        `Could not find SWATCHES block in ${frontendItemFormPath}`,
      );
    }

    const entryPattern = /\{\s*label:\s*'([^']+)',\s*hex:\s*'([^']+)'\s*\}/g;
    const frontendSwatches = [...block[1].matchAll(entryPattern)].map(
      ([, label, hex]) => ({
        label,
        hex,
      }),
    );

    expect(frontendSwatches.length).toBeGreaterThan(0);
    expect(frontendSwatches).toEqual(SWATCHES);
  });
});
