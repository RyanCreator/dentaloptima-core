#!/usr/bin/env node
// migrate-ops-data.mjs
//
// One-shot data migration from the legacy registry Supabase project into
// dentaloptima-core's `ops` schema. Preserves primary keys so any external
// references (Postmark message IDs, etc.) keep working.
//
// Usage:
//   1. Copy scripts/.env.migration.example → scripts/.env.migration
//   2. Fill in REGISTRY_SERVICE_ROLE_KEY and CORE_SERVICE_ROLE_KEY
//      (Supabase Dashboard → Project Settings → API → service_role)
//   3. node scripts/migrate-ops-data.mjs
//   4. Delete scripts/.env.migration when done (or rotate the keys)
//
// Idempotent: uses upsert on PK so re-running is safe. Foreign-key order
// is enforced by the migration sequence below.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- env loading -----------------------------------------------------------
function loadEnv() {
  const envPath = join(__dirname, ".env.migration");
  let env = { ...process.env };
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  } catch {
    /* fine, fall back to process env */
  }
  const missing = [
    "REGISTRY_URL",
    "REGISTRY_SERVICE_ROLE_KEY",
    "CORE_URL",
    "CORE_SERVICE_ROLE_KEY",
  ].filter((k) => !env[k]);
  if (missing.length) {
    console.error("Missing env vars:", missing.join(", "));
    console.error("See scripts/.env.migration.example");
    process.exit(1);
  }
  return env;
}

const env = loadEnv();
const registry = createClient(env.REGISTRY_URL, env.REGISTRY_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const core = createClient(env.CORE_URL, env.CORE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  // The ops schema isn't in the default exposed_schemas list; tell supabase-js
  // to address it explicitly.
  db: { schema: "ops" },
});

// ---- migration helpers -----------------------------------------------------
async function pull(table, columns) {
  const { data, error } = await registry
    .schema("public")
    .from(table)
    .select(columns)
    .order("id");
  if (error) throw new Error(`pull ${table}: ${error.message}`);
  return data ?? [];
}

async function push(table, rows, chunkSize = 100) {
  if (rows.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await core.from(table).upsert(chunk, { onConflict: "id" });
    if (error) throw new Error(`push ${table}: ${error.message}`);
    inserted += chunk.length;
    process.stdout.write(`  → ${inserted}/${rows.length}\r`);
  }
  process.stdout.write(`  → ${inserted}/${rows.length}\n`);
  return inserted;
}

async function migrateTable(name, columns, chunkSize = 100) {
  console.log(`\n• ${name}`);
  const rows = await pull(name, columns);
  console.log(`  pulled ${rows.length} rows from registry`);
  const inserted = await push(name, rows, chunkSize);
  console.log(`  inserted ${inserted} into ops.${name}`);
}

// ---- migration sequence (FK-respecting) ------------------------------------
async function main() {
  console.log("Migration: registry → dentaloptima-core (ops schema)");
  console.log("─".repeat(60));

  // No FK deps
  await migrateTable("platform_announcement",
    "id,title,body,severity,starts_at,ends_at,active,created_at,updated_at,created_by");

  await migrateTable("payment_event",
    "id,tenant_id,amount_pence,paid_at,extends_paid_until_to,method,reference,notes,recorded_by,recorded_at,archived_at");

  await migrateTable("marketing_lead",
    "id,name,email,message,ip_address,user_agent,status,notes,converted_to_tenant_id,created_at,updated_at");

  await migrateTable("outreach_contact",
    "id,email,first_name,last_name,practice_name,phone,custom,source,notes,status,status_changed_at,last_emailed_at,last_opened_at,last_clicked_at,created_at,updated_at,archived_at");

  await migrateTable("outreach_template",
    "id,name,subject,body_text,body_html,description,created_by,created_at,updated_at,last_used_at,archived_at");

  await migrateTable("email_account",
    "id,address,display_name,postmark_signature_id,color,is_active,created_at,updated_at");

  // Depend on the above
  await migrateTable("outreach_campaign",
    "id,name,template_id,from_address,reply_to_address,total_count,sent_count,delivered_count,bounced_count,complained_count,opened_count,clicked_count,failed_count,skipped_count,status,send_interval_seconds,started_at,completed_at,created_by,created_at,updated_at,archived_at");

  await migrateTable("outreach_send",
    "id,campaign_id,contact_id,status,rendered_subject,rendered_body_text,rendered_body_html,postmark_message_id,queued_at,sent_at,delivered_at,first_opened_at,last_opened_at,open_count,first_clicked_at,last_clicked_at,click_count,bounced_at,complained_at,failed_at,failure_reason");

  await migrateTable("outreach_event",
    "id,send_id,postmark_message_id,event_type,payload,occurred_at,received_at");

  await migrateTable("email_thread",
    "id,account_id,subject,subject_norm,last_message_at,message_count,status,lead_id,tenant_id,assigned_to_admin_id,created_at,updated_at");

  await migrateTable("email_message",
    "id,thread_id,direction,from_address,from_name,to_addresses,cc_addresses,bcc_addresses,subject,body_text,body_html,stripped_text,message_id,in_reply_to,references_chain,postmark_message_id,sender_admin_id,delivery_status,raw_headers,received_at,sent_at,created_at");

  await migrateTable("email_attachment",
    "id,message_id,thread_id,file_path,file_name,file_size_bytes,mime_type,content_id,is_inline,uploaded_at");

  await migrateTable("email_message_read",
    "message_id,admin_id,read_at", 100);

  await migrateTable("email_event",
    "id,message_id,postmark_message_id,event_type,payload,occurred_at,received_at");

  await migrateTable("support_thread",
    "id,tenant_id,subject,status,last_message_at,created_at,updated_at");

  await migrateTable("support_message",
    "id,thread_id,direction,author_email,author_name,body,read_at,created_at");

  await migrateTable("support_attachment",
    "id,message_id,thread_id,file_path,file_name,file_size_bytes,mime_type,uploaded_at");

  console.log("\n" + "─".repeat(60));
  console.log("Done.");
}

main().catch((err) => {
  console.error("\nFAILED:", err.message ?? err);
  process.exit(1);
});
