import type { Lead } from "@/lib/types";

export const TEMPLATE_CONFIG_VERSION = "1.1.0";

type Primitive = string | number | boolean | null;
type JsonValue = Primitive | JsonValue[] | { [key: string]: JsonValue };

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

function buildServiceAreas(city: string): string[] {
  const normalizedCity = city.trim();
  if (!normalizedCity) return [];

  const directionalAreas = [
    `North ${normalizedCity}`,
    `South ${normalizedCity}`,
    `East ${normalizedCity}`,
    `West ${normalizedCity}`,
    `${normalizedCity} Metro`,
    `${normalizedCity} Downtown`,
    `${normalizedCity} Heights`,
    `${normalizedCity} District`,
  ];

  return [normalizedCity, ...directionalAreas].slice(0, 8);
}

export function buildTemplateConfig(lead: Lead, overrides: unknown): TemplateConfig {
  const safeOverrides = toPartialObject(overrides) as TemplateConfigOverrides;

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
      primaryLocation: lead.city,
      serviceAreas: buildServiceAreas(lead.city),
    },
    branding: {
      logoUrl: "",
      heroImageUrl: "",
      primaryColor: "#0f172a",
      secondaryColor: "#2563eb",
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
  const geoOverrides = toPartialObject(safeOverrides.geo);
  const primaryLocation = asString(geoOverrides.primaryLocation) || defaultConfig.business.city;
  const serviceAreasOverride = Array.isArray(geoOverrides.serviceAreas)
    ? (geoOverrides.serviceAreas as unknown[])
        .map((entry) => asString(entry).trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];

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
      serviceAreas: serviceAreasOverride.length ? serviceAreasOverride : buildServiceAreas(primaryLocation),
    },
    branding: {
      ...defaultConfig.branding,
      logoUrl: asString(brandingOverrides.logoUrl) || defaultConfig.branding.logoUrl,
      heroImageUrl: asString(brandingOverrides.heroImageUrl) || defaultConfig.branding.heroImageUrl,
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
