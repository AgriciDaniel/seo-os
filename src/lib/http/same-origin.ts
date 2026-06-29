import "server-only";

/**
 * Local-first setup endpoints write files on the user's machine. Browser
 * same-origin checks keep a random website from form-posting to localhost.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function sameOriginWriteAllowed(req: Request): true | Response {
  if (!isSameOrigin(req)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "cross-origin writes are not allowed",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return true;
}

export const sameOriginSetupWriteAllowed = sameOriginWriteAllowed;
