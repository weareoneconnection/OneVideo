import { NextResponse } from "next/server";
import { getWorkerHealth } from "@/lib/worker-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    workerHealth: await getWorkerHealth()
  });
}
