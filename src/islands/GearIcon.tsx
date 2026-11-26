/**
 * The settings gear: an outline only (stroke in currentColor, no fill), eight teeth round a hub. A plain interface
 * icon, drawn here once so the Frame's corner button and any other settings button show the same gear. Its size and
 * stroke weight come from the CSS class the caller passes (gameframe.css, gameheader.css), never from the markup.
 */
export default function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path d="M10.27 4.80 L10.87 2.47 L13.13 2.47 L13.73 4.80 L15.87 5.69 L17.94 4.46 L19.54 6.06 L18.31 8.13 L19.20 10.27 L21.53 10.87 L21.53 13.13 L19.20 13.73 L18.31 15.87 L19.54 17.94 L17.94 19.54 L15.87 18.31 L13.73 19.20 L13.13 21.53 L10.87 21.53 L10.27 19.20 L8.13 18.31 L6.06 19.54 L4.46 17.94 L5.69 15.87 L4.80 13.73 L2.47 13.13 L2.47 10.87 L4.80 10.27 L5.69 8.13 L4.46 6.06 L6.06 4.46 L8.13 5.69 Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
