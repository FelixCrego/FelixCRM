export type LeadCsvImportedFields = Record<string, string>;

export type ParsedCsvLead = {
  businessName: string;
  phone?: string;
  email?: string;
  websiteUrl?: string;
  aiResearchSummary?: string;
  sourceQuery?: string;
  leadQuality?: string;
  googleRating?: string;
  googleReviews?: string;
  importedFields: LeadCsvImportedFields;
};

const CSV_FIELD_ALIASES = {
  businessName: ["businessname", "name", "company", "business"],
  phone: ["phone", "phonenumber", "telephone"],
  email: ["email", "emailaddress", "contactemail", "businessemail", "owneremail"],
  websiteUrl: ["website", "websiteurl", "url", "domain"],
  aiResearchSummary: ["airesearchsummary", "ai_research_summary", "deepaianalysis", "aianalysis", "analysis", "summary", "researchsummary"],
  sourceQuery: ["sourcequery", "source_query", "source", "query", "searchquery", "sourceprompt"],
  leadQuality: ["leadquality", "lead_quality"],
  googleRating: ["googlerating", "google_rating", "googlebusinessrating", "gmbrating"],
  googleReviews: ["googlereviews", "google_reviews", "googlebusinessreviews", "google_review_count", "reviewcount", "review_count", "googlereviewcount"],
} as const;

export function normalizeImportedFieldKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getImportedFieldValue(importedFields: LeadCsvImportedFields | null | undefined, aliases: readonly string[]) {
  if (!importedFields) return null;
  const aliasSet = new Set(aliases.map(normalizeImportedFieldKey));

  for (const [label, rawValue] of Object.entries(importedFields)) {
    if (!aliasSet.has(normalizeImportedFieldKey(label))) continue;
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (value) return value;
  }

  return null;
}

export function parseCsvRows(raw: string): string[][] {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const nextChar = raw[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      currentRow.push(currentCell.trim());
      if (currentRow.some((value) => value.length > 0)) rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((value) => value.length > 0)) rows.push(currentRow);
  }

  return rows;
}

function readCell(row: string[], index: number) {
  return index >= 0 ? row[index]?.trim() || "" : "";
}

function findColumnIndex(normalizedHeaders: string[], aliases: readonly string[]) {
  return normalizedHeaders.findIndex((header) => aliases.includes(header));
}

function buildImportedFields(headerRow: string[], row: string[]) {
  return headerRow.reduce<LeadCsvImportedFields>((accumulator, header, index) => {
    const label = header.trim() || `Column ${index + 1}`;
    const value = row[index]?.trim() || "";
    if (!value) return accumulator;
    accumulator[label] = value;
    return accumulator;
  }, {});
}

export function parseLeadsFromCsv(raw: string): ParsedCsvLead[] {
  const rows = parseCsvRows(raw);
  if (!rows.length) return [];

  const [headerRow, ...dataRows] = rows;
  const normalizedHeaders = headerRow.map((header) => normalizeImportedFieldKey(header));

  const businessNameIndex = findColumnIndex(normalizedHeaders, CSV_FIELD_ALIASES.businessName);
  const phoneIndex = findColumnIndex(normalizedHeaders, CSV_FIELD_ALIASES.phone);
  const emailIndex = findColumnIndex(normalizedHeaders, CSV_FIELD_ALIASES.email);
  const websiteIndex = findColumnIndex(normalizedHeaders, CSV_FIELD_ALIASES.websiteUrl);
  const aiResearchSummaryIndex = findColumnIndex(normalizedHeaders, CSV_FIELD_ALIASES.aiResearchSummary);
  const sourceQueryIndex = findColumnIndex(normalizedHeaders, CSV_FIELD_ALIASES.sourceQuery);
  const leadQualityIndex = findColumnIndex(normalizedHeaders, CSV_FIELD_ALIASES.leadQuality);
  const googleRatingIndex = findColumnIndex(normalizedHeaders, CSV_FIELD_ALIASES.googleRating);
  const googleReviewsIndex = findColumnIndex(normalizedHeaders, CSV_FIELD_ALIASES.googleReviews);

  if (businessNameIndex < 0) {
    throw new Error(
      "CSV must include a business name column (businessName, name, company, or business). All other columns are preserved on the lead workspace.",
    );
  }

  return dataRows
    .map((row) => {
      const importedFields = buildImportedFields(headerRow, row);

      return {
        businessName: readCell(row, businessNameIndex),
        phone: readCell(row, phoneIndex) || getImportedFieldValue(importedFields, CSV_FIELD_ALIASES.phone) || "",
        email: readCell(row, emailIndex) || getImportedFieldValue(importedFields, CSV_FIELD_ALIASES.email) || "",
        websiteUrl: readCell(row, websiteIndex) || getImportedFieldValue(importedFields, CSV_FIELD_ALIASES.websiteUrl) || "",
        aiResearchSummary: readCell(row, aiResearchSummaryIndex) || getImportedFieldValue(importedFields, CSV_FIELD_ALIASES.aiResearchSummary) || "",
        sourceQuery: readCell(row, sourceQueryIndex) || getImportedFieldValue(importedFields, CSV_FIELD_ALIASES.sourceQuery) || "",
        leadQuality: readCell(row, leadQualityIndex) || getImportedFieldValue(importedFields, CSV_FIELD_ALIASES.leadQuality) || "",
        googleRating: readCell(row, googleRatingIndex) || getImportedFieldValue(importedFields, CSV_FIELD_ALIASES.googleRating) || "",
        googleReviews: readCell(row, googleReviewsIndex) || getImportedFieldValue(importedFields, CSV_FIELD_ALIASES.googleReviews) || "",
        importedFields,
      };
    })
    .filter((lead) => lead.businessName.length > 0);
}
