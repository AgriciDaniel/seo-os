/**
 * Server-Sent Events stream for a client's job-lifecycle bus.
 *
 * Emits typed job lifecycle events (`job_queued`, `job_started`, terminal
 * job_* events) with payload `{ specialist, jobId, ts }`. Consumed by the 3D
 * office's `useActiveAgents()` + `useJobPulses()` hooks to drive agent
 * spawning visibility, hologram activity, and thread pulse animations.
 */
import { subscribeClient, type ClientEvent } from "@/lib/orchestrator/events";
import { getClient } from "@/lib/brain/index-db";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!getClient(slug)) {
    return new Response(JSON.stringify({ ok: false, error: "client not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: ClientEvent) => {
        // SSE typed-event format: `event: <kind>\ndata: <json>\n\n`
        controller.enqueue(
          encoder.encode(
            `event: ${event.kind}\n` +
              `data: ${JSON.stringify({ specialist: event.specialist, jobId: event.jobId, ts: event.ts })}\n\n`,
          ),
        );
      };

      // Initial heartbeat — opens the stream and proves the connection.
      controller.enqueue(encoder.encode(`: connected\n\n`));

      const unsubscribe = subscribeClient(slug, send);

      // Keep-alive ping every 25s (well under most reverse-proxy timeouts).
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* stream may have been closed by abort */
        }
      }, 25000);

      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
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
