import type { Lead } from "@/lib/types";

export const TEMPLATE_CONFIG_VERSION = "1.1.0";

type Primitive = string | number | boolean | null;
type JsonValue = Primitive | JsonValue[] | { [key: string]: JsonValue };
type GeocodeResult = {
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  address_components?: Array<{
    long_name?: string;
    short_name?: string;
    types?: string[];
  }>;
};

type GeocodeApiResponse = {
  status?: string;
  results?: GeocodeResult[];
};

export type TemplateConfig = {
  templateVersion: string;
  leadId: string;
  business: {
    name: string;
    city: string;
    category: string;
    websiteUrl: string;
  };
  geo: {
    primaryLocation: string;
    serviceAreas: string[];
  };
  branding: {
    logoUrl: string;
    heroImageUrl: string;
    featureImageUrl: string;
    galleryImages: string[];
    primaryColor: string;
    secondaryColor: string;
  };
  content: {
    hero: {
      headline: string;
      subheadline: string;
      ctaLabel: string;
    };
    contact: {
      phone: string;
      email: string;
      address: string;
      hours: string;
      formCta: string;
    };
    serviceBlocks: Array<{
      title: string;
      description: string;
    }>;
  };
  links: {
    googleBusinessProfile: string;
    googleDriveFolderUrl: string;
    socials: Array<{
      label: string;
      url: string;
    }>;
  };
  research: {
    summary: string;
  };
};

type TemplateConfigOverrides = Partial<TemplateConfig> & {
  [key: string]: JsonValue;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sanitizeServiceBlocks(value: unknown): TemplateConfig["content"]["serviceBlocks"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      title: asString((item as { title?: unknown })?.title),
      description: asString((item as { description?: unknown })?.description),
    }))
    .filter((item) => item.title || item.description)
    .slice(0, 8);
}

function mapSocialLinks(rawLinks: string[] | undefined): TemplateConfig["links"]["socials"] {
  if (!Array.isArray(rawLinks)) return [];

  return rawLinks
    .map((url) => {
      const normalizedUrl = asString(url).trim();
      if (!normalizedUrl) return null;

      const lower = normalizedUrl.toLowerCase();
      const label = lower.includes("facebook")
        ? "facebook"
        : lower.includes("instagram")
          ? "instagram"
          : lower.includes("x.com") || lower.includes("twitter")
            ? "x"
            : lower.includes("linkedin")
              ? "linkedin"
              : lower.includes("youtube")
                ? "youtube"
                : "social";

      return { label, url: normalizedUrl };
    })
    .filter((item): item is { label: string; url: string } => Boolean(item));
}

function toPartialObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const SERVICE_AREA_LOOKUP_TIMEOUT_MS = 7000;
const SERVICE_AREA_MAX_RESULTS = 8;
const SERVICE_AREA_BEARINGS = [0, 60, 120, 180, 240, 300];
const SERVICE_AREA_RINGS_KM = [18, 35, 55];

function fallbackServiceAreas(city: string): string[] {
  const normalizedCity = city.trim();
  return normalizedCity ? [normalizedCity] : [];
}

function normalizeAreaKey(value: string): string {
  return value
    .toLowerCase()
    .split(",")[0]
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeAreas(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizeAreaKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(trimmed);
  }

  return deduped;
}

function getAddressComponentName(
  components: Array<{ long_name?: string; short_name?: string; types?: string[] }> | undefined,
  targetTypes: string[],
): string {
  if (!Array.isArray(components)) return "";

  for (const component of components) {
    if (!component?.types?.some((type) => targetTypes.includes(type))) continue;
    const value = component.long_name?.trim() || component.short_name?.trim();
    if (value) return value;
  }

  return "";
}

async function fetchGeocodeResult(url: string): Promise<GeocodeResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERVICE_AREA_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as GeocodeApiResponse;
    if (payload.status !== "OK") return null;
    return payload.results?.[0] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function destinationPoint(lat: number, lng: number, distanceKm: number, bearingDegrees: number) {
  const earthRadiusKm = 6371;
  const angularDistance = distanceKm / earthRadiusKm;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const latitude = (lat * Math.PI) / 180;
  const longitude = (lng * Math.PI) / 180;

  const nextLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
  );

  const nextLongitude =
    longitude +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude),
    );

  return {
    lat: (nextLatitude * 180) / Math.PI,
    lng: ((nextLongitude * 180) / Math.PI + 540) % 360 - 180,
  };
}

async function resolveNearbyServiceAreas(city: string): Promise<string[]> {
  const normalizedCity = city.trim();
  if (!normalizedCity) return [];

  const mapsApiKey = process.env.MAPS_API_KEY?.trim();
  if (!mapsApiKey) return fallbackServiceAreas(normalizedCity);

  const originResult = await fetchGeocodeResult(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(normalizedCity)}&key=${mapsApiKey}`,
  );

  const originLocation = originResult?.geometry?.location;
  if (typeof originLocation?.lat !== "number" || typeof originLocation?.lng !== "number") {
    return fallbackServiceAreas(normalizedCity);
  }

  const originLocality =
    getAddressComponentName(originResult?.address_components, ["locality", "postal_town"]) || normalizedCity;

  const blockedKeys = new Set<string>([normalizeAreaKey(normalizedCity), normalizeAreaKey(originLocality)]);
  const nearbyAreas: string[] = [];

  for (const radiusKm of SERVICE_AREA_RINGS_KM) {
    for (const bearing of SERVICE_AREA_BEARINGS) {
      const point = destinationPoint(originLocation.lat, originLocation.lng, radiusKm, bearing);
      const nearbyResult = await fetchGeocodeResult(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${point.lat},${point.lng}&result_type=locality|postal_town&key=${mapsApiKey}`,
      );

      const nearbyLocality = getAddressComponentName(nearbyResult?.address_components, ["locality", "postal_town"]);
      const localityKey = normalizeAreaKey(nearbyLocality);
      if (!nearbyLocality || !localityKey || blockedKeys.has(localityKey)) continue;

      blockedKeys.add(localityKey);
      nearbyAreas.push(nearbyLocality);

      if (nearbyAreas.length >= SERVICE_AREA_MAX_RESULTS - 1) {
        return [normalizedCity, ...nearbyAreas].slice(0, SERVICE_AREA_MAX_RESULTS);
      }
    }
  }

  return dedupeAreas([normalizedCity, ...nearbyAreas]).slice(0, SERVICE_AREA_MAX_RESULTS);
}

function firstNonEmptyString(values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export async function buildTemplateConfig(lead: Lead, overrides: unknown): Promise<TemplateConfig> {
  const safeOverrides = toPartialObject(overrides) as TemplateConfigOverrides;
  const enrichmentBranding = lead.enrichment?.structured;
  const [primaryEnrichmentColor = "", secondaryEnrichmentColor = ""] = enrichmentBranding?.brandColors ?? [];
  const geoOverrides = toPartialObject(safeOverrides.geo);
  const requestedPrimaryLocation = asString(geoOverrides.primaryLocation) || lead.city;
  const serviceAreasOverride = Array.isArray(geoOverrides.serviceAreas)
    ? (geoOverrides.serviceAreas as unknown[])
        .map((entry) => asString(entry).trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const defaultServiceAreas =
    serviceAreasOverride.length > 0 ? serviceAreasOverride : await resolveNearbyServiceAreas(requestedPrimaryLocation);

  const defaultConfig: TemplateConfig = {
    templateVersion: TEMPLATE_CONFIG_VERSION,
    leadId: lead.id,
    business: {
      name: lead.businessName,
      city: lead.city,
      category: lead.businessType,
      websiteUrl: lead.websiteUrl ?? "",
    },
    geo: {
      primaryLocation: requestedPrimaryLocation,
      serviceAreas: defaultServiceAreas,
    },
    branding: {
      logoUrl: enrichmentBranding?.logoUrl?.trim() || "",
      heroImageUrl: "",
      featureImageUrl: "",
      galleryImages: [],
      primaryColor: firstNonEmptyString([primaryEnrichmentColor, "#0f172a"]),
      secondaryColor: firstNonEmptyString([secondaryEnrichmentColor, primaryEnrichmentColor, "#2563eb"]),
    },
    content: {
      hero: {
        headline: `${lead.businessName} in ${lead.city}`,
        subheadline: `Trusted ${lead.businessType.toLowerCase()} specialists serving ${lead.city} and nearby areas.`,
        ctaLabel: "Get Your Free Estimate",
      },
      contact: {
        phone: lead.phone ?? "",
        email: lead.email ?? "",
        address: "",
        hours: "",
        formCta: "Request Service",
      },
      serviceBlocks: [],
    },
    links: {
      googleBusinessProfile: "",
      googleDriveFolderUrl: "",
      socials: mapSocialLinks(lead.socialLinks),
    },
    research: {
      summary: lead.aiResearchSummary ?? "",
    },
  };

  const heroOverrides = toPartialObject(safeOverrides.content).hero;
  const contactOverrides = toPartialObject(safeOverrides.content).contact;
  const businessOverrides = toPartialObject(safeOverrides.business);
  const brandingOverrides = toPartialObject(safeOverrides.branding);
  const linksOverrides = toPartialObject(safeOverrides.links);
  const primaryLocation = asString(geoOverrides.primaryLocation) || defaultConfig.business.city;

  return {
    ...defaultConfig,
    templateVersion: asString(safeOverrides.templateVersion) || TEMPLATE_CONFIG_VERSION,
    business: {
      ...defaultConfig.business,
      name: asString(businessOverrides.name) || defaultConfig.business.name,
      city: asString(businessOverrides.city) || defaultConfig.business.city,
      category: asString(businessOverrides.category) || defaultConfig.business.category,
      websiteUrl: asString(businessOverrides.websiteUrl) || defaultConfig.business.websiteUrl,
    },
    geo: {
      primaryLocation,
      serviceAreas: serviceAreasOverride.length ? serviceAreasOverride : defaultServiceAreas,
    },
    branding: {
      ...defaultConfig.branding,
      logoUrl: asString(brandingOverrides.logoUrl) || defaultConfig.branding.logoUrl,
      heroImageUrl: asString(brandingOverrides.heroImageUrl) || defaultConfig.branding.heroImageUrl,
      featureImageUrl:
        asString(brandingOverrides.featureImageUrl) ||
        asString(brandingOverrides.heroImageUrl) ||
        defaultConfig.branding.featureImageUrl,
      galleryImages: Array.isArray(brandingOverrides.galleryImages)
        ? (brandingOverrides.galleryImages as unknown[]).map((entry) => asString(entry).trim()).slice(0, 12)
        : defaultConfig.branding.galleryImages,
      primaryColor: asString(brandingOverrides.primaryColor) || defaultConfig.branding.primaryColor,
      secondaryColor: asString(brandingOverrides.secondaryColor) || defaultConfig.branding.secondaryColor,
    },
    content: {
      ...defaultConfig.content,
      hero: {
        ...defaultConfig.content.hero,
        headline: asString(toPartialObject(heroOverrides).headline) || defaultConfig.content.hero.headline,
        subheadline: asString(toPartialObject(heroOverrides).subheadline) || defaultConfig.content.hero.subheadline,
        ctaLabel: asString(toPartialObject(heroOverrides).ctaLabel) || defaultConfig.content.hero.ctaLabel,
      },
      contact: {
        ...defaultConfig.content.contact,
        phone: asString(toPartialObject(contactOverrides).phone) || defaultConfig.content.contact.phone,
        email: asString(toPartialObject(contactOverrides).email) || defaultConfig.content.contact.email,
        address: asString(toPartialObject(contactOverrides).address) || defaultConfig.content.contact.address,
        hours: asString(toPartialObject(contactOverrides).hours) || defaultConfig.content.contact.hours,
        formCta: asString(toPartialObject(contactOverrides).formCta) || defaultConfig.content.contact.formCta,
      },
      serviceBlocks: sanitizeServiceBlocks(toPartialObject(safeOverrides.content).serviceBlocks),
    },
    links: {
      googleBusinessProfile: asString(linksOverrides.googleBusinessProfile) || defaultConfig.links.googleBusinessProfile,
      googleDriveFolderUrl: asString(linksOverrides.googleDriveFolderUrl) || defaultConfig.links.googleDriveFolderUrl,
      socials: Array.isArray(linksOverrides.socials)
        ? (linksOverrides.socials as Array<{ label?: unknown; url?: unknown }>)
            .map((item) => ({ label: asString(item.label), url: asString(item.url) }))
            .filter((item) => item.url)
        : defaultConfig.links.socials,
    },
    research: {
      summary: asString(toPartialObject(safeOverrides.research).summary) || defaultConfig.research.summary,
    },
  };
}
