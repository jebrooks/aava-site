export const FULFILLMENT_OPTION = "Fulfillment";
export const TOUR_FULFILLMENT = "On tour";
export const DELIVERY_FULFILLMENT = "Delivery";
export function isTourVariant(variant: {
  selectedOptions?: Array<{ name: string; value: string }>;
}) {
  return !!variant.selectedOptions?.some(
    (option) =>
      option.name === FULFILLMENT_OPTION && option.value === TOUR_FULFILLMENT,
  );
}
export function deliveryVariantTitle(variant: {
  title: string;
  selectedOptions: Array<{ name: string; value: string }>;
}) {
  if (!variant.selectedOptions.some((o) => o.name === FULFILLMENT_OPTION))
    return variant.title;
  return (
    variant.selectedOptions
      .filter(
        (o) => o.name !== FULFILLMENT_OPTION && o.value !== "Default Title",
      )
      .map((o) => o.value)
      .join(" / ") || "Default Title"
  );
}
