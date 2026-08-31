import { FunctionDeclaration, Type } from '@google/genai';

import { SWATCHES } from '@app/wardrobe/constants';
import {
  FitType,
  ItemStatus,
  ItemType,
  Season,
  Size,
} from '@app/wardrobe/enums';

export const TOOL_NAMES = {
  searchWardrobe: 'search_wardrobe',
  getItemDetails: 'get_item_details',
  getWeather: 'get_weather',
  getRecentOutfits: 'get_recent_outfits',
  proposeOutfit: 'propose_outfit',
} as const;

/**
 * The 13 canonical swatch labels. `wardrobe_item.color` stores the swatch hex,
 * so the model picks a label and the handler resolves it to the exact hex —
 * no RGB-distance guessing, and an out-of-vocabulary colour is impossible
 * because the label set is in the parameter schema.
 */
export const COLOR_LABELS = SWATCHES.map((swatch) => swatch.label);

export function colorLabelToHex(label: string): string | null {
  const match = SWATCHES.find(
    (swatch) => swatch.label.toLowerCase() === label.trim().toLowerCase(),
  );

  return match?.hex ?? null;
}

export function colorHexToLabel(hex?: string | null): string | null {
  if (!hex) {
    return null;
  }

  const match = SWATCHES.find(
    (swatch) => swatch.hex.toLowerCase() === hex.trim().toLowerCase(),
  );

  return match?.label ?? null;
}

const enumValues = (source: Record<string, string>) => Object.values(source);

/**
 * Parameter schemas mirror `FindManyWardrobeItemsRequestDto`. `accountId` is
 * deliberately absent from every declaration — it is bound server-side in the
 * handler, so the model cannot address another user's wardrobe.
 */
export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: TOOL_NAMES.searchWardrobe,
    description:
      "Search the signed-in user's wardrobe. Every filter is optional; omit them all to " +
      'list everything. Returns compact rows with the item id, plus the true total and a ' +
      'truncated flag — if truncated is true, narrow the filters instead of reasoning over ' +
      'the partial list.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          format: 'enum',
          enum: enumValues(ItemType),
          description: 'Garment type.',
        },
        color: {
          type: Type.STRING,
          format: 'enum',
          enum: COLOR_LABELS,
          description:
            'Colour label from the wardrobe palette. Resolved server-side to the exact stored hex.',
        },
        season: {
          type: Type.STRING,
          format: 'enum',
          enum: enumValues(Season),
          description: 'Season the item is intended for.',
        },
        status: {
          type: Type.STRING,
          format: 'enum',
          enum: enumValues(ItemStatus),
          description:
            'Availability. Use "active" when recommending something to wear right now.',
        },
        style: { type: Type.STRING, description: 'Free-text style tag.' },
        fit_type: {
          type: Type.STRING,
          format: 'enum',
          enum: enumValues(FitType),
          description: 'Cut of the garment.',
        },
        material: { type: Type.STRING, description: 'Free-text material.' },
        brand: { type: Type.STRING, description: 'Free-text brand name.' },
        size: {
          type: Type.STRING,
          format: 'enum',
          enum: enumValues(Size),
          description: 'Garment size.',
        },
        favourite: {
          type: Type.BOOLEAN,
          description: 'Restrict to items the user marked as a favourite.',
        },
        limit: {
          type: Type.INTEGER,
          description:
            'Maximum rows to return. Capped server-side by the per-tool row limit.',
        },
      },
    },
  },
  {
    name: TOOL_NAMES.getItemDetails,
    description:
      'Fetch the full record for specific wardrobe items by id — adds material, brand, ' +
      'description, fit_type and size on top of what search_wardrobe returns. Get the ids ' +
      'from search_wardrobe first.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        ids: {
          type: Type.ARRAY,
          items: { type: Type.INTEGER },
          description: 'Wardrobe item ids to look up.',
        },
      },
      required: ['ids'],
    },
  },
  {
    name: TOOL_NAMES.getWeather,
    description:
      "Get the weather forecast for the user's city. Call this before making a " +
      'weather-dependent recommendation; do not guess from the calendar season.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        days: {
          type: Type.INTEGER,
          description:
            'How many days of daily forecast to return. Defaults to all available.',
        },
      },
    },
  },
  {
    name: TOOL_NAMES.getRecentOutfits,
    description:
      'List what the user recently logged wearing, most recent first, so you can avoid ' +
      'repeating an outfit.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: {
          type: Type.INTEGER,
          description:
            'How many recent outfit log entries to return. Defaults to 7.',
        },
      },
    },
  },
  {
    name: TOOL_NAMES.proposeOutfit,
    description:
      'Propose a concrete outfit to the user. This is a terminal action: call it only once ' +
      'you are ready to give the final recommendation, using item ids already confirmed to ' +
      "exist via search_wardrobe or get_item_details. Every id must belong to the user's own " +
      'wardrobe or the call is rejected. Calling this ends the conversation turn — nothing ' +
      'else runs after it succeeds.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description:
            'The outfit recommendation, written as the reply shown to the user.',
        },
        itemIds: {
          type: Type.ARRAY,
          items: { type: Type.INTEGER },
          description: 'Wardrobe item ids that make up the outfit.',
        },
        rationale: {
          type: Type.STRING,
          description:
            'Brief reasoning for the choice — e.g. weather, occasion, style.',
        },
      },
      required: ['summary', 'itemIds', 'rationale'],
    },
  },
];
