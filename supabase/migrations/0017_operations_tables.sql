-- ============================================================================
-- 0017_operations_tables.sql
-- Operator-level tables migrated from the legacy registry project.
-- Used by Outreach, Leads, Email inbox, Support inbox, Announcements,
-- Payment recording — modules that operate at platform level.
--
-- These live in a SEPARATE `ops` schema, NOT public. Reasoning:
--   * Clean separation between tenant clinical data (public) and platform
--     operations data (ops). Easier to reason about, easier to scope
--     backups + exports, better CQC inspection story.
--   * Tenant data exports only need to dump public, never ops.
--   * Schema-level grants give us defence in depth: even if a public RLS
--     policy is misconfigured, ops tables aren't reachable without the
--     authenticated role having ops schema USAGE.
--
-- One-time post-deploy step: add `ops` to PostgREST exposed_schemas in
-- Project Settings → API → Exposed schemas, otherwise supabase-js can't
-- query it. After that, use `supabase.schema('ops').from('outreach_contact')`.
--
-- Differences vs the registry source:
--   * No FK to tenant/admin_user (those concepts don't exist here).
--     tenant_id / created_by kept as opaque UUIDs for historical lookup.
--   * RLS: operator-only (is_operator()).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS ops;
GRANT USAGE ON SCHEMA ops TO authenticated, service_role;

-- ============================================================================
-- Enums (in ops schema)
-- ============================================================================
CREATE TYPE ops.lead_status AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'ARCHIVED');
CREATE TYPE ops.announcement_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE ops.outreach_contact_status AS ENUM ('ACTIVE', 'UNSUBSCRIBED', 'BOUNCED', 'COMPLAINED');
CREATE TYPE ops.outreach_campaign_status AS ENUM ('DRAFT', 'SENDING', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE ops.outreach_send_status AS ENUM ('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED', 'FAILED', 'SKIPPED');
CREATE TYPE ops.outreach_event_type AS ENUM ('DELIVERY', 'BOUNCE', 'SPAM_COMPLAINT', 'OPEN', 'CLICK', 'SUBSCRIPTION_CHANGE');
CREATE TYPE ops.email_thread_status AS ENUM ('OPEN', 'CLOSED', 'ARCHIVED', 'SPAM');
CREATE TYPE ops.email_direction AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE ops.email_delivery_status AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'SPAM_COMPLAINED');
CREATE TYPE ops.email_event_type AS ENUM ('DELIVERY', 'BOUNCE', 'SPAM_COMPLAINT', 'OPEN', 'CLICK', 'SUBSCRIPTION_CHANGE');
CREATE TYPE ops.support_thread_status AS ENUM ('OPEN', 'AWAITING_DENTALOPTIMA', 'AWAITING_TENANT', 'RESOLVED', 'CLOSED');
CREATE TYPE ops.support_message_direction AS ENUM ('INBOUND', 'OUTBOUND');

-- ============================================================================
-- platform_announcement
-- ============================================================================
CREATE TABLE ops.platform_announcement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  body text,
  severity ops.announcement_severity NOT NULL DEFAULT 'info',
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX idx_announcement_active ON ops.platform_announcement (active, starts_at DESC) WHERE active = true;
CREATE TRIGGER trg_announcement_updated_at BEFORE UPDATE ON ops.platform_announcement FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_updated_at();

-- ============================================================================
-- payment_event
-- ============================================================================
CREATE TABLE ops.payment_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,  -- legacy tenant.id; opaque (no FK to practice yet)
  amount_pence integer NOT NULL CHECK (amount_pence >= 0),
  paid_at timestamptz NOT NULL,
  extends_paid_until_to timestamptz,
  method text,
  reference text,
  notes text,
  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX idx_payment_event_tenant ON ops.payment_event (tenant_id, paid_at DESC);
CREATE INDEX idx_payment_event_recent ON ops.payment_event (recorded_at DESC) WHERE archived_at IS NULL;

-- ============================================================================
-- marketing_lead
-- ============================================================================
CREATE TABLE ops.marketing_lead (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  email text NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message text,
  ip_address inet,
  user_agent text,
  status ops.lead_status NOT NULL DEFAULT 'NEW',
  notes text,
  converted_to_tenant_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_marketing_lead_status ON ops.marketing_lead (status, created_at DESC);
CREATE INDEX idx_marketing_lead_email ON ops.marketing_lead (email);
CREATE TRIGGER trg_marketing_lead_updated_at BEFORE UPDATE ON ops.marketing_lead FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_updated_at();

-- ============================================================================
-- outreach_contact
-- ============================================================================
CREATE TABLE ops.outreach_contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  first_name text,
  last_name text,
  practice_name text,
  phone text,
  custom jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  notes text,
  status ops.outreach_contact_status NOT NULL DEFAULT 'ACTIVE',
  status_changed_at timestamptz,
  last_emailed_at timestamptz,
  last_opened_at timestamptz,
  last_clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX idx_outreach_contact_status ON ops.outreach_contact (status) WHERE archived_at IS NULL;
CREATE INDEX idx_outreach_contact_created ON ops.outreach_contact (created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX idx_outreach_contact_practice ON ops.outreach_contact (practice_name) WHERE archived_at IS NULL;
CREATE INDEX idx_outreach_contact_email_trgm ON ops.outreach_contact USING gin (email extensions.gin_trgm_ops);
CREATE TRIGGER trg_outreach_contact_updated_at BEFORE UPDATE ON ops.outreach_contact FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_updated_at();

-- ============================================================================
-- outreach_template
-- ============================================================================
CREATE TABLE ops.outreach_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  subject text NOT NULL CHECK (length(trim(subject)) > 0),
  body_text text NOT NULL,
  body_html text,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  archived_at timestamptz
);
CREATE INDEX idx_outreach_template_active ON ops.outreach_template (created_at DESC) WHERE archived_at IS NULL;
CREATE TRIGGER trg_outreach_template_updated_at BEFORE UPDATE ON ops.outreach_template FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_updated_at();

-- ============================================================================
-- outreach_campaign
-- ============================================================================
CREATE TABLE ops.outreach_campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  template_id uuid REFERENCES ops.outreach_template(id) ON DELETE SET NULL,
  from_address text NOT NULL DEFAULT 'contact@dentaloptima.co.uk',
  reply_to_address text,
  total_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  bounced_count integer NOT NULL DEFAULT 0,
  complained_count integer NOT NULL DEFAULT 0,
  opened_count integer NOT NULL DEFAULT 0,
  clicked_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  status ops.outreach_campaign_status NOT NULL DEFAULT 'DRAFT',
  send_interval_seconds integer NOT NULL DEFAULT 30 CHECK (send_interval_seconds > 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE INDEX idx_outreach_campaign_status ON ops.outreach_campaign (status, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX idx_outreach_campaign_template ON ops.outreach_campaign (template_id) WHERE template_id IS NOT NULL;
CREATE TRIGGER trg_outreach_campaign_updated_at BEFORE UPDATE ON ops.outreach_campaign FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_updated_at();

-- ============================================================================
-- outreach_send
-- ============================================================================
CREATE TABLE ops.outreach_send (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES ops.outreach_campaign(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL REFERENCES ops.outreach_contact(id) ON DELETE RESTRICT,
  status ops.outreach_send_status NOT NULL DEFAULT 'QUEUED',
  rendered_subject text,
  rendered_body_text text,
  rendered_body_html text,
  postmark_message_id text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  first_clicked_at timestamptz,
  last_clicked_at timestamptz,
  click_count integer NOT NULL DEFAULT 0,
  bounced_at timestamptz,
  complained_at timestamptz,
  failed_at timestamptz,
  failure_reason text
);
CREATE INDEX idx_outreach_send_campaign ON ops.outreach_send (campaign_id, status);
CREATE INDEX idx_outreach_send_contact ON ops.outreach_send (contact_id);
CREATE INDEX idx_outreach_send_postmark ON ops.outreach_send (postmark_message_id) WHERE postmark_message_id IS NOT NULL;

-- ============================================================================
-- outreach_event
-- ============================================================================
CREATE TABLE ops.outreach_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id uuid REFERENCES ops.outreach_send(id) ON DELETE SET NULL,
  postmark_message_id text,
  event_type ops.outreach_event_type NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_outreach_event_send ON ops.outreach_event (send_id, occurred_at DESC) WHERE send_id IS NOT NULL;
CREATE INDEX idx_outreach_event_postmark ON ops.outreach_event (postmark_message_id) WHERE postmark_message_id IS NOT NULL;

-- ============================================================================
-- email_account
-- ============================================================================
CREATE TABLE ops.email_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL UNIQUE CHECK (address = lower(address)),
  display_name text NOT NULL,
  postmark_signature_id bigint UNIQUE,
  color text NOT NULL DEFAULT 'slate',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_email_account_updated_at BEFORE UPDATE ON ops.email_account FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_updated_at();

-- ============================================================================
-- email_thread
-- ============================================================================
CREATE TABLE ops.email_thread (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES ops.email_account(id) ON DELETE RESTRICT,
  subject text NOT NULL CHECK (length(trim(subject)) > 0),
  subject_norm text NOT NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  message_count integer NOT NULL DEFAULT 0,
  status ops.email_thread_status NOT NULL DEFAULT 'OPEN',
  lead_id uuid REFERENCES ops.marketing_lead(id) ON DELETE SET NULL,
  tenant_id uuid,
  assigned_to_admin_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_thread_account ON ops.email_thread (account_id, last_message_at DESC);
CREATE INDEX idx_email_thread_status ON ops.email_thread (status, last_message_at DESC) WHERE status = 'OPEN';
CREATE INDEX idx_email_thread_lead ON ops.email_thread (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_email_thread_tenant ON ops.email_thread (tenant_id) WHERE tenant_id IS NOT NULL;
CREATE TRIGGER trg_email_thread_updated_at BEFORE UPDATE ON ops.email_thread FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_updated_at();

-- ============================================================================
-- email_message
-- ============================================================================
CREATE TABLE ops.email_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES ops.email_thread(id) ON DELETE RESTRICT,
  direction ops.email_direction NOT NULL,
  from_address text NOT NULL CHECK (from_address = lower(from_address)),
  from_name text,
  to_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  bcc_addresses jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text NOT NULL,
  body_text text,
  body_html text,
  stripped_text text,
  message_id text NOT NULL UNIQUE,
  in_reply_to text,
  references_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  postmark_message_id text,
  sender_admin_id uuid,
  delivery_status ops.email_delivery_status,
  raw_headers jsonb,
  received_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_message_thread ON ops.email_message (thread_id, created_at);
CREATE INDEX idx_email_message_postmark ON ops.email_message (postmark_message_id) WHERE postmark_message_id IS NOT NULL;

-- ============================================================================
-- email_attachment
-- ============================================================================
CREATE TABLE ops.email_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES ops.email_message(id) ON DELETE RESTRICT,
  thread_id uuid NOT NULL REFERENCES ops.email_thread(id) ON DELETE RESTRICT,
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  file_size_bytes bigint NOT NULL,
  mime_type text,
  content_id text,
  is_inline boolean NOT NULL DEFAULT false,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_attachment_message ON ops.email_attachment (message_id);
CREATE INDEX idx_email_attachment_thread ON ops.email_attachment (thread_id);

-- ============================================================================
-- email_message_read
-- ============================================================================
CREATE TABLE ops.email_message_read (
  message_id uuid NOT NULL REFERENCES ops.email_message(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, admin_id)
);

-- ============================================================================
-- email_event
-- ============================================================================
CREATE TABLE ops.email_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES ops.email_message(id) ON DELETE SET NULL,
  postmark_message_id text,
  event_type ops.email_event_type NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_email_event_message ON ops.email_event (message_id, occurred_at DESC) WHERE message_id IS NOT NULL;

-- ============================================================================
-- support_thread
-- ============================================================================
CREATE TABLE ops.support_thread (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  subject text NOT NULL,
  status ops.support_thread_status NOT NULL DEFAULT 'OPEN',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_thread_tenant ON ops.support_thread (tenant_id, last_message_at DESC) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_support_thread_status ON ops.support_thread (status, last_message_at DESC) WHERE status IN ('OPEN', 'AWAITING_DENTALOPTIMA');
CREATE TRIGGER trg_support_thread_updated_at BEFORE UPDATE ON ops.support_thread FOR EACH ROW EXECUTE FUNCTION app_private.fn_set_updated_at();

-- ============================================================================
-- support_message
-- ============================================================================
CREATE TABLE ops.support_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES ops.support_thread(id) ON DELETE RESTRICT,
  direction ops.support_message_direction NOT NULL,
  author_email text NOT NULL,
  author_name text,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_message_thread ON ops.support_message (thread_id, created_at);

-- ============================================================================
-- support_attachment
-- ============================================================================
CREATE TABLE ops.support_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES ops.support_message(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES ops.support_thread(id) ON DELETE RESTRICT,
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  file_size_bytes bigint NOT NULL,
  mime_type text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_attachment_thread ON ops.support_attachment (thread_id);
CREATE INDEX idx_support_attachment_message ON ops.support_attachment (message_id) WHERE message_id IS NOT NULL;

-- ============================================================================
-- RLS — operator-only on every table
-- ============================================================================
DO $$
DECLARE
  t text;
  ops_tables text[] := ARRAY[
    'platform_announcement', 'payment_event', 'marketing_lead',
    'outreach_contact', 'outreach_template', 'outreach_campaign', 'outreach_send', 'outreach_event',
    'email_account', 'email_thread', 'email_message', 'email_attachment', 'email_message_read', 'email_event',
    'support_thread', 'support_message', 'support_attachment'
  ];
BEGIN
  FOREACH t IN ARRAY ops_tables LOOP
    EXECUTE format('ALTER TABLE ops.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I_op_select ON ops.%I FOR SELECT TO authenticated USING ((select app_private.is_operator()))',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_op_insert ON ops.%I FOR INSERT TO authenticated WITH CHECK ((select app_private.is_operator()))',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_op_update ON ops.%I FOR UPDATE TO authenticated USING ((select app_private.is_operator())) WITH CHECK ((select app_private.is_operator()))',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_op_delete ON ops.%I FOR DELETE TO authenticated USING ((select app_private.is_operator()))',
      t, t
    );
  END LOOP;
END $$;

COMMENT ON SCHEMA ops IS 'Operator-level platform tables. Outreach, email inbox, support, leads, announcements, payments. Separate from public (tenant clinical data) for clean concern separation.';
