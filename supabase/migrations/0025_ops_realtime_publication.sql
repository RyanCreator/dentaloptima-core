-- 0025_ops_realtime_publication.sql
--
-- Enrol the ops tables we want live updates on into supabase_realtime.
-- Without this, the admin app's `postgres_changes` channels for these
-- tables never receive events — UI mutations succeed in the DB but the
-- list view doesn't refresh, which looks broken.
--
-- We're deliberately not adding everything in `ops` — tables that don't
-- have UI live-update consumers (e.g. ops.payment_event, ops.outreach_send
-- where the campaign-detail page subscribes but the list page doesn't)
-- get added when their consumer needs them.

ALTER PUBLICATION supabase_realtime ADD TABLE
  ops.support_thread,
  ops.support_message,
  ops.email_thread,
  ops.email_message,
  ops.platform_announcement,
  ops.outreach_campaign,
  ops.outreach_send,
  ops.marketing_lead;
