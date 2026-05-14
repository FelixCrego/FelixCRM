import type { Lead } from "@/lib/types";

export const TEMPLATE_CONFIG_VERSION = "1.2.0";

export type ThemeVariant = "classic" | "modern";

type Primitive = string | number | boolean | null;
type JsonValue = Primitive | JsonValue[] | { [key: string]: JsonValue };

type AddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type PlaceSearchResult = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
};

type PlaceSearchResponse = {
  status?: string;
  results?: PlaceSearchResult[];
};

type PlaceDetailsResult = {
  name?: string;
  formatted_address?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  address_components?: AddressComponent[];
};

type PlaceDetailsResponse = {
  status?: string;
  result?: PlaceDetailsResult;
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
    themeVariant: ThemeVariant;
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

function normalizeThemeVariant(value: unknown): ThemeVariant {
  return asString(value).trim().toLowerCase() === "modern" ? "modern" : "classic";
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
const SERVICE_AREA_RADIUS_METERS = 60000;
const MAX_SERVICE_AREA_PLACE_RESULTS = 12;

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
  components: AddressComponent[] | undefined,
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

function getServiceAreaLocality(components: AddressComponent[] | undefined): string {
  const country = getAddressComponentName(components, ["country"]);
  if (country === "Puerto Rico") {
    return (
      getAddressComponentName(components, ["administrative_area_level_1"]) ||
      getAddressComponentName(components, ["locality", "postal_town"])
    );
  }

  return getAddressComponentName(components, ["locality", "postal_town"]);
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERVICE_AREA_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function toQueryParam(value: string): string {
  return encodeURIComponent(value.trim());
}

function haversineDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const startLat = toRadians(from.lat);
  const endLat = toRadians(to.lat);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function searchPlaces(params: {
  query: string;
  mapsApiKey: string;
  location?: { lat: number; lng: number };
  radiusMeters?: number;
}): Promise<PlaceSearchResult[]> {
  const query = params.query.trim();
  if (!query) return [];

  const searchParams = new URLSearchParams({
    query,
    key: params.mapsApiKey,
  });

  if (params.location && typeof params.radiusMeters === "number") {
    searchParams.set("location", `${params.location.lat},${params.location.lng}`);
    searchParams.set("radius", String(params.radiusMeters));
  }

  const payload = await fetchJsonWithTimeout<PlaceSearchResponse>(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${searchParams.toString()}`,
  );

  if (!payload || (payload.status !== "OK" && payload.status !== "ZERO_RESULTS")) return [];
  return payload.results ?? [];
}

async function fetchPlaceDetails(placeId: string, mapsApiKey: string): Promise<PlaceDetailsResult | null> {
  const payload = await fetchJsonWithTimeout<PlaceDetailsResponse>(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${toQueryParam(placeId)}&fields=name,formatted_address,address_component,geometry&key=${mapsApiKey}`,
  );

  if (!payload || payload.status !== "OK") return null;
  return payload.result ?? null;
}

async function resolveNearbyServiceAreas(input: {
  businessName: string;
  businessType: string;
  city: string;
}): Promise<{ primaryLocation: string; serviceAreas: string[] }> {
  const fallbackPrimaryLocation = input.city.trim();
  const fallback = {
    primaryLocation: fallbackPrimaryLocation,
    serviceAreas: fallbackServiceAreas(fallbackPrimaryLocation),
  };
  if (!fallbackPrimaryLocation) return fallback;

  const mapsApiKey = process.env.MAPS_API_KEY?.trim();
  if (!mapsApiKey) return fallback;

  const anchorQueries = Array.from(
    new Set(
      [`${input.businessName} ${input.city}`, input.businessName]
        .map((query) => query.trim())
        .filter(Boolean),
    ),
  );

  let anchorDetails: PlaceDetailsResult | null = null;

  for (const query of anchorQueries) {
    const results = await searchPlaces({ query, mapsApiKey });
    if (!results.length) continue;

    const matchedResult =
      results.find((result) => normalizeAreaKey(result.name ?? "") === normalizeAreaKey(input.businessName)) ?? results[0];

    if (!matchedResult?.place_id) continue;

    anchorDetails = await fetchPlaceDetails(matchedResult.place_id, mapsApiKey);
    if (anchorDetails) break;
  }

  const anchorLocation = anchorDetails?.geometry?.location;
  const anchorPrimaryLocation = getServiceAreaLocality(anchorDetails?.address_components) || fallbackPrimaryLocation;

  if (typeof anchorLocation?.lat !== "number" || typeof anchorLocation?.lng !== "number") {
    return {
      primaryLocation: anchorPrimaryLocation,
      serviceAreas: fallbackServiceAreas(anchorPrimaryLocation),
    };
  }

  const anchorCountry = getAddressComponentName(anchorDetails?.address_components, ["country"]);
  const nicheQuery = input.businessType.trim() || input.businessName.trim();
  const nearbyQueries = Array.from(
    new Set(
      [
        nicheQuery,
        `${nicheQuery} near ${anchorPrimaryLocation}`,
        anchorCountry ? `${nicheQuery} near ${anchorPrimaryLocation} ${anchorCountry}` : "",
      ]
        .map((query) => query.trim())
        .filter(Boolean),
    ),
  );

  const bestAreaByKey = new Map<string, { name: string; distanceKm: number }>();
  const seenPlaceIds = new Set<string>();

  for (const query of nearbyQueries) {
    const results = await searchPlaces({
      query,
      mapsApiKey,
      location: { lat: anchorLocation.lat, lng: anchorLocation.lng },
      radiusMeters: SERVICE_AREA_RADIUS_METERS,
    });

    for (const result of results.slice(0, MAX_SERVICE_AREA_PLACE_RESULTS)) {
      if (!result.place_id || seenPlaceIds.has(result.place_id)) continue;
      seenPlaceIds.add(result.place_id);

      const candidateLocation = result.geometry?.location;
      if (typeof candidateLocation?.lat !== "number" || typeof candidateLocation?.lng !== "number") continue;

      const distanceKm = haversineDistanceKm(
        { lat: anchorLocation.lat, lng: anchorLocation.lng },
        { lat: candidateLocation.lat, lng: candidateLocation.lng },
      );
      if (distanceKm > SERVICE_AREA_RADIUS_METERS / 1000) continue;

      const details = await fetchPlaceDetails(result.place_id, mapsApiKey);
      const locality = getServiceAreaLocality(details?.address_components);
      const localityKey = normalizeAreaKey(locality);
      if (!locality || !localityKey || localityKey === normalizeAreaKey(anchorPrimaryLocation)) continue;

      const candidateCountry = getAddressComponentName(details?.address_components, ["country"]);
      if (anchorCountry && candidateCountry && candidateCountry !== anchorCountry) continue;

      const existing = bestAreaByKey.get(localityKey);
      if (!existing || distanceKm < existing.distanceKm) {
        bestAreaByKey.set(localityKey, { name: locality, distanceKm });
      }
    }

    if (bestAreaByKey.size >= SERVICE_AREA_MAX_RESULTS - 1) break;
  }

  const nearbyAreas = [...bestAreaByKey.values()]
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .map((entry) => entry.name);

  return {
    primaryLocation: anchorPrimaryLocation,
    serviceAreas: dedupeAreas([anchorPrimaryLocation, ...nearbyAreas]).slice(0, SERVICE_AREA_MAX_RESULTS),
  };
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
  const businessOverrides = toPartialObject(safeOverrides.business);
  const geoOverrides = toPartialObject(safeOverrides.geo);
  const requestedBusinessName = asString(businessOverrides.name) || lead.businessName;
  const requestedBusinessCity = asString(businessOverrides.city) || lead.city;
  const requestedBusinessCategory = asString(businessOverrides.category) || lead.businessType;
  const requestedPrimaryLocation = asString(geoOverrides.primaryLocation) || requestedBusinessCity;
  const serviceAreasOverride = Array.isArray(geoOverrides.serviceAreas)
    ? (geoOverrides.serviceAreas as unknown[])
        .map((entry) => asString(entry).trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const resolvedGeo =
    serviceAreasOverride.length > 0
      ? { primaryLocation: requestedPrimaryLocation, serviceAreas: serviceAreasOverride }
      : await resolveNearbyServiceAreas({
          businessName: requestedBusinessName,
          businessType: requestedBusinessCategory,
          city: requestedPrimaryLocation,
        });
  const defaultBusinessCity = asString(businessOverrides.city) || resolvedGeo.primaryLocation || lead.city;
  const defaultPrimaryLocation = asString(geoOverrides.primaryLocation) || resolvedGeo.primaryLocation || defaultBusinessCity;
  const defaultServiceAreas = serviceAreasOverride.length > 0 ? serviceAreasOverride : resolvedGeo.serviceAreas;

  const defaultConfig: TemplateConfig = {
    templateVersion: TEMPLATE_CONFIG_VERSION,
    leadId: lead.id,
    business: {
      name: requestedBusinessName,
      city: defaultBusinessCity,
      category: requestedBusinessCategory,
      websiteUrl: lead.websiteUrl ?? "",
    },
    geo: {
      primaryLocation: defaultPrimaryLocation,
      serviceAreas: defaultServiceAreas,
    },
    branding: {
      logoUrl: enrichmentBranding?.logoUrl?.trim() || "",
      heroImageUrl: "",
      featureImageUrl: "",
      galleryImages: [],
      primaryColor: firstNonEmptyString([primaryEnrichmentColor, "#0f172a"]),
      secondaryColor: firstNonEmptyString([secondaryEnrichmentColor, primaryEnrichmentColor, "#2563eb"]),
      themeVariant: "classic",
    },
    content: {
      hero: {
        headline: `${requestedBusinessName} in ${defaultBusinessCity}`,
        subheadline: `Trusted ${requestedBusinessCategory.toLowerCase()} specialists serving ${defaultBusinessCity} and nearby areas.`,
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
  const brandingOverrides = toPartialObject(safeOverrides.branding);
  const linksOverrides = toPartialObject(safeOverrides.links);
  const primaryLocation = asString(geoOverrides.primaryLocation) || defaultConfig.geo.primaryLocation;

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
      themeVariant: normalizeThemeVariant(brandingOverrides.themeVariant || defaultConfig.branding.themeVariant),
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
