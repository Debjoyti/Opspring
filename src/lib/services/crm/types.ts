import { z } from "zod";

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "converted",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const DEAL_STAGES = [
  "qualified",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const ACTIVITY_TYPES = ["call", "email", "meeting", "note", "task"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const OPEN_STAGES: DealStage[] = ["qualified", "proposal", "negotiation"];

const optionalText = z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined));
const optionalEmail = z
  .string()
  .trim()
  .email()
  .optional()
  .or(z.literal("").transform(() => undefined));

export const accountInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  industry: optionalText,
  website: optionalText,
  phone: optionalText,
});
export type AccountInput = z.infer<typeof accountInput>;

export const contactInput = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(120),
  last_name: optionalText,
  email: optionalEmail,
  phone: optionalText,
  title: optionalText,
  account_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
});
export type ContactInput = z.infer<typeof contactInput>;

export const leadInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  company: optionalText,
  email: optionalEmail,
  phone: optionalText,
  source: optionalText,
  status: z.enum(LEAD_STATUSES).default("new"),
});
export type LeadInput = z.infer<typeof leadInput>;

export const dealInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  amount: z.coerce.number().min(0).default(0),
  currency: z.string().trim().length(3).default("USD"),
  stage: z.enum(DEAL_STAGES).default("qualified"),
  close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  account_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  contact_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
});
export type DealInput = z.infer<typeof dealInput>;

export const dealStageUpdate = z.object({ stage: z.enum(DEAL_STAGES) });

export const activityInput = z.object({
  type: z.enum(ACTIVITY_TYPES).default("note"),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  notes: optionalText,
  related_type: z.enum(["lead", "account", "contact", "deal"]).optional(),
  related_id: z.string().uuid().optional(),
  due_at: z.string().datetime().optional().or(z.literal("").transform(() => undefined)),
  done: z.boolean().default(false),
});
export type ActivityInput = z.infer<typeof activityInput>;
