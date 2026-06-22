let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

// Run `render` only once the AudioContext is actually running.
//
// The context starts suspended (autoplay policy) and WKWebView re-suspends it
// whenever the app loses focus. resume() is async, so scheduling a sound while
// the context is still suspended drops the note silently. That is why a mouse
// click which refocuses the floating window produced no sound (context was
// suspended at click time, resume hadn't settled), while keyboard use — where
// the window is already focused and the context is running — played fine.
// Waiting for resume() to settle makes both input paths sound consistently.
function playWhenReady(render: (ctx: AudioContext, startAt: number) => void): void {
  const ctx = getAudioContext();
  if (ctx.state === "running") {
    render(ctx, ctx.currentTime);
    return;
  }
  void ctx.resume().then(() => render(ctx, ctx.currentTime));
}

// Unlock the audio context from a real user gesture. Call this on the first
// pointer/key interaction so later non-gesture sounds are allowed to play.
export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
}

// Short tick sound — like a clock tick
export function playTick(): void {
  playWhenReady((ctx, now) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  });
}

// Play a single bell-like strike at `freq` starting at `startTime`.
// A fundamental plus a few inharmonic partials with a fast attack and long
// exponential decay gives a metallic, chime-like ring.
function playBellNote(
  ctx: AudioContext,
  startTime: number,
  freq: number,
  peak: number,
  decay: number,
): void {
  const partials = [
    { mult: 1, level: 1 },
    { mult: 2.01, level: 0.45 },
    { mult: 2.99, level: 0.2 },
  ];

  for (const { mult, level } of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * mult, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peak * level, startTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + decay);
  }
}

// Start sound — bright ascending bell chime, richer than a single beep so the
// start of a timer or break feels distinct and satisfying.
export function playStart(): void {
  playWhenReady((ctx, now) => {
    playBellNote(ctx, now, 659.25, 0.3, 0.6); // E5
    playBellNote(ctx, now + 0.13, 987.77, 0.3, 0.85); // B5
  });
}

// Pause sound — short descending tone
export function playPause(): void {
  playWhenReady((ctx, now) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(330, now + 0.12);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  });
}

// Bell sound — pleasant chime for session completion
export function playBell(): void {
  playWhenReady((ctx, now) => {
    // Two layered tones for a richer bell
    const frequencies = [880, 1320];

    for (const freq of frequencies) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.setValueAtTime(0.4, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.2);
    }
  });
}
