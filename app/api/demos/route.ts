import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { listRepDemos } from "@/lib/demos-store";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await listRepDemos(user.id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch demos." },
      { status: 500 },
    );
  }
}
