export const TOUR_TYPES = ["public", "private"] as const;
export const TOUR_SNACKS = ["sandwich", "charcuterie", "none"] as const;
export const PICKUP_LOCATIONS = [
  "NorthSide Social, Clarendon",
  "Ballston Metro",
  "Mosaic District, Merrifield",
  "Tysons Metro",
  "Reston Town Center Metro",
  "Fairfax Corner",
  "Arrange by phone",
  "Custom pickup (private tours)",
] as const;
export const DEFAULT_TOUR_PICKUP = "NorthSide Social, Clarendon";
export const TOUR_DELIVERY_METHOD_TITLE =
  "Charcuterie provided on your tour — pickup arranged by phone";
export const TOUR_PICKUP_ARRANGEMENTS =
  "Tentative — we’ll contact you by phone to confirm pickup arrangements.";
export const TOUR_BOARD_FULFILLMENT_ARRANGEMENTS =
  "Your pickup preference is tentative — we’ll confirm the meeting point by phone.";
export const TOUR_BOARD_DEFAULT_PICKUP_ARRANGEMENTS =
  "No preference is fine — we’ll arrange pickup by phone. The default address is tentative, not a confirmed meeting point.";
export interface TourPickupAddress {
  address1: string;
  address2?: string;
  city: string;
  provinceCode: "VA";
  zip: string;
  countryCode: "US";
}
// Venue/station base addresses are tentative planning locations, not confirmed bus stops.
export const TOUR_PICKUP_ADDRESSES: Record<string, TourPickupAddress> = {
  "NorthSide Social, Clarendon": {
    address1: "3211 Wilson Blvd", city: "Arlington", provinceCode: "VA", zip: "22201", countryCode: "US",
  },
  "Ballston Metro": {
    address1: "4230 Fairfax Drive", city: "Arlington", provinceCode: "VA", zip: "22201", countryCode: "US",
  },
  "Mosaic District, Merrifield": {
    address1: "2905 District Ave", city: "Fairfax", provinceCode: "VA", zip: "22031", countryCode: "US",
  },
  "Tysons Metro": {
    address1: "1944 Chain Bridge Road", city: "McLean", provinceCode: "VA", zip: "22102", countryCode: "US",
  },
  "Reston Town Center Metro": {
    address1: "12023-A Sunset Hills Rd", city: "Reston", provinceCode: "VA", zip: "20190", countryCode: "US",
  },
  "Fairfax Corner": {
    address1: "4100 Monument Corner Dr", city: "Fairfax", provinceCode: "VA", zip: "22030", countryCode: "US",
  },
};
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
export const TOUR_TERMS_VERSION = "2026-11-22";
export type TourType = (typeof TOUR_TYPES)[number];
export type TourSnack = (typeof TOUR_SNACKS)[number];
export interface TourSelection {
  tourType: TourType;
  guests: number;
  snack: TourSnack;
  boardVariantId: string;
  boardQuantity: number;
  boardSelections?: unknown;
}
