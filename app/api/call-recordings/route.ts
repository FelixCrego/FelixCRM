export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getPlayableRecording, requireAuthorizedCallAnalytics } from "./shared";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthorizedCallAnalytics(request);
    if ("error" in auth) return auth.error;

    const playable = await getPlayableRecording(auth.record);
    if (!playable?.url) {
      return NextResponse.json(
        { error: "No playable recording URL is available for this call." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      url: playable.url,
      expiresAt: playable.expiresAt,
      source: playable.source,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load recording." },
      { status: 500 },
    );
  }
}
