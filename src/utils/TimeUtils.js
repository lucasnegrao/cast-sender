/**
 * Time utility functions for media playback
 */

/**
 * Format seconds into a human-readable time string (HH:MM:SS)
 */
export function formatTime(seconds) {
  if (seconds === undefined || seconds === null || isNaN(seconds)) {
    return null;
  }

  let isNegative = false;
  if (seconds < 0) {
    isNegative = true;
    seconds = Math.abs(seconds);
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds - (hours * 3600)) / 60);
  const secs = Math.floor(seconds - (hours * 3600) - (minutes * 60));

  const formattedHours = hours < 10 ? '0' + hours : hours;
  const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
  const formattedSeconds = secs < 10 ? '0' + secs : secs;

  return (isNegative ? '-' : '') + formattedHours + ':' + formattedMinutes + ':' + formattedSeconds;
}

/**
 * Format a timestamp (seconds) into a clock time string
 */
export function formatClockTime(seconds) {
  if (!seconds) return "0:00:00";

  const date = new Date(seconds * 1000);
  let hours = date.getHours();
  let minutes = date.getMinutes();
  let secs = date.getSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  hours = hours % 12;
  hours = hours ? hours : 12; // Hour '0' should be '12'
  minutes = minutes < 10 ? '0' + minutes : minutes;
  secs = secs < 10 ? '0' + secs : secs;
  
  return hours + ':' + minutes + ':' + secs + ' ' + ampm;
}
