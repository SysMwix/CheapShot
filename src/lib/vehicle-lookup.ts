/**
 * Vehicle lookup from UK registration number.
 *
 * Uses the DVLA Vehicle Enquiry Service API (free, requires API key).
 * Get your free key at: https://register-for-ves.driver-vehicle-licensing.api.gov.uk/
 *
 * If no API key is set, allows manual entry instead.
 */

export interface VehicleInfo {
  registration: string;
  make: string;
  model: string;
  year: number;
  colour: string;
  fuelType: string;
  engineSize?: string;
}

/**
 * Look up a vehicle by registration number using the DVLA VES API.
 */
export async function lookupVehicle(registration: string): Promise<VehicleInfo | null> {
  const reg = registration.replace(/\s+/g, "").toUpperCase();
  if (!reg || reg.length < 2 || reg.length > 8) return null;

  const apiKey = process.env.DVLA_API_KEY;

  if (!apiKey) {
    console.log("[Vehicle] No DVLA_API_KEY set — manual entry only");
    return null;
  }

  try {
    const res = await fetch("https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ registrationNumber: reg }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.log(`[Vehicle] DVLA API returned ${res.status} for ${reg}`);
      return null;
    }

    const data = await res.json();

    return {
      registration: reg,
      make: String(data.make || "").trim(),
      model: String(data.model || "").trim(),
      year: data.yearOfManufacture || 0,
      colour: String(data.colour || "").trim(),
      fuelType: String(data.fuelType || "").trim(),
      engineSize: data.engineCapacity ? String(data.engineCapacity) : undefined,
    };
  } catch (err) {
    console.log(`[Vehicle] Lookup failed:`, (err as Error).message);
    return null;
  }
}

/**
 * Format vehicle info into a search-friendly string.
 */
export function vehicleSearchString(vehicle: VehicleInfo): string {
  const parts = [];
  if (vehicle.make) parts.push(vehicle.make);
  if (vehicle.model) parts.push(vehicle.model);
  if (vehicle.year) parts.push(String(vehicle.year));
  return parts.join(" ");
}
