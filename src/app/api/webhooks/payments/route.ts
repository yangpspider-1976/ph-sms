import { NextResponse } from "next/server";
import { ingestPaymentEvent } from "@/server/domain/payments";

/**
 * Payment provider callback.
 *
 * The raw body is verified before anything else, and the verified event is
 * stored before this returns. Credit is posted from here or from server-side
 * reconciliation — never from the customer's browser returning to a success
 * page, which proves nothing.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const outcome = await ingestPaymentEvent(rawBody, headers);

  if (outcome.status === "REJECTED") {
    return NextResponse.json({ accepted: false }, { status: 401 });
  }

  // Everything else is stored and settled as far as it can be. A 200 stops the
  // provider retrying an event we have already recorded.
  return NextResponse.json({ accepted: true, status: outcome.status }, { status: 200 });
}
