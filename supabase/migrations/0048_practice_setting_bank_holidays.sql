-- 0048_practice_setting_bank_holidays.sql
--
-- UK bank-holiday display config on the calendar. Two columns:
--   - show_bank_holidays: whether to render the holiday marker / banner
--   - bank_holidays_region: which gov.uk feed to use
--
-- We don't store the holidays themselves — they're fetched live from
-- gov.uk's public bank-holidays.json feed (no API key, 3 years of
-- forward data, government-maintained). Cached client-side with a 7-day
-- TTL so we're not hitting the feed on every page load.
--
-- Region is restricted to the three gov.uk feed buckets so a typo can't
-- leave us trying to fetch a nonexistent feed.

ALTER TABLE public.practice_setting
  ADD COLUMN IF NOT EXISTS show_bank_holidays boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bank_holidays_region text NOT NULL DEFAULT 'england-and-wales'
    CHECK (bank_holidays_region IN ('england-and-wales', 'scotland', 'northern-ireland'));

COMMENT ON COLUMN public.practice_setting.show_bank_holidays IS
  'Render UK bank-holiday markers + banner on the calendar. Default ON since most UK dental practices want this; toggle off in Settings if not relevant.';
COMMENT ON COLUMN public.practice_setting.bank_holidays_region IS
  'Which gov.uk bank-holidays feed to use. Holidays vary across UK nations (Scotland has 2 Jan; NI has St Patrick''s Day; etc.). Defaults to england-and-wales.';
