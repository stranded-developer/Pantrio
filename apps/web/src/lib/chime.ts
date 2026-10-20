/**
 * A short two-tone beep, generated rather than loaded so there is no audio
 * file to cache or fail to fetch.
 *
 * iOS Safari keeps audio muted until the page has been tapped at least once,
 * so `unlockChime()` must be called from a tap handler before the first
 * `playChime()` can be heard. Until then playChime() is silently a no-op.
 */
let context: AudioContext | null = null;

export function unlockChime(): boolean {
  try {
    context ??= new AudioContext();
    void context.resume();
    return true;
  } catch {
    return false;
  }
}

export function playChime() {
  if (!context || context.state !== "running") return;

  const start = context.currentTime;

  for (const [offset, frequency] of [
    [0, 880],
    [0.18, 1320],
  ]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.4, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.17);
  }
}
