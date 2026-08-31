import { FunctionDeclaration, Schema } from '@google/genai';

import { SWATCHES } from '@app/wardrobe/constants';
import {
  FitType,
  ItemStatus,
  ItemType,
  Season,
  Size,
} from '@app/wardrobe/enums';

import {
  COLOR_LABELS,
  TOOL_DECLARATIONS,
  colorHexToLabel,
  colorLabelToHex,
} from './wardrobe-tools';

const byName = (name: string): FunctionDeclaration => {
  const declaration = TOOL_DECLARATIONS.find((d) => d.name === name);
  if (!declaration) {
    throw new Error(`no declaration named ${name}`);
  }
  return declaration;
};

const propertyOf = (name: string, property: string): Schema =>
  byName(name).parameters?.properties?.[property] as Schema;

describe('wardrobe tool declarations', () => {
  it('registers the four retrieval tools plus the terminal propose_outfit tool', () => {
    expect(TOOL_DECLARATIONS.map((d) => d.name)).toEqual([
      'search_wardrobe',
      'get_item_details',
      'get_weather',
      'get_recent_outfits',
      'propose_outfit',
    ]);
  });

  it('never declares accountId as a parameter on any tool', () => {
    for (const declaration of TOOL_DECLARATIONS) {
      expect(
        Object.keys(declaration.parameters?.properties ?? {}),
      ).not.toContain('accountId');
    }
  });

  it('derives search_wardrobe filters from FindManyWardrobeItemsRequestDto', () => {
    expect(
      Object.keys(
        byName('search_wardrobe').parameters?.properties ?? {},
      ).sort(),
    ).toEqual(
      [
        'type',
        'color',
        'season',
        'status',
        'style',
        'fit_type',
        'material',
        'brand',
        'size',
        'favourite',
        'limit',
      ].sort(),
    );
  });

  it.each([
    ['type', ItemType],
    ['season', Season],
    ['status', ItemStatus],
    ['fit_type', FitType],
    ['size', Size],
  ])('constrains %s to its enum values', (property, source) => {
    expect(propertyOf('search_wardrobe', property).enum).toEqual(
      Object.values(source),
    );
  });

  it('constrains color to the 13 swatch labels', () => {
    const colors = propertyOf('search_wardrobe', 'color').enum;

    expect(colors).toHaveLength(13);
    expect(colors).toEqual(SWATCHES.map((swatch) => swatch.label));
    expect(COLOR_LABELS).toEqual(colors);
  });

  it('requires ids on get_item_details', () => {
    expect(byName('get_item_details').parameters?.required).toEqual(['ids']);
  });

  it('declares propose_outfit with summary, itemIds and rationale, all required', () => {
    const declaration = byName('propose_outfit');

    expect(
      Object.keys(declaration.parameters?.properties ?? {}).sort(),
    ).toEqual(['summary', 'itemIds', 'rationale'].sort());
    expect(declaration.parameters?.required).toEqual([
      'summary',
      'itemIds',
      'rationale',
    ]);
  });
});

describe('swatch colour mapping', () => {
  it('maps every label to the exact stored hex, case-insensitively', () => {
    for (const swatch of SWATCHES) {
      expect(colorLabelToHex(swatch.label)).toBe(swatch.hex);
      expect(colorLabelToHex(` ${swatch.label.toUpperCase()} `)).toBe(
        swatch.hex,
      );
    }
  });

  it('returns null for a label outside the palette', () => {
    expect(colorLabelToHex('chartreuse')).toBeNull();
  });

  it('maps a stored hex back to its label and null for anything else', () => {
    expect(colorHexToLabel('#1B2A4A')).toBe('Navy');
    expect(colorHexToLabel('#1b2a4a')).toBe('Navy');
    expect(colorHexToLabel('#ABCDEF')).toBeNull();
    expect(colorHexToLabel(null)).toBeNull();
  });
});
