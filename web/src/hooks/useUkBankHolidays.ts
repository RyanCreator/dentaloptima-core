import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";

// Public gov.uk feed. No API key. Three top-level keys:
// "england-and-wales", "scotland", "northern-ireland". Each contains an
// `events` array of { title, date, notes, bunting }.
//   - Christmas Day, Good Friday, etc. → same across all three.
//   - 2 Jan → only Scotland.
//   - 17 Mar (St Patrick's Day), 12 Jul (Battle of the Boyne) → only NI.
// Returns ~3 years of forward data, which is plenty for a calendar view.
const FEED_URL = "https://www.gov.uk/bank-holidays.json";
const CACHE_KEY = "uk-bank-holidays-v1";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type BankHolidayRegion =
  | "england-and-wales"
  | "scotland"
  | "northern-ireland";

export interface BankHoliday {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  /** Human-readable name, e.g. "Christmas Day". */
  title: string;
  /** Optional context from the feed, e.g. "Substitute day". */
  notes: string | null;
}

interface CachedFeed {
  fetchedAt: number;
  payload: GovUkFeed;
}

interface GovUkFeed {
  [region: string]: {
    division: string;
    events: Array<{
      title: string;
      date: string;
      notes: string;
      bunting: boolean;
    }>;
  };
}

function loadFromCache(): GovUkFeed | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedFeed = JSON.parse(raw);
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null;
    return cached.payload;
  } catch {
    return null;
  }
}

function saveToCache(payload: GovUkFeed) {
  try {
    const entry: CachedFeed = { fetchedAt: Date.now(), payload };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // Storage quota / private mode — non-fatal, we just re-fetch next time.
  }
}

/**
 * Fetch + cache UK bank holidays for the given region. Returns the list
 * as { date, title, notes } objects sorted by date ascending.
 *
 * Calls return immediately with cached data when available; the network
 * fetch happens in the background and refreshes the cache. If the feed
 * is unreachable we return whatever was cached previously (or [] on a
 * cold cache) and log silently — bank holidays aren't critical enough
 * to surface a toast for.
 */
export function useUkBankHolidays(
  region: BankHolidayRegion,
  enabled: boolean,
): { holidays: BankHoliday[]; loading: boolean } {
  const [holidays, setHolidays] = useState<BankHoliday[]>(() => {
    if (!enabled) return [];
    const cached = loadFromCache();
    return cached ? extract(cached, region) : [];
  });
  const [loading, setLoading] = useState(() => holidays.length === 0 && enabled);

  useEffect(() => {
    if (!enabled) {
      setHolidays([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cached = loadFromCache();
    if (cached) {
      setHolidays(extract(cached, region));
      setLoading(false);
    }

    // Always fire the network fetch in the background — keeps the cache
    // fresh without blocking initial render on a cold cache. If it
    // fails, we keep whatever cached data we already showed.
    (async () => {
      try {
        const res = await fetch(FEED_URL, { cache: "no-cache" });
        if (!res.ok) throw new Error(`gov.uk feed ${res.status}`);
        const payload: GovUkFeed = await res.json();
        if (cancelled) return;
        saveToCache(payload);
        setHolidays(extract(payload, region));
      } catch (err) {
        logger.warn("UK bank-holidays feed unavailable; using cached data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [region, enabled]);

  return { holidays, loading };
}

function extract(payload: GovUkFeed, region: BankHolidayRegion): BankHoliday[] {
  const events = payload[region]?.events ?? [];
  return events
    .map((e) => ({
      date: e.date,
      title: e.title,
      notes: e.notes && e.notes.trim() ? e.notes : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Look up a holiday for a specific date string (YYYY-MM-DD). Returns
 * the holiday object or null. Cheap O(n) scan — `holidays` is at most
 * ~24 entries (3 years × 8 holidays/year).
 */
export function getHolidayForDate(
  holidays: BankHoliday[],
  isoDate: string,
): BankHoliday | null {
  return holidays.find((h) => h.date === isoDate) ?? null;
}
