/** A second way to open the one footer report panel. Before it hydrates the link reaches its email fallback. */
export default function GameFlag({ name }: { name: string }) {
  return <a href="#footer-flag" data-game-flag className="corner-button corner-button-quiet shrink-0"
    aria-label={`flag or comment on ${name}`}>
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" focusable="false">
      <path d="M5 21V4M5 4h12l-3 4.5 3 4.5H5" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </a>;
}
