import { NextResponse } from "next/server";
import { listScripts } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ scripts: await listScripts() });
}
