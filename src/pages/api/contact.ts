import type { APIRoute } from 'astro';
import { handleContactRequest } from '../../lib/contact-form';
import { allowRequest } from '../../lib/rate-limit';
import { site } from '../../data/site';

export const prerender = false;
export const POST: APIRoute = ({ request, clientAddress }) => handleContactRequest(request, {
  apiKey: import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY,
  from: import.meta.env.CONTACT_EMAIL_FROM || process.env.CONTACT_EMAIL_FROM,
  to: site.email,
  allow: () => allowRequest(`contact:${clientAddress}`, 5),
});
