import {
  TOUR_TYPES,
  TOUR_SNACKS,
  PICKUP_LOCATIONS,
  SANDWICHES,
  TOUR_PREFERENCES,
  TOUR_TERMS_VERSION,
  type TourSelection,
} from "../data/tour-options.ts";
import { validTourDate } from "./tour-schedule.ts";
export interface TourRegistration extends TourSelection {
  date: string;
  name: string;
  email: string;
  phone: string;
  pickup: string;
  customPickup: string;
  sandwich: string;
  allergies: string;
  requests: string;
  preferences: string[];
  ageConfirmed: true;
  termsAccepted: true;
  damageAccepted: true;
}
function text(
  value: unknown,
  label: string,
  max: number,
  required = false,
): string {
  if (value != null && typeof value !== "string")
    throw new Error(`${label} is invalid.`);
  const result = ((value || "") as string).trim();
  if (
    (required && !result) ||
    result.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)
  ) {
    throw new Error(
      `Please enter a valid ${label.toLowerCase()}${max > 300 ? ` (up to ${max} characters)` : ""}.`,
    );
  }
  return result;
}
export function validateTourSelection(
  input: Record<string, unknown>,
): TourSelection {
  const tourType = input.tourType;
  if (!TOUR_TYPES.includes(tourType as never))
    throw new Error("Choose Public or Private tour.");
  const guests = Number(input.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > 10)
    throw new Error("Choose between 1 and 10 guests.");
  const snack = input.snack;
  if (!TOUR_SNACKS.includes(snack as never))
    throw new Error("Choose a snack option.");
  const boardVariantId =
    snack === "charcuterie"
      ? text(input.boardVariantId, "board selection", 100, true)
      : "";
  const boardQuantity =
    snack === "charcuterie" ? Number(input.boardQuantity) : 0;
  if (
    snack === "charcuterie" &&
    (!/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(boardVariantId) ||
      !Number.isInteger(boardQuantity) ||
      boardQuantity < 1 ||
      boardQuantity > 10)
  ) {
    throw new Error("Choose a catalog board and a quantity from 1 to 10.");
  }
  return {
    tourType: tourType as TourSelection["tourType"],
    guests,
    snack: snack as TourSelection["snack"],
    boardVariantId,
    boardQuantity,
    ...(snack === "charcuterie" && input.boardSelections != null
      ? { boardSelections: input.boardSelections }
      : {}),
  };
}
export function validateTourRegistration(
  input: Record<string, unknown>,
): TourRegistration {
  const selection = validateTourSelection(input);
  const date = text(input.date, "tour date", 10, true);
  if (!validTourDate(date)) throw new Error("Choose a valid tour date.");
  const name = text(input.name, "name", 100, true);
  const email = text(input.email, "email address", 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid email address.");
  const phone = text(input.phone, "mobile phone number", 40, true);
  if (
    !/^[+\d\s().-]+$/.test(phone) ||
    phone.replace(/\D/g, "").length < 10 ||
    phone.replace(/\D/g, "").length > 15
  ) {
    throw new Error("Enter a valid mobile phone number.");
  }
  const pickup = text(input.pickup, "pickup preference", 100, true);
  if (!PICKUP_LOCATIONS.includes(pickup as never))
    throw new Error("Choose a pickup preference.");
  if (
    selection.tourType === "public" &&
    pickup === "Custom pickup (private tours)"
  )
    throw new Error("Custom pickup is available for private tours.");
  const customPickup =
    pickup === "Custom pickup (private tours)"
      ? text(input.customPickup, "custom pickup address", 300, true)
      : "";
  const sandwich =
    selection.snack === "sandwich"
      ? text(input.sandwich, "sandwich preference", 100, true)
      : "";
  if (selection.snack === "sandwich" && !SANDWICHES.includes(sandwich as never))
    throw new Error("Choose a sandwich preference.");
  const allergies = text(input.allergies, "dietary needs or allergies", 500);
  const requests = text(input.requests, "special requests", 500);
  const preferences = input.preferences ?? [];
  if (
    !Array.isArray(preferences) ||
    preferences.length > TOUR_PREFERENCES.length ||
    preferences.some((p) => !TOUR_PREFERENCES.includes(p as never))
  ) {
    throw new Error("Choose valid tour preferences.");
  }
  if (
    input.ageConfirmed !== true ||
    input.termsAccepted !== true ||
    input.damageAccepted !== true
  ) {
    throw new Error(
      "Please confirm the age requirement, terms, and cleaning and damage policy.",
    );
  }
  return {
    ...selection,
    date,
    name,
    email,
    phone,
    pickup,
    customPickup,
    sandwich,
    allergies,
    requests,
    preferences: [...new Set(preferences)] as string[],
    ageConfirmed: true,
    termsAccepted: true,
    damageAccepted: true,
  };
}
export function tourBookingAttributes(
  booking: TourRegistration,
  now: Date,
  bookingId: string,
) {
  return Object.entries({
    "Booking reference": bookingId,
    "Tour date": booking.date,
    "Tour type":
      booking.tourType === "private" ? "Private whole bus" : "Public seats",
    "Guest count": String(booking.guests),
    "Lead guest": booking.name,
    Email: booking.email,
    "Mobile phone": booking.phone,
    Destination: "To coordinate by phone",
    "Pickup preference": booking.pickup,
    "Custom pickup address": booking.customPickup,
    Snack: booking.snack,
    "Sandwich preference": booking.sandwich,
    "Board quantity": booking.boardQuantity
      ? String(booking.boardQuantity)
      : "",
    "Dietary needs / allergies": booking.allergies,
    "Special requests": booking.requests,
    "Tour preferences": booking.preferences.join("; "),
    "21+ confirmed": "Yes",
    "Terms accepted": "Yes",
    "Cleaning and damage policy accepted": "Yes",
    "Acknowledged at": now.toISOString(),
    "Terms version": TOUR_TERMS_VERSION,
  })
    .filter(([, value]) => value !== "")
    .map(([key, value]) => ({ key, value }));
}
