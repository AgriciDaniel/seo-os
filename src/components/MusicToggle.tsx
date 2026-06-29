"use client";

/**
 * MusicToggle — bottom-right ambient-music control button.
 *
 * Presentational only: parent owns the actual `<audio>` element + playing
 * state, so the same audio can be toggled from multiple entry points (e.g.
 * the orchestrator's speaker tower).
 *
 * Design language matches the camera-control pill + hint-pill: thin graphite
 * border, abyss/85 backdrop blur, gold on hover. Icon changes between a
 * speaker-with-waves (playing, gold) and a speaker-muted (stopped, ash).
 */

interface Props {
  playing: boolean;
  onToggle: () => void;
}

export default function MusicToggle({ playing, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={playing ? "Mute background music" : "Play background music"}
      aria-label={playing ? "Mute background music" : "Play background music"}
      aria-pressed={playing}
      className={
        "pointer-events-auto inline-flex h-7.5 w-7.5 items-center justify-center border border-graphite bg-abyss/85 backdrop-blur transition-colors hover:bg-graphite/40 " +
        (playing ? "text-gold" : "text-ash hover:text-gold")
      }
    >
      {playing ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* icons — inline SVG, currentColor so the button's text color drives them    */
/* -------------------------------------------------------------------------- */

function SpeakerOnIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  );
}
