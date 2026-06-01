import { useEffect, useCallback, useRef } from "react";
import { TimerDial } from "./components/TimerDial";
import { Controls } from "./components/Controls";
import { Settings } from "./components/Settings";
import { useTimerStore } from "./stores/timerStore";
import { onTimerTick, onTimerCompleted } from "./lib/tauri-bridge";
import { playTick, playBell } from "./lib/sound";
import { recordSessionComplete } from "./lib/stats";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  isRegistered,
  register,
} from "@tauri-apps/plugin-global-shortcut";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import "./App.css";

export default function App() {
  const { syncState, updateState, toggle, reset, skip, toggleSettings, toggleMute, setWindowWidth } =
    useTimerStore();

  // Sync initial state from Rust
  useEffect(() => {
    syncState();
  }, [syncState]);

  // Listen for tick events from Rust — play countdown sounds
  const prevRemainingRef = useRef<number | null>(null);

  useEffect(() => {
    const unlistenTick = onTimerTick((state) => {
      updateState(state);

      const muted = useTimerStore.getState().muted;
      if (!muted && state.status === "running") {
        // Tick sound for last 5 seconds
        if (state.remainingSec > 0 && state.remainingSec <= 5) {
          const prev = prevRemainingRef.current;
          if (prev === null || prev !== state.remainingSec) {
            playTick();
          }
        }
      }
      prevRemainingRef.current = state.remainingSec;
    });
    const unlistenComplete = onTimerCompleted((phase) => {
      const muted = useTimerStore.getState().muted;
      if (!muted) {
        playBell();
      }
      const phaseLabel =
        phase === "work" ? "Focus session" : phase === "break" ? "Break" : "Long break";
      sendNotificationSafe(`${phaseLabel} complete!`);

      // Record focus session stats
      if (phase === "work") {
        const { activePreset } = useTimerStore.getState();
        recordSessionComplete(activePreset.workDurationSec);
      }
    });
    return () => {
      unlistenTick.then((fn) => fn());
      unlistenComplete.then((fn) => fn());
    };
  }, [updateState]);

  // Track window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setWindowWidth]);

  // Keyboard shortcuts (in-app)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          toggle();
          break;
        case "r":
        case "R":
          reset();
          break;
        case "s":
        case "S":
          skip();
          break;
        case "m":
        case "M":
          toggleMute();
          break;
        case ",":
          if (e.metaKey) {
            e.preventDefault();
            toggleSettings();
          }
          break;
      }
    },
    [toggle, reset, skip, toggleSettings, toggleMute],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Register global shortcuts
  useEffect(() => {
    registerGlobalShortcuts(toggle, reset, skip);
  }, [toggle, reset, skip]);

  return (
    <div
      className="app-container"
      onMouseDown={(e) => {
        // Only drag when clicking on the background, not on buttons
        if (!(e.target as HTMLElement).closest("button, input")) {
          getCurrentWindow().startDragging();
        }
      }}
    >
      <TimerDial />
      <Controls />
      <Settings />
    </div>
  );
}

async function registerGlobalShortcuts(
  toggle: () => Promise<void>,
  reset: () => Promise<void>,
  skip: () => Promise<void>,
) {
  try {
    const shortcuts: Array<{ keys: string; handler: () => void }> = [
      { keys: "Ctrl+Shift+Space", handler: toggle },
      { keys: "Ctrl+Shift+KeyR", handler: reset },
      { keys: "Ctrl+Shift+KeyS", handler: skip },
    ];

    for (const { keys, handler } of shortcuts) {
      const registered = await isRegistered(keys);
      if (!registered) {
        await register(keys, (event) => {
          if (event.state === "Pressed") {
            handler();
          }
        });
      }
    }
  } catch (err) {
    console.warn("Failed to register global shortcuts:", err);
  }
}

async function sendNotificationSafe(body: string) {
  try {
    let permitted = await isPermissionGranted();
    if (!permitted) {
      const permission = await requestPermission();
      permitted = permission === "granted";
    }
    if (permitted) {
      sendNotification({ title: "TimeTimer", body });
    }
  } catch (err) {
    console.warn("Notification failed:", err);
  }
}
