import { Season } from '@app/wardrobe/enums';

export function getCurrentSeason(date: Date = new Date()): Season {
  const month = date.getMonth();
  if (month <= 1 || month === 11) return Season.Winter;
  if (month <= 4) return Season.Spring;
  if (month <= 7) return Season.Summer;
  return Season.Autumn;
}
