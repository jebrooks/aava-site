import { randomUUID } from 'node:crypto';

export const contactTopics = ['Wine tour', 'Charcuterie board', 'Custom experience', 'Existing booking or order', 'Something else'] as const;
const failureMessage = 'Your message could not be sent. Please try again or email info.allaboardva@gmail.com.';

class ContactError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

function field(input: Record<string, unknown>, key: string, label: string, max: number, optional = false) {
  const value = input[key];
  if (value !== undefined && typeof value !== 'string') throw new ContactError(`${label} is invalid.`);
  const text = typeof value === 'string' ? value.trim() : '';
  if ((!optional && !text) || text.length > max || (key !== 'message' && /[\r\n\x00]/.test(text)))
    throw new ContactError(`Please enter a valid ${label.toLowerCase()}${optional ? '' : ` (up to ${max} characters)`}.`);
  return text;
}

interface ContactOptions {
  apiKey?: string;
  from?: string;
  to: string;
  allow: () => boolean;
  fetch?: typeof fetch;
}

// The only destination and sender come from server configuration, never from a submitted form.
export async function handleContactRequest(request: Request, options: ContactOptions): Promise<Response> {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
  const isForm = request.headers.get('content-type')?.includes('application/x-www-form-urlencoded');
  const success = () => isForm
    ? new Response(null, { status: 303, headers: { Location: '/contact?sent=1', 'Cache-Control': 'no-store' } })
    : json({ ok: true });
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new ContactError('Please submit the form from this website.', 403);
    if (!options.allow()) throw new ContactError('Please wait a few minutes before sending another inquiry.', 429);
    if (!isForm && !request.headers.get('content-type')?.includes('application/json'))
      throw new ContactError('Unsupported form submission.', 415);
    if (Number(request.headers.get('content-length') || 0) > 40_000) throw new ContactError('Your message is too long.', 413);
    const raw = await request.text();
    if (raw.length > 20_000) throw new ContactError('Your message is too long.', 413);
    let input: Record<string, unknown>;
    try {
      input = isForm ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw);
    } catch { throw new ContactError('Please check the form and try again.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ContactError('Please check the form and try again.');
    if (typeof input.company === 'string' && input.company.trim()) return success();
    const firstName = field(input, 'firstName', 'First name', 100);
    const lastName = field(input, 'lastName', 'Last name', 100);
    const email = field(input, 'email', 'Email address', 254);
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new ContactError('Please enter a valid email address.');
    const phone = field(input, 'phone', 'Phone number', 40, true);
    const topic = field(input, 'topic', 'Topic', 100);
    if (!contactTopics.includes(topic as typeof contactTopics[number])) throw new ContactError('Please choose a topic from the list.');
    const message = field(input, 'message', 'Message', 10_000);
    const submissionId = field(input, 'submissionId', 'Submission ID', 36, true) || randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId))
      throw new ContactError('Please reload the page and try again.');
    if (!options.apiKey?.trim() || !options.from?.trim()) throw new ContactError(failureMessage, 503);
    try {
      const response = await (options.fetch || fetch)('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey.trim()}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `contact/${submissionId}`,
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          from: options.from.trim(),
          to: [options.to],
          reply_to: email,
          subject: `Website inquiry: ${topic}`,
          text: [`Name: ${firstName} ${lastName}`, `Email: ${email}`, `Phone: ${phone || 'Not provided'}`, `Topic: ${topic}`, '', message].join('\n'),
        }),
      });
      const result = await response.json().catch(() => null) as { id?: string } | null;
      if (!response.ok || !result?.id) throw new Error('Email provider did not accept the message.');
    } catch {
      // Never log inquiry text, addresses, provider responses, or credentials.
      throw new ContactError(failureMessage, 502);
    }
    return success();
  } catch (error) {
    return json({ error: error instanceof ContactError ? error.message : failureMessage }, error instanceof ContactError ? error.status : 500);
  }
}
