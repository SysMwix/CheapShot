import { NextRequest, NextResponse } from "next/server";
import { lookupVehicle } from "@/lib/vehicle-lookup";

// GET /api/vehicle?reg=AB12CDE
export async function GET(request: NextRequest) {
  const reg = request.nextUrl.searchParams.get("reg");

  if (!reg) {
    return NextResponse.json({ error: "reg parameter required" }, { status: 400 });
  }

  if (!process.env.DVLA_API_KEY) {
    return NextResponse.json({ error: "No DVLA API key configured" }, { status: 503 });
  }

  const vehicle = await lookupVehicle(reg);

  if (!vehicle) {
    return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
  }

  return NextResponse.json(vehicle);
}
