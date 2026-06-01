import { create } from "zustand";
import { load, type Store } from "@tauri-apps/plugin-store";
import type { TimerState, Preset } from "../types/timer";
import { DEFAULT_PRESETS } from "../types/timer";
import * as bridge from "../lib/tauri-bridge";

const STORE_KEY = "settings";

interface PersistedSettings {
  activePresetId: string;
  customPreset: Preset | null;
  muted: boolean;
  sessionsGoal: number;
}

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await load("settings.json");
  }
  return storeInstance;
}

async function saveSettings(settings: PersistedSettings): Promise<void> {
  const store = await getStore();
  await store.set(STORE_KEY, settings);
}

async function loadSettings(): Promise<PersistedSettings | null> {
  const store = await getStore();
  return (await store.get<PersistedSettings>(STORE_KEY)) ?? null;
}

interface TimerStore {
  state: TimerState;
  activePreset: Preset;
  showSettings: boolean;
  windowWidth: number;
  muted: boolean;

  // Actions
  syncState: () => Promise<void>;
  updateState: (state: TimerState) => void;
  toggle: () => Promise<void>;
  reset: () => Promise<void>;
  skip: () => Promise<void>;
  changePreset: (preset: Preset) => Promise<void>;
  setSessionsGoal: (goal: number) => Promise<void>;
  toggleSettings: () => void;
  setWindowWidth: (width: number) => void;
  toggleMute: () => void;
}

export const useTimerStore = create<TimerStore>((set, get) => ({
  state: {
    phase: "idle",
    status: "stopped",
    totalDurationSec: 25 * 60,
    remainingSec: 25 * 60,
    completedSessions: 0,
    currentSessionIndex: 1,
    totalFocusTimeSec: 0,
    sessionsGoal: 8,
  },
  activePreset: DEFAULT_PRESETS[0],
  showSettings: false,
  windowWidth: 200,
  muted: false,

  syncState: async () => {
    const timerState = await bridge.getTimerState();

    // Restore persisted settings
    const saved = await loadSettings();
    if (saved) {
      const preset =
        saved.customPreset ??
        DEFAULT_PRESETS.find((p) => p.id === saved.activePresetId) ??
        DEFAULT_PRESETS[0];

      // Apply saved preset to Rust backend
      const updatedState = await bridge.setPreset(preset);
      if (saved.sessionsGoal > 0) {
        await bridge.setSessionsGoal(saved.sessionsGoal);
      }

      set({
        state: { ...updatedState, sessionsGoal: saved.sessionsGoal || 8 },
        activePreset: preset,
        muted: saved.muted,
      });
    } else {
      set({ state: timerState });
    }
  },

  updateState: (state: TimerState) => {
    set({ state });
  },

  toggle: async () => {
    const state = await bridge.toggleTimer();
    set({ state });
  },

  reset: async () => {
    const state = await bridge.resetTimer();
    set({ state });
  },

  skip: async () => {
    const state = await bridge.skipSession();
    set({ state });
  },

  changePreset: async (preset: Preset) => {
    const state = await bridge.setPreset(preset);
    set({ state, activePreset: preset });
    const { muted } = get();
    await saveSettings({
      activePresetId: preset.id,
      customPreset: preset.id === "custom" ? preset : null,
      muted,
      sessionsGoal: state.sessionsGoal,
    });
  },

  setSessionsGoal: async (goal: number) => {
    const state = await bridge.setSessionsGoal(goal);
    set({ state });
    const { activePreset, muted } = get();
    await saveSettings({
      activePresetId: activePreset.id,
      customPreset: activePreset.id === "custom" ? activePreset : null,
      muted,
      sessionsGoal: goal,
    });
  },

  toggleSettings: () => {
    set((s) => ({ showSettings: !s.showSettings }));
  },

  setWindowWidth: (width: number) => {
    set({ windowWidth: width });
  },

  toggleMute: () => {
    set((s) => {
      const newMuted = !s.muted;
      // Save mute state asynchronously
      const { activePreset, state } = get();
      saveSettings({
        activePresetId: activePreset.id,
        customPreset: activePreset.id === "custom" ? activePreset : null,
        muted: newMuted,
        sessionsGoal: state.sessionsGoal,
      });
      return { muted: newMuted };
    });
  },
}));
