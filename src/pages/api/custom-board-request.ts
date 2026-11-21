import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { checkBotId } from 'botid/server';
import { apiError, assertSameOrigin, json, readJson } from '../../lib/http';
import { allowRequest } from '../../lib/rate-limit';
import { ShopifyApiError } from '../../lib/shopify/client';
import {
  CustomBoardEmailError,
  sendCustomBoardRequest,
  type CustomBoardRequest,
} from '../../lib/custom-board-request';
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

    if (body.consent !== 'on' && body.consent !== true) {
      throw new ShopifyApiError('Please agree that we may contact you about this request.', 400);
    }
    const email = requiredText(body.email, 'Email', 254).toLowerCase();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
      throw new ShopifyApiError('Enter a valid email address.', 400);
    }
    const requestedDate = requiredText(body.requestedDate, 'Requested date', 10);
    const parsedDate = new Date(`${requestedDate}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== requestedDate) {
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
    const reference = body.submissionId === undefined ? randomUUID() : requiredText(body.submissionId, 'Submission ID', 36);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference)) {
      throw new ShopifyApiError('Please reload the page and try again.', 400);
    }
    await sendCustomBoardRequest(submission, reference, {
      apiKey: import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY,
      from: import.meta.env.CONTACT_EMAIL_FROM || process.env.CONTACT_EMAIL_FROM,
    });
    return json({ ok: true, reference });
  } catch (error) {
    if (error instanceof CustomBoardEmailError) return json({ error: error.message }, { status: error.status });
    return apiError(error);
  }
};
