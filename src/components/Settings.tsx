import { useState, useEffect } from "react";
import { useTimerStore } from "../stores/timerStore";
import { DEFAULT_PRESETS } from "../types/timer";
import type { Preset } from "../types/timer";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { getRecentStats, type DailyRecord } from "../lib/stats";

export function Settings() {
  const { showSettings, toggleSettings, activePreset, changePreset, state, setSessionsGoal } =
    useTimerStore();
  const [customMinutes, setCustomMinutes] = useState("");
  const [customBreak, setCustomBreak] = useState("");
  const [goalInput, setGoalInput] = useState(String(state.sessionsGoal));
  const [autoStart, setAutoStart] = useState(false);
  const [stats, setStats] = useState<DailyRecord[]>([]);

  useEffect(() => {
    if (showSettings) {
      isEnabled().then(setAutoStart).catch(() => {});
      getRecentStats(7).then(setStats).catch(() => {});
    }
  }, [showSettings]);

  if (!showSettings) return null;

  const handlePresetSelect = (preset: Preset) => {
    changePreset(preset);
  };

  const handleCustomApply = () => {
    const work = parseInt(customMinutes, 10);
    const breakMin = parseInt(customBreak, 10);
    if (isNaN(work) || work <= 0) return;
    const breakDuration = isNaN(breakMin) || breakMin <= 0 ? 5 : breakMin;

    const custom: Preset = {
      id: "custom",
      name: `Custom ${work}min`,
      workDurationSec: work * 60,
      breakDurationSec: breakDuration * 60,
      longBreakDurationSec: breakDuration * 2 * 60,
      sessionsBeforeLongBreak: 4,
    };
    changePreset(custom);
  };

  const handleGoalApply = () => {
    const goal = parseInt(goalInput, 10);
    if (!isNaN(goal) && goal > 0) {
      setSessionsGoal(goal);
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.9)",
        borderRadius: "50%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: 20,
        color: "white",
        fontSize: 11,
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
      }}
    >
      <div style={{ fontWeight: "bold", fontSize: 12, marginBottom: 4 }}>
        Presets
      </div>

      {DEFAULT_PRESETS.map((p) => (
        <button
          key={p.id}
          onClick={() => handlePresetSelect(p)}
          style={{
            ...presetButtonStyle,
            background:
              activePreset.id === p.id
                ? "rgba(255,255,255,0.2)"
                : "rgba(255,255,255,0.05)",
          }}
        >
          {p.name} ({p.workDurationSec / 60}/{p.breakDurationSec / 60})
        </button>
      ))}

      <div
        style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 4 }}
      >
        <input
          type="number"
          placeholder="Work min"
          value={customMinutes}
          onChange={(e) => setCustomMinutes(e.target.value)}
          style={inputStyle}
        />
        <input
          type="number"
          placeholder="Break"
          value={customBreak}
          onChange={(e) => setCustomBreak(e.target.value)}
          style={inputStyle}
        />
        <button onClick={handleCustomApply} style={smallButtonStyle}>
          Set
        </button>
      </div>

      <div
        style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}
      >
        <span style={{ fontSize: 10 }}>Goal:</span>
        <input
          type="number"
          value={goalInput}
          onChange={(e) => setGoalInput(e.target.value)}
          style={{ ...inputStyle, width: 36 }}
        />
        <button onClick={handleGoalApply} style={smallButtonStyle}>
          Set
        </button>
      </div>

      <div
        style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}
      >
        <span style={{ fontSize: 10 }}>Auto-start:</span>
        <button
          onClick={async () => {
            if (autoStart) {
              await disable();
              setAutoStart(false);
            } else {
              await enable();
              setAutoStart(true);
            }
          }}
          style={{
            ...smallButtonStyle,
            background: autoStart
              ? "rgba(34,197,94,0.3)"
              : "rgba(255,255,255,0.1)",
          }}
        >
          {autoStart ? "ON" : "OFF"}
        </button>
      </div>

      {/* Weekly stats mini chart */}
      {stats.length > 0 && (
        <div style={{ marginTop: 4, width: "80%" }}>
          <div style={{ fontSize: 9, opacity: 0.6, marginBottom: 2, textAlign: "center" }}>
            7-day Focus
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 24, justifyContent: "center" }}>
            {stats.map((day) => {
              const maxMin = Math.max(...stats.map((d) => d.focusTimeSec / 60), 1);
              const h = Math.max(2, (day.focusTimeSec / 60 / maxMin) * 20);
              return (
                <div
                  key={day.date}
                  title={`${day.date}: ${Math.round(day.focusTimeSec / 60)}min / ${day.completedSessions} sessions`}
                  style={{
                    width: 8,
                    height: h,
                    background: "rgba(34,197,94,0.6)",
                    borderRadius: 2,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={toggleSettings}
        style={{ ...smallButtonStyle, marginTop: 4 }}
      >
        Close
      </button>
    </div>
  );
}

const presetButtonStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 6,
  padding: "3px 8px",
  color: "white",
  fontSize: 10,
  cursor: "pointer",
  width: "80%",
  textAlign: "center" as const,
};

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 4,
  padding: "2px 4px",
  color: "white",
  fontSize: 10,
  width: 48,
  textAlign: "center" as const,
};

const smallButtonStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.15)",
  border: "none",
  borderRadius: 4,
  padding: "2px 8px",
  color: "white",
  fontSize: 10,
  cursor: "pointer",
};
