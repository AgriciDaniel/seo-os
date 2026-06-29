/**
 * Server-Sent Events stream for a single job.
 *
 * Emits each ProgressEvent as a `data: <json>\n\n` line. Closes the stream
 * when a `done` event arrives or the client disconnects.
 *
 * Client isolation: requires `?slug=<client>` and verifies the job belongs
 * to that client before opening the stream. Without the guard, a caller
 * who guessed another client's job id could subscribe to its progress.
 */
import { subscribe, type ProgressEvent } from "@/lib/orchestrator/events";
import { getJobForClient } from "@/lib/orchestrator/ownership";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return new Response(
      JSON.stringify({ ok: false, error: "slug query param is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Resolve + ownership-check in one shot. Both "no such job" and "job
  // belongs to a different client" return 404 — never leak "exists but
  // not yours."
  const job = getJobForClient(id, slug);
  if (!job) {
    return new Response(
      JSON.stringify({ ok: false, error: "job not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: ProgressEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          /* controller already closed — caller disconnected */
        }
      };

      // SSE keep-alive. Comment lines (starting with `:`) are ignored by
      // EventSource but keep the TCP connection warm, so proxies don't
      // half-close after their idle timeout. 25s sits comfortably under
      // typical 30-60s proxy defaults.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);

      const close = () => {
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // initial state snapshot
      send({
        jobId: id,
        ts: new Date().toISOString(),
        kind: "log",
        message: `status: ${job.status}`,
        data: job,
      });

      if (isTerminal(job.status)) {
        send({
          jobId: id,
          ts: new Date().toISOString(),
          kind: "done",
          message:
            job.status === "failed"
              ? `failed: ${job.message ?? "failed"}`
              : job.status === "cancelled"
                ? "cancelled"
                : job.message ?? "succeeded",
          data: job,
        });
        close();
        return;
      }

      const unsubscribe = subscribe(slug, id, (event) => {
        send(event);
        if (event.kind === "done") {
          unsubscribe();
          close();
        }
      });

      req.signal.addEventListener("abort", () => {
        unsubscribe();
        close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function isTerminal(status: string): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}
