import { NextResponse } from "next/server";
import { ingestDeliveryEvent } from "@/server/jobs/delivery";

/**
 * Delivery receipt endpoint.
 *
 * The RAW body is read as text and passed to the adapter unchanged — parsing it
 * first would break signature verification, which is computed over the exact
 * bytes the provider sent.
 *
 * A verified event is stored before this returns, so a 200 always means "we
 * have it", never "we were about to write it".
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const outcome = await ingestDeliveryEvent(rawBody, headers);

  switch (outcome.status) {
    case "REJECTED":
      // Not authenticated: refuse it, and do not say what was wrong.
      return NextResponse.json({ accepted: false }, { status: 401 });

    case "QUARANTINED":
    case "CONFLICT":
      // Stored for an operator. 200 so the provider stops retrying a delivery
      // we have already recorded and simply cannot match yet.
      return NextResponse.json({ accepted: true, status: outcome.status }, { status: 200 });

    default:
      return NextResponse.json({ accepted: true, status: outcome.status }, { status: 200 });
  }
}

/** Providers often probe the URL before sending real callbacks. */
export function GET(): NextResponse {
  return NextResponse.json({ ok: true, endpoint: "sms-delivery-receipts" });
}
