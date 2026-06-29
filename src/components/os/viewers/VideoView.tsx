"use client";

interface Props {
  clientSlug: string;
  path: string;
}

const fileApiUrl = (slug: string, p: string) =>
  `/api/brain/file?slug=${encodeURIComponent(slug)}&path=${encodeURIComponent(p)}`;

/** Native HTML5 video player. */
export function VideoView({ clientSlug, path }: Props) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--panel-bg)",
        padding: 12,
      }}
    >
      <video
        controls
        preload="metadata"
        src={fileApiUrl(clientSlug, path)}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          background: "black",
          objectFit: "contain",
        }}
      >
        Your browser does not support the video element.
      </video>
    </div>
  );
}
