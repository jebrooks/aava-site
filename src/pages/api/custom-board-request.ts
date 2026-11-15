import type { APIRoute } from 'astro';
import { checkBotId } from 'botid/server';
import { apiError, assertSameOrigin, json, readJson } from '../../lib/http';
import { allowRequest } from '../../lib/rate-limit';
import { ShopifyApiError } from '../../lib/shopify/client';
import {
  createCustomBoardDraft,
  type CustomBoardRequest,
} from '../../lib/shopify/draft-orders';
import { normalizeZip } from '../../lib/shopify/schedule';

export const prerender = false;

function requiredText(value: unknown, label: string, maximum = 500) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maximum) {
    throw new ShopifyApiError(`${label} is required and must be under ${maximum} characters.`, 400);
  }
  return text;
}

function optionalText(value: unknown, maximum = 2000) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > maximum) throw new ShopifyApiError('A form field is too long.', 400);
  return text;
}

async function verifyVisitor(request: Request) {
  let result;
  try {
    result = await checkBotId({
      developmentOptions: { isDevelopment: import.meta.env.DEV },
      advancedOptions: {
        checkLevel: 'basic',
        headers: Object.fromEntries(request.headers),
      },
    });
  } catch (error) {
    console.error('Custom-board BotID verification failed.', error);
    throw new ShopifyApiError('We could not verify your request. Please try again shortly.', 503);
  }
  if (result.isBot || !result.isHuman) {
    throw new ShopifyApiError('We could not verify your request. Please refresh the page and try again.', 403);
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!allowRequest(`custom-board:${ip}`)) {
      throw new ShopifyApiError('Too many requests. Please try again later.', 429);
    }

    const body = await readJson<Record<string, unknown>>(request);
    if (body.company) return json({ ok: true });
    await verifyVisitor(request);

    const email = requiredText(body.email, 'Email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ShopifyApiError('Enter a valid email address.', 400);
    }
    const requestedDate = requiredText(body.requestedDate, 'Requested date', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      throw new ShopifyApiError('Enter a valid requested date.', 400);
    }
    if (new Date(`${requestedDate}T23:59:59-04:00`).getTime() < Date.now()) {
      throw new ShopifyApiError('Requested date must be in the future.', 400);
    }
    const guestCount = Number(body.guestCount);
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 1000) {
      throw new ShopifyApiError('Guest count must be between 1 and 1,000.', 400);
    }
    const zip = normalizeZip(String(body.zip || ''));
    if (!zip) throw new ShopifyApiError('Enter a valid five-digit ZIP code.', 400);

    const submission: CustomBoardRequest = {
      name: requiredText(body.name, 'Name', 120),
      email,
      phone: requiredText(body.phone, 'Phone', 40),
      requestedDate,
      zip,
      address: requiredText(body.address, 'Delivery address', 300),
      guestCount,
      budget: optionalText(body.budget, 100),
      dietaryRestrictions: optionalText(body.dietaryRestrictions, 1000),
      theme: optionalText(body.theme, 500),
      notes: optionalText(body.notes),
    };
    const draft = await createCustomBoardDraft(submission);
    return json({ ok: true, reference: draft.name }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
};
