export const TOUR_REGIONS = [
  { id: 'flexible', label: 'Any region — I’m flexible', mapId: '' },
  { id: 'loudoun', label: 'Loudoun Wine Trail', mapId: 'loudonpath' },
  { id: 'fauquier', label: 'Fauquier I-66 Wine Country', mapId: 'i66path' },
  { id: 'blue-ridge', label: 'Majestic Blue Ridge Foothills', mapId: 'blueridgepath' },
  { id: 'charlottesville', label: 'Charlottesville Wine Region', mapId: 'cvillepath' },
] as const;
export type TourRegion = (typeof TOUR_REGIONS)[number]['id'];

export const TOUR_TYPES = ["public", "private"] as const;
export const TOUR_SNACKS = ["sandwich", "charcuterie", "none"] as const;
export const PICKUP_LOCATIONS = [
  "NorthSide Social, Clarendon",
  "Ballston Metro",
  "Mosaic District, Merrifield",
  "Tysons Metro",
  "Reston Metro",
  "Fairfax Corner",
  "Arrange by phone",
  "Custom pickup (private tours)",
] as const;
export const SANDWICHES = [
  "Grilled Chicken & Goat Cheese",
  "Ham & Swiss",
  "Caprese",
  "Veggie Delight",
  "Confirm by phone",
] as const;
export const TOUR_PREFERENCES = [
  "Mostly social time",
  "Balanced: social and learning",
  "Educational / behind-the-scenes",
  "Small boutique wineries",
  "Larger lively wineries",
] as const;
export const TOUR_TERMS_VERSION = "2026-11-11";
export type TourType = (typeof TOUR_TYPES)[number];
export type TourSnack = (typeof TOUR_SNACKS)[number];
export interface TourSelection {
  tourType: TourType;
  region: TourRegion;
  guests: number;
  snack: TourSnack;
  boardVariantId: string;
  boardQuantity: number;
  boardSelections?: unknown;
}
