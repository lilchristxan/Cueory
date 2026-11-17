/**
 * A short, quiet tone when a puzzle is solved (crossword, Task 721). Same tone as sudoku's. Made in the browser with
 * the Web Audio API: no sound file is loaded. Sound is optional, so any failure is silent.
 */
export function playSolvedTone(): void {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain); gain.connect(context.destination); oscillator.frequency.value = 523;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
    oscillator.start(); oscillator.stop(context.currentTime + 0.35);
    oscillator.addEventListener('ended', () => void context.close(), { once: true });
  } catch { /* Sound is optional. */ }
}
