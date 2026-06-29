"use client";

interface Props {
  clientSlug: string;
  path: string;
}

const fileApiUrl = (slug: string, p: string) =>
  `/api/brain/file?slug=${encodeURIComponent(slug)}&path=${encodeURIComponent(p)}`;

/** Native HTML5 audio player. The browser handles seeking, volume, loop. */
export function AudioView({ clientSlug, path }: Props) {
  const name = path.split("/").pop() ?? path;
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 12,
        padding: 16,
        background: "var(--panel-bg)",
        color: "var(--fg)",
        fontFamily: "var(--font-ui)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--fg-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
        }}
      >
        audio · {name}
      </div>
      <audio
        controls
        preload="metadata"
        src={fileApiUrl(clientSlug, path)}
        style={{ width: "100%", maxWidth: 520 }}
      >
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}
