import { z } from "zod";

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "converted",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ACTIVITY_TYPES = ["call", "email", "meeting", "note", "task"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const STAGE_KINDS = ["open", "won", "lost"] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export const ENTITY_TYPES = ["lead", "account", "contact", "deal"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

const optionalText = z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined));
const optionalEmail = z
  .string()
  .trim()
  .email()
  .optional()
  .or(z.literal("").transform(() => undefined));
const optionalUuid = z.string().uuid().optional().or(z.literal("").transform(() => undefined));
const tagsInput = z.array(z.string().trim().min(1).max(50)).max(25).optional();

export const accountInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  industry: optionalText,
  website: optionalText,
  phone: optionalText,
  tags: tagsInput,
});
export type AccountInput = z.infer<typeof accountInput>;

export const contactInput = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(120),
  last_name: optionalText,
  email: optionalEmail,
  phone: optionalText,
  title: optionalText,
  account_id: optionalUuid,
  tags: tagsInput,
});
export type ContactInput = z.infer<typeof contactInput>;

export const leadInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  company: optionalText,
  email: optionalEmail,
  phone: optionalText,
  title: optionalText,
  source: optionalText,
  status: z.enum(LEAD_STATUSES).default("new"),
  tags: tagsInput,
});
export type LeadInput = z.infer<typeof leadInput>;

export const dealInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  amount: z.coerce.number().min(0).default(0),
  currency: z.string().trim().length(3).default("USD"),
  pipeline_id: optionalUuid,
  stage_id: optionalUuid,
  lost_reason: optionalText,
  close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  account_id: optionalUuid,
  contact_id: optionalUuid,
  tags: tagsInput,
});
export type DealInput = z.infer<typeof dealInput>;

export const activityInput = z.object({
  type: z.enum(ACTIVITY_TYPES).default("note"),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  notes: optionalText,
  related_type: z.enum(ENTITY_TYPES).optional(),
  related_id: z.string().uuid().optional(),
  due_at: z.string().datetime().optional().or(z.literal("").transform(() => undefined)),
  done: z.boolean().default(false),
});
export type ActivityInput = z.infer<typeof activityInput>;

// Pipelines -------------------------------------------------------------------

export const stageDef = z.object({
  name: z.string().trim().min(1, "Stage name is required").max(120),
  position: z.coerce.number().int().min(0).default(0),
  probability: z.coerce.number().int().min(0).max(100).default(50),
  kind: z.enum(STAGE_KINDS).default("open"),
});

export const stageInput = stageDef.extend({
  pipeline_id: z.string().uuid(),
});
export type StageInput = z.infer<typeof stageInput>;

export const pipelineCreateInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  is_default: z.boolean().default(false),
  stages: z.array(stageDef).min(1).max(20).optional(),
});
export type PipelineCreateInput = z.infer<typeof pipelineCreateInput>;

export const pipelinePatchInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  is_default: z.boolean().optional(),
});

// Notes -----------------------------------------------------------------------

export const noteInput = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
  body: z.string().trim().min(1, "Note is required").max(5000),
});
export type NoteInput = z.infer<typeof noteInput>;

// Lead operations ---------------------------------------------------------------

export const convertLeadInput = z.object({
  create_deal: z.boolean().default(true),
  deal_name: optionalText,
  deal_amount: z.coerce.number().min(0).default(0),
});
export type ConvertLeadInput = z.infer<typeof convertLeadInput>;

export const importLeadsInput = z.object({
  csv: z.string().min(1, "CSV content is required").max(2_000_000),
});

export const assignLeadsInput = z.object({
  lead_ids: z.array(z.string().uuid()).max(500).optional(),
});

export const scoreLeadsInput = z.object({
  ids: z.array(z.string().uuid()).max(25).optional(),
});

// Products / line items ----------------------------------------------------------

export const BILLING_INTERVALS = ["one_time", "monthly", "yearly"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const productInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  sku: optionalText,
  description: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  unit_price: z.coerce.number().min(0).default(0),
  // An empty string falls through to the column default ('USD').
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  billing_interval: z.enum(BILLING_INTERVALS).default("one_time"),
  active: z.boolean().default(true),
  tags: tagsInput,
});
export type ProductInput = z.infer<typeof productInput>;

export const lineItemInput = z.object({
  product_id: optionalUuid,
  description: z.string().trim().min(1, "Description is required").max(300),
  quantity: z.coerce.number().positive().default(1),
  unit_price: z.coerce.number().min(0).default(0),
  discount_pct: z.coerce.number().min(0).max(100).default(0),
  position: z.coerce.number().int().min(0).default(0),
});
export type LineItemInput = z.infer<typeof lineItemInput>;

// Quotes --------------------------------------------------------------------------

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "expired"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const quoteInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  deal_id: optionalUuid,
  account_id: optionalUuid,
  contact_id: optionalUuid,
  currency: z.string().trim().length(3).default("USD"),
  discount_pct: z.coerce.number().min(0).max(100).default(0),
  tax_rate: z.coerce.number().min(0).max(100).default(0),
  valid_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  notes: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  terms: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  items: z.array(lineItemInput).max(50).optional(),
});
export type QuoteInput = z.infer<typeof quoteInput>;

export const quotePatchInput = quoteInput.omit({ items: true }).partial();

export const quoteStatusInput = z.object({ status: z.enum(QUOTE_STATUSES) });

// Email templates -------------------------------------------------------------------

export const templateInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(10000),
});
export type TemplateInput = z.infer<typeof templateInput>;

export const templateRenderInput = z.object({
  entity_type: z.enum(["lead", "contact"]),
  entity_id: z.string().uuid(),
});

// Duplicates / merge -------------------------------------------------------------

export const DUPLICATE_RESOURCES = ["leads", "contacts", "accounts"] as const;
export type DuplicateResource = (typeof DUPLICATE_RESOURCES)[number];

export const mergeInput = z.object({
  resource: z.enum(DUPLICATE_RESOURCES),
  primary_id: z.string().uuid(),
  duplicate_ids: z.array(z.string().uuid()).min(1).max(20),
});
export type MergeInput = z.infer<typeof mergeInput>;
