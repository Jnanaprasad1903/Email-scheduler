import { z } from 'zod';

// ---------------------------------------------------------------------------
// Campaign scheduling request
// ---------------------------------------------------------------------------

export const scheduleRequestSchema = z.object({
  senderId: z.string().uuid('senderId must be a valid UUID'),

  recipients: z
    .array(z.string().email('Each recipient must be a valid email address'))
    .min(1, 'At least one recipient is required')
    .max(10_000, 'Maximum 10,000 recipients per campaign'),

  subject: z.string().min(1, 'Subject is required').max(500),

  body: z.string().min(1, 'Body is required'),

  // coerce accepts ISO strings from JSON bodies and converts to Date
  startAt: z.coerce.date(),

  // milliseconds between individual sends (0 = no forced delay)
  delayMs: z.number().int().min(0, 'delayMs must be a non-negative integer').optional(),

  // maximum emails to send in any rolling hour window
  hourlyLimit: z.number().int().min(1, 'hourlyLimit must be at least 1').optional(),

  attachments: z.array(z.object({
    name: z.string(),
    content: z.string() // base64
  })).optional()
});

export type ScheduleRequest = z.infer<typeof scheduleRequestSchema>;

// ---------------------------------------------------------------------------
// Sender creation request
// ---------------------------------------------------------------------------

export const createSenderSchema = z.object({
  email: z.string().email('Sender email must be valid'),
  name: z.string().min(1).max(200).optional(),
});

export type CreateSenderRequest = z.infer<typeof createSenderSchema>;
