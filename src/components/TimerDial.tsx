import { describeArc } from "../lib/arc";
import { formatTime, formatFocusTime } from "../lib/format";
import { useTimerStore } from "../stores/timerStore";
import type { Phase } from "../types/timer";
import { useEffect, useState, useRef, useCallback } from "react";

const PHASE_COLORS: Record<Phase, string> = {
  idle: "#6b7280",
  work: "#ef4444",
  break: "#22c55e",
  longBreak: "#3b82f6",
};

const PHASE_BG_COLORS: Record<Phase, string> = {
  idle: "#1f2937",
  work: "#1c1917",
  break: "#052e16",
  longBreak: "#0c1a3d",
};

const VIEW_SIZE = 200;
const CENTER = VIEW_SIZE / 2;
const RADIUS = 85;
const RING_WIDTH = 8;

export function TimerDial() {
  const { state, windowWidth } = useTimerStore();
  const { phase, status, totalDurationSec, remainingSec } = state;
  const [currentTime, setCurrentTime] = useState(formatCurrentTime());
  const [smoothAngle, setSmoothAngle] = useState(360);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(formatCurrentTime());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Target angle from Rust state
  const targetAngle = totalDurationSec > 0 ? (remainingSec / totalDurationSec) * 360 : 360;

  // Smooth animation loop — interpolate toward target while running
  const animate = useCallback(
    (timestamp: number) => {
      if (!lastFrameRef.current) {
        lastFrameRef.current = timestamp;
      }
      const dt = (timestamp - lastFrameRef.current) / 1000;
      lastFrameRef.current = timestamp;

      setSmoothAngle((prev) => {
        if (status !== "running") return targetAngle;

        // Decrease at the rate of one full rotation per totalDurationSec
        const rate = totalDurationSec > 0 ? 360 / totalDurationSec : 0;
        const next = prev - rate * dt;

        // Snap if we overshot or drifted too far from target
        if (Math.abs(next - targetAngle) > 10) return targetAngle;
        return Math.max(0, next);
      });

      rafRef.current = requestAnimationFrame(animate);
    },
    [status, targetAngle, totalDurationSec],
  );

  useEffect(() => {
    if (status === "running") {
      lastFrameRef.current = 0;
      rafRef.current = requestAnimationFrame(animate);
    } else {
      setSmoothAngle(targetAngle);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, animate, targetAngle]);

  const angle = smoothAngle;
  const isCompact = windowWidth < 96;

  const sectorColor = PHASE_COLORS[phase];
  const bgColor = PHASE_BG_COLORS[phase];

  const sectorPath =
    angle >= 360
      ? `M ${CENTER} ${CENTER} m -${RADIUS} 0 a ${RADIUS} ${RADIUS} 0 1 0 ${RADIUS * 2} 0 a ${RADIUS} ${RADIUS} 0 1 0 -${RADIUS * 2} 0 Z`
      : angle <= 0
        ? ""
        : describeArc(CENTER, CENTER, RADIUS, 0, angle);

  return (
    <svg
      viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
      style={{ width: "100%", height: "100%", pointerEvents: "none" }}
    >
      {/* Background circle — semi-transparent */}
      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={bgColor} opacity={0.55} />

      {/* Timer sector — semi-transparent */}
      {angle > 0 && (
        <path d={sectorPath} fill={sectorColor} opacity={0.5} />
      )}

      {/* Outer ring */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke={sectorColor}
        strokeWidth={RING_WIDTH}
        opacity={0.25}
      />

      {/* Center text group - hidden on hover via CSS, hidden when compact */}
      {!isCompact && (
        <g className="timer-center-text" style={{ transition: "opacity 0.2s" }}>
          <text
            x={CENTER}
            y={CENTER - 12}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize="32"
            fontWeight="bold"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {formatTime(remainingSec)}
          </text>
          <text
            x={CENTER}
            y={CENTER + 16}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize="12"
            opacity={0.7}
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {phaseLabel(phase)}
          </text>
          {/* Session info inside the circle */}
          <text
            x={CENTER}
            y={CENTER + 55}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="white"
            fontSize="10"
            opacity={0.5}
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {state.currentSessionIndex}/{state.sessionsGoal} · {formatFocusTime(state.totalFocusTimeSec)} · {currentTime}
          </text>
        </g>
      )}
    </svg>
  );
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "idle":
      return "Ready";
    case "work":
      return "Focus";
    case "break":
      return "Break";
    case "longBreak":
      return "Long Break";
  }
}

function formatCurrentTime(): string {
  const now = new Date();
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
}
