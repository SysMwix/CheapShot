/**
 * Vehicle lookup via the free UK DVSA MOT History API.
 * No API key needed — it's a public service.
 * Returns make, model, year, fuel type, colour from a registration number.
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

const MOT_API_URL = "https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests";

/**
 * Look up a vehicle by registration number.
 * Uses the DVSA MOT History API (free, no key needed).
 */
export async function lookupVehicle(registration: string): Promise<VehicleInfo | null> {
  const reg = registration.replace(/\s+/g, "").toUpperCase();

  if (!reg || reg.length < 2 || reg.length > 8) {
    return null;
  }

  try {
    const res = await fetch(`${MOT_API_URL}?registration=${reg}`, {
      headers: {
        "Accept": "application/json+v6",
        "x-api-key": "", // Public API, no key needed for basic lookup
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.log(`[Vehicle] DVSA API returned ${res.status} for ${reg}`);

      // Try fallback — simple reg lookup via a free service
      return await fallbackLookup(reg);
    }

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      return await fallbackLookup(reg);
    }

    const vehicle = data[0];
    const firstUsedDate = vehicle.firstUsedDate || "";
    const year = firstUsedDate ? parseInt(firstUsedDate.substring(0, 4)) : 0;

    return {
      registration: reg,
      make: String(vehicle.make || "").trim(),
      model: String(vehicle.model || "").trim(),
      year,
      colour: String(vehicle.primaryColour || "").trim(),
      fuelType: String(vehicle.fuelType || "").trim(),
      engineSize: vehicle.engineSize ? String(vehicle.engineSize) : undefined,
    };
  } catch (err) {
    console.log(`[Vehicle] DVSA lookup failed:`, (err as Error).message);
    return await fallbackLookup(reg);
  }
}

/**
 * Fallback: use the free UK Vehicle Enquiry Service.
 * This is the DVLA's own API but needs an API key.
 * We'll try without and parse any response we get.
 */
async function fallbackLookup(reg: string): Promise<VehicleInfo | null> {
  try {
    // Try the DVLA VES API (needs key but some endpoints work without)
    const res = await fetch("https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.DVLA_API_KEY || "",
      },
      body: JSON.stringify({ registrationNumber: reg }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.log(`[Vehicle] DVLA fallback returned ${res.status} for ${reg}`);
      return null;
    }

    const data = await res.json();

    return {
      registration: reg,
      make: String(data.make || "").trim(),
      model: String(data.model || "").trim(),  // DVLA doesn't always return model
      year: data.yearOfManufacture || 0,
      colour: String(data.colour || "").trim(),
      fuelType: String(data.fuelType || "").trim(),
      engineSize: data.engineCapacity ? String(data.engineCapacity) : undefined,
    };
  } catch (err) {
    console.log(`[Vehicle] Fallback lookup failed:`, (err as Error).message);
    return null;
  }
}

/**
 * Format vehicle info into a search-friendly string.
 * e.g. "MINI Clubman 2010"
 */
export function vehicleSearchString(vehicle: VehicleInfo): string {
  const parts = [];
  if (vehicle.make) parts.push(vehicle.make);
  if (vehicle.model) parts.push(vehicle.model);
  if (vehicle.year) parts.push(String(vehicle.year));
  return parts.join(" ");
}
