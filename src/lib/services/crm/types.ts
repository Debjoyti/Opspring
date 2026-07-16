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

// Invoices ---------------------------------------------------------------------------

export const INVOICE_STATUSES = [
  "draft",
  "sent",
  "partially_paid",
  "paid",
  "void",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = [
  "bank_transfer",
  "card",
  "cash",
  "check",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal("").transform(() => undefined));

export const invoiceInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  quote_id: optionalUuid,
  deal_id: optionalUuid,
  account_id: optionalUuid,
  contact_id: optionalUuid,
  currency: z.string().trim().length(3).default("USD"),
  discount_pct: z.coerce.number().min(0).max(100).default(0),
  tax_rate: z.coerce.number().min(0).max(100).default(0),
  issue_date: optionalDate,
  due_date: optionalDate,
  notes: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  terms: z.string().trim().max(2000).optional().or(z.literal("").transform(() => undefined)),
  items: z.array(lineItemInput).max(50).optional(),
});
export type InvoiceInput = z.infer<typeof invoiceInput>;

export const invoicePatchInput = invoiceInput.omit({ items: true, quote_id: true }).partial();

export const invoiceStatusInput = z.object({
  status: z.enum(["sent", "void"]),
});

export const paymentInput = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  method: z.enum(PAYMENT_METHODS).default("bank_transfer"),
  reference: optionalText,
  notes: optionalText,
  paid_at: z.string().datetime().optional().or(z.literal("").transform(() => undefined)),
});
export type PaymentInput = z.infer<typeof paymentInput>;

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

// Automations ---------------------------------------------------------------------

export const AUTOMATION_EVENTS = [
  "lead_created",
  "deal_created",
  "deal_stage_changed",
  "quote_accepted",
  "invoice_paid",
] as const;
export type AutomationEvent = (typeof AUTOMATION_EVENTS)[number];

export const automationAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assign_round_robin") }),
  z.object({
    type: z.literal("create_task"),
    subject: z.string().trim().min(1, "Task subject is required").max(200),
    due_in_days: z.coerce.number().int().min(0).max(365).default(3),
  }),
  z.object({
    type: z.literal("add_tags"),
    tags: z.array(z.string().trim().min(1).max(50)).min(1).max(10),
  }),
  z.object({
    type: z.literal("enroll_in_cadence"),
    cadence_id: z.string().uuid(),
  }),
]);
export type AutomationAction = z.infer<typeof automationAction>;

export const automationRuleInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  enabled: z.boolean().default(true),
  trigger_event: z.enum(AUTOMATION_EVENTS),
  condition_stage_id: optionalUuid,
  actions: z.array(automationAction).min(1, "Add at least one action").max(5),
});
export type AutomationRuleInput = z.infer<typeof automationRuleInput>;

// Cadences ------------------------------------------------------------------------

export const cadenceStepDef = z.object({
  position: z.coerce.number().int().min(0).default(0),
  day_offset: z.coerce.number().int().min(0).max(365).default(0),
  activity_type: z.enum(ACTIVITY_TYPES).default("task"),
  subject: z.string().trim().min(1, "Step subject is required").max(200),
});

export const cadenceInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: optionalText,
  active: z.boolean().default(true),
  steps: z.array(cadenceStepDef).min(1, "Add at least one step").max(20).optional(),
});
export type CadenceInput = z.infer<typeof cadenceInput>;

export const cadencePatchInput = cadenceInput.omit({ steps: true }).partial();

export const cadenceStepInput = cadenceStepDef.extend({
  cadence_id: z.string().uuid(),
});

export const enrollInput = z.object({
  entity_type: z.enum(["lead", "contact"]),
  entity_id: z.string().uuid(),
});

// Saved views ---------------------------------------------------------------------

export const SAVED_VIEW_RESOURCES = ["leads", "deals", "contacts", "accounts"] as const;

export const savedViewInput = z.object({
  resource: z.enum(SAVED_VIEW_RESOURCES),
  name: z.string().trim().min(1, "Name is required").max(80),
  filters: z.record(z.string(), z.string()).default({}),
});
export type SavedViewInput = z.infer<typeof savedViewInput>;

// Duplicates / merge -------------------------------------------------------------

export const DUPLICATE_RESOURCES = ["leads", "contacts", "accounts"] as const;
export type DuplicateResource = (typeof DUPLICATE_RESOURCES)[number];

export const mergeInput = z.object({
  resource: z.enum(DUPLICATE_RESOURCES),
  primary_id: z.string().uuid(),
  duplicate_ids: z.array(z.string().uuid()).min(1).max(20),
});
export type MergeInput = z.infer<typeof mergeInput>;
