/**
 * Cloudflare Email Service Worker
 *
 * Features:
 * - Email Receiving: Process incoming emails with custom logic
 * - Email Sending: Send emails via HTTP trigger using Email binding
 */

export interface Env {
  // Email binding for sending emails
  // This requires the sender to be configured in Cloudflare dashboard
  EMAIL: any;

  // Environment variables
  ALLOWED_SENDERS?: string;
  FORWARD_TO?: string;
}

/**
 * Process incoming emails
 * This handler is triggered when an email is received at your configured address
 */
export async function onEmail(message: EmailMessage | any, env: Env, ctx: ExecutionContext): Promise<void> {
  const from = message.from;
  const to = message.to;

  console.log(`Received email from: ${from}, to: ${to}`);

  // Get allowed senders from environment (comma-separated)
  const allowedSenders = env.ALLOWED_SENDERS?.split(",").map(s => s.trim()) || [];

  // Check if sender is allowed (if allowlist is configured)
  if (allowedSenders.length > 0 && !allowedSenders.includes(from)) {
    await message.setReject("Sender not in allowlist");
    return;
  }

  // Forward to configured destination
  if (env.FORWARD_TO) {
    console.log(`Forwarding email to: ${env.FORWARD_TO}`);
    await message.forward(env.FORWARD_TO);
  }

  // Optionally send auto-reply
  // Note: This uses the email binding which needs to be properly configured
  // await message.reply("Thank you for your email", { subject: "Auto-reply" });
}

/**
 * HTTP handler for sending emails and testing
 */
export default {
  async email(message: EmailMessage | any, env: Env, ctx: ExecutionContext): Promise<void> {
    // Handle incoming emails
    await onEmail(message, env, ctx);
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        status: "ok",
        service: "email-cf-svc"
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Send email endpoint (POST /send)
    if (url.pathname === "/send" && request.method === "POST") {
      try {
        const body = await request.json() as {
          to: string;
          from?: string;
          subject: string;
          html?: string;
          text?: string;
        };

        // Validate required fields
        if (!body.to || !body.subject) {
          return new Response(JSON.stringify({
            error: "Missing required fields: to, subject"
          }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Send email using the Email binding
        // Note: The sender must be verified in Cloudflare dashboard
        const fromAddress = body.from || "sender@your-domain.com";

        // Use env.EMAIL if available (requires unsafe.bindings in wrangler.toml)
        if (env.EMAIL) {
          await env.EMAIL.send({
            to: body.to,
            from: fromAddress,
            subject: body.subject,
            html: body.html,
            text: body.text
          });

          return new Response(JSON.stringify({
            success: true,
            message: "Email sent"
          }), {
            headers: { "Content-Type": "application/json" }
          });
        } else {
          return new Response(JSON.stringify({
            error: "Email binding not configured",
            note: "Configure EMAIL binding in wrangler.toml or dashboard"
          }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        }
      } catch (err) {
        return new Response(JSON.stringify({
          error: err instanceof Error ? err.message : "Unknown error"
        }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Test endpoint for email receiving
    if (url.pathname === "/test-email") {
      return new Response(JSON.stringify({
        message: "Email endpoint is active",
        setup: {
          receiving: "Configure email routing in Cloudflare dashboard",
          sending: "Use POST /send with {to, subject, html}"
        }
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // 404 for unknown routes
    return new Response(JSON.stringify({
      error: "Not found. Try: /health, /send, /test-email"
    }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
} satisfies ExportedHandler<Env>;