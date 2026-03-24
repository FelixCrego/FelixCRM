import { NextResponse } from "next/server";

export async function POST(request: Request) {
  void request;
  return NextResponse.json(
    {
      error: "New accounts require Felix's approval. Please contact Felix to be invited.",
    },
    { status: 403 },
  );
}
