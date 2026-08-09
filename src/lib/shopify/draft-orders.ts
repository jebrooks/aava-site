import { adminGraphql, ShopifyApiError } from './client';

export interface CustomBoardRequest {
  name: string;
  email: string;
  phone: string;
  requestedDate: string;
  zip: string;
  address: string;
  guestCount: number;
  budget: string;
  dietaryRestrictions: string;
  theme: string;
  notes: string;
}

export async function createCustomBoardDraft(request: CustomBoardRequest) {
  const result = await adminGraphql<{
    draftOrderCreate: {
      draftOrder: { id: string; name: string } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    `#graphql
    mutation CreateCustomBoardDraft($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name }
        userErrors { field message }
      }
    }`,
    {
      input: {
        email: request.email,
        tags: ['custom-board-request', 'website-request', 'needs-quote'],
        note: [
          `Custom board request from ${request.name}`,
          `Phone: ${request.phone}`,
          `Requested date: ${request.requestedDate}`,
          `Delivery address: ${request.address}`,
          `ZIP: ${request.zip}`,
          `Guest count: ${request.guestCount}`,
          `Budget: ${request.budget || 'Not provided'}`,
          `Dietary restrictions: ${request.dietaryRestrictions || 'None provided'}`,
          `Theme: ${request.theme || 'Not provided'}`,
          `Notes: ${request.notes || 'None provided'}`,
        ].join('\n'),
        lineItems: [
          {
            title: 'Custom board request — price pending',
            originalUnitPrice: 0,
            quantity: 1,
            requiresShipping: true,
            customAttributes: [
              { key: 'Requested date', value: request.requestedDate },
              { key: 'Guest count', value: String(request.guestCount) },
              { key: 'ZIP code', value: request.zip },
            ],
          },
        ],
        customAttributes: [
          { key: 'Customer name', value: request.name },
          { key: 'Phone', value: request.phone },
          { key: 'Request source', value: 'All ABoard VA Astro storefront' },
        ],
      },
    },
  );

  if (result.draftOrderCreate.userErrors.length || !result.draftOrderCreate.draftOrder) {
    throw new ShopifyApiError(
      result.draftOrderCreate.userErrors.map((error) => error.message).join('; ') ||
        'Shopify did not create the custom-board request.',
    );
  }
  return result.draftOrderCreate.draftOrder;
}
