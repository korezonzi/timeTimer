import { useTimerStore } from "../stores/timerStore";

export function Controls() {
  const { state, toggle, reset, skip, toggleSettings, toggleMute, muted, windowWidth } =
    useTimerStore();

  if (windowWidth < 120) return null;

  const isRunning = state.status === "running";
  const isStopped = state.status === "stopped";

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        opacity: 0,
        transition: "opacity 0.2s",
        pointerEvents: "none",
      }}
      className="controls-overlay"
    >
      {/* Main toggle button — large */}
      <button
        onClick={toggle}
        style={mainButtonStyle}
        title="Start/Pause (Space)"
      >
        {isRunning ? "⏸" : "▶"}
      </button>

      {/* Secondary buttons — small row below */}
      <div style={{ display: "flex", gap: 4 }}>
        {!isStopped && (
          <button onClick={reset} style={subButtonStyle} title="Reset (R)">
            ↺
          </button>
        )}
        {!isStopped && (
          <button onClick={skip} style={subButtonStyle} title="Skip (S)">
            ⏭
          </button>
        )}
        <button
          onClick={toggleMute}
          style={{
            ...subButtonStyle,
            opacity: muted ? 0.5 : 1,
          }}
          title="Mute (M)"
        >
          {muted ? "🔇" : "🔔"}
        </button>
        <button
          onClick={toggleSettings}
          style={subButtonStyle}
          title="Settings (⌘,)"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}

const baseStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.15)",
  border: "none",
  borderRadius: "50%",
  color: "white",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  pointerEvents: "auto",
  backdropFilter: "blur(4px)",
};

const mainButtonStyle: React.CSSProperties = {
  ...baseStyle,
  width: 48,
  height: 48,
  fontSize: 22,
};

const subButtonStyle: React.CSSProperties = {
  ...baseStyle,
  width: 26,
  height: 26,
  fontSize: 12,
};
