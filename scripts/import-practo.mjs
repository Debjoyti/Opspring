#!/usr/bin/env node
// Imports a Practo clinic export (the 10 CSVs) into the clinic_* tables for a
// given organization. Reads the CSVs from a local directory you point it at —
// the patient PII is NEVER committed to this repo.
//
// Usage:
//   PRACTO_DIR="C:/path/to/PractoExport" CLINIC_ORG_ID="<org-uuid>" npm run import:practo
//   (add RESET=1 to delete this org's existing clinic data first)
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.local).

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIR = process.env.PRACTO_DIR;
const ORG = process.env.CLINIC_ORG_ID;
const RESET = process.env.RESET === "1";

if (!URL || !KEY) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
if (!DIR) throw new Error("Set PRACTO_DIR to the folder holding the Practo CSVs.");
if (!ORG) throw new Error("Set CLINIC_ORG_ID to the target organization's id.");

const admin = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Practo wraps most values in single quotes ('4000', 'Scheduled'). Strip them.
function clean(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/^'(.*)'$/s, "$1").trim();
  return s === "" ? null : s;
}
const num = (v) => {
  const c = clean(v);
  if (c == null) return 0;
  const n = Number(c.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const bool = (v) => {
  const c = (clean(v) ?? "").toLowerCase();
  return c === "yes" || c === "true" || c === "1";
};
// Practo dates: "2022-12-16 13:00:00" or "2022-12-16". Return ISO or null.
const ts = (v) => {
  const c = clean(v);
  if (!c) return null;
  const d = new Date(c.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const dateOnly = (v) => {
  const iso = ts(v);
  return iso ? iso.slice(0, 10) : null;
};

function read(file) {
  const full = path.join(DIR, file);
  const raw = readFileSync(full, "utf8");
  return parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
}

async function insertBatched(table, rows, size = 500) {
  let done = 0;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await admin.from(table).insert(chunk);
    if (error) throw new Error(`${table} batch @${i}: ${error.message}`);
    done += chunk.length;
    process.stdout.write(`\r  ${table}: ${done}/${rows.length}`);
  }
  if (rows.length) process.stdout.write("\n");
}

const CLINIC_TABLES = [
  "clinic_clinical_notes", "clinic_invoices", "clinic_payments",
  "clinic_treatments", "clinic_appointments", "clinic_procedures", "clinic_patients",
];

async function main() {
  if (RESET) {
    console.log("Resetting existing clinic data for this org…");
    for (const t of CLINIC_TABLES) {
      const { error } = await admin.from(t).delete().eq("org_id", ORG);
      if (error) throw new Error(`reset ${t}: ${error.message}`);
    }
  }

  // Patients first, so the others can link by patient_number -> id.
  const patients = read("Patients.csv").map((r) => ({
    org_id: ORG,
    patient_number: clean(r["Patient Number"]) ?? clean(r["Patient Name"]) ?? crypto.randomUUID(),
    name: clean(r["Patient Name"]) ?? "Unknown",
    mobile: clean(r["Mobile Number"]),
    contact_number: clean(r["Contact Number"]),
    email: clean(r["Email Address"]),
    secondary_mobile: clean(r["Secondary Mobile"]),
    gender: clean(r["Gender"]),
    address: clean(r["Address"]),
    locality: clean(r["Locality"]),
    city: clean(r["City"]),
    pincode: clean(r["Pincode"]),
    national_id: clean(r["National Id"]),
    date_of_birth: dateOnly(r["Date of Birth"]),
    age: clean(r["Age"]) ? Math.round(num(r["Age"])) : null,
    anniversary_date: dateOnly(r["Anniversary Date"]),
    blood_group: clean(r["Blood Group"]),
    remarks: clean(r["Remarks"]),
    medical_history: clean(r["Medical History"]),
    referred_by: clean(r["Referred By"]),
    groups: clean(r["Groups"]),
    patient_notes: clean(r["Patient Notes"]),
  }));
  // De-duplicate by patient_number (keep first).
  const seen = new Set();
  const uniquePatients = patients.filter((p) => {
    if (seen.has(p.patient_number)) return false;
    seen.add(p.patient_number);
    return true;
  });
  await insertBatched("clinic_patients", uniquePatients);

  // Build patient_number -> id map.
  const idByNumber = new Map();
  for (let i = 0; i < uniquePatients.length; i += 1000) {
    const nums = uniquePatients.slice(i, i + 1000).map((p) => p.patient_number);
    const { data, error } = await admin
      .from("clinic_patients")
      .select("id, patient_number")
      .eq("org_id", ORG)
      .in("patient_number", nums);
    if (error) throw new Error(`patient lookup: ${error.message}`);
    for (const row of data) idByNumber.set(row.patient_number, row.id);
  }
  const link = (n) => idByNumber.get(clean(n)) ?? null;

  await insertBatched(
    "clinic_procedures",
    read("Procedure Catalog.csv").map((r) => ({
      org_id: ORG,
      name: clean(r["Treatment Name"]) ?? "Unnamed",
      cost: num(r["Treatment Cost"]),
      notes: clean(r["Treatment Notes"]),
      locale: clean(r["Locale"]),
    })),
  );

  await insertBatched(
    "clinic_appointments",
    read("Appointments.csv").map((r) => ({
      org_id: ORG,
      patient_id: link(r["Patient Number"]),
      patient_number: clean(r["Patient Number"]),
      patient_name: clean(r["Patient Name"]),
      appointment_at: ts(r["Date"]),
      doctor: clean(r["DoctorName"]),
      status: clean(r["Status"]),
      notes: clean(r["Notes"]),
      checked_in_at: ts(r["Checked In At"]),
      checked_out_at: ts(r["Checked Out At"]),
    })),
  );

  await insertBatched(
    "clinic_treatments",
    read("Treatment.csv").map((r) => ({
      org_id: ORG,
      patient_id: link(r["Patient Number"]),
      patient_number: clean(r["Patient Number"]),
      treatment_name: clean(r["Treatment Name"]) ?? "Treatment",
      tooth_number: clean(r["Tooth Number"]),
      notes: clean(r["Treatment Notes"]),
      quantity: num(r["Quantity"]) || 1,
      cost: num(r["Treatment Cost"]),
      amount: num(r["Amount"]),
      discount: num(r["Discount"]),
      discount_type: clean(r["DiscountType"]),
      doctor: clean(r["Doctor"]),
      treated_on: dateOnly(r["Date"]),
    })),
  );

  await insertBatched(
    "clinic_payments",
    read("Payments.csv").map((r) => ({
      org_id: ORG,
      patient_id: link(r["Patient Number"]),
      patient_number: clean(r["Patient Number"]),
      receipt_number: clean(r["Receipt Number"]),
      treatment_name: clean(r["Treatment name"]),
      amount_paid: num(r["Amount Paid"]),
      invoice_number: clean(r["Invoice Number"]),
      notes: clean(r["Notes"]),
      refund: bool(r["Refund"]),
      refunded_amount: num(r["Refunded amount"]),
      payment_mode: clean(r["Payment Mode"]),
      cancelled: bool(r["Cancelled"]),
      paid_on: dateOnly(r["Date"]),
    })),
  );

  await insertBatched(
    "clinic_invoices",
    read("Invoices.csv").map((r) => ({
      org_id: ORG,
      patient_id: link(r["Patient Number"]),
      patient_number: clean(r["Patient Number"]),
      doctor: clean(r["Doctor Name"]),
      invoice_number: clean(r["Invoice Number"]),
      treatment_name: clean(r["Treatment Name"]),
      unit_cost: num(r["Unit Cost"]),
      quantity: num(r["Quantity"]) || 1,
      discount: num(r["Discount"]),
      discount_type: clean(r["DiscountType"]),
      type: clean(r["Type"]),
      tax_name: clean(r["Tax name"]),
      tax_percent: num(r["Tax Percent"]),
      cancelled: bool(r["Cancelled"]),
      notes: clean(r["Notes"]),
      description: clean(r["Description"]),
      invoiced_on: dateOnly(r["Date"]),
    })),
  );

  await insertBatched(
    "clinic_clinical_notes",
    read("ClinicalNotes.csv").map((r) => ({
      org_id: ORG,
      patient_id: link(r["Patient Number"]),
      patient_number: clean(r["Patient Number"]),
      doctor: clean(r["Doctor"]),
      type: clean(r["Type"]),
      description: clean(r["Description"]),
      revised: bool(r["Revised"]),
      noted_on: dateOnly(r["Date"]),
    })),
  );

  console.log("\nImport complete.");
}

main().catch((err) => {
  console.error("\n" + err.message);
  process.exit(1);
});
