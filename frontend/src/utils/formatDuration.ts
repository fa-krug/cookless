export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  // Over 99 minutes → show hours
  if (totalSeconds > 99 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${mins}min`;
  }

  // 1–99 minutes → show mm:ss
  const secs = remainingSeconds.toString().padStart(2, "0");
  return `${totalMinutes}:${secs}`;
}
