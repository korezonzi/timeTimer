import { load, type Store } from "@tauri-apps/plugin-store";

const STATS_KEY = "dailyStats";

export interface DailyRecord {
  date: string; // YYYY-MM-DD
  focusTimeSec: number;
  completedSessions: number;
}

let statsStore: Store | null = null;

async function getStatsStore(): Promise<Store> {
  if (!statsStore) {
    statsStore = await load("stats.json");
  }
  return statsStore;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function recordSessionComplete(focusTimeSec: number): Promise<void> {
  const store = await getStatsStore();
  const all = (await store.get<DailyRecord[]>(STATS_KEY)) ?? [];

  const today = todayKey();
  const existing = all.find((r) => r.date === today);
  if (existing) {
    existing.focusTimeSec += focusTimeSec;
    existing.completedSessions += 1;
  } else {
    all.push({ date: today, focusTimeSec, completedSessions: 1 });
  }

  // Keep only last 30 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const trimmed = all.filter((r) => r.date >= cutoffStr);

  await store.set(STATS_KEY, trimmed);
}

export async function getRecentStats(days: number = 7): Promise<DailyRecord[]> {
  const store = await getStatsStore();
  const all = (await store.get<DailyRecord[]>(STATS_KEY)) ?? [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return all.filter((r) => r.date >= cutoffStr).sort((a, b) => a.date.localeCompare(b.date));
}
