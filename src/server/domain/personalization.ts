import { enServerText } from "@/i18n/locales/en-server-text";

/** Supported tokens are deliberately explicit; there is no expression evaluation. */
export const PERSONALIZATION_FIELDS = ["first_name", "last_name", "custom_1", "custom_2", "custom_3", "custom_4", "custom_5"] as const;
export type PersonalizationField = (typeof PERSONALIZATION_FIELDS)[number];
const TOKEN = /\{\{\s*(first_name|last_name|custom_[1-5])\s*\}\}/g;

export function personalizationFields(body: string): PersonalizationField[] {
  return [...new Set([...body.matchAll(TOKEN)].map((m) => m[1] as PersonalizationField))];
}

export function validPersonalizationSyntax(body: string): boolean {
  const remainder = body.replace(TOKEN, "");
  return !/\{\{|\}\}|\$\{/.test(remainder);
}

/** Missing values block the quote, so no customer receives an unfinished greeting. */
export function personalizeMessage(
  body: string,
  values: Partial<Record<PersonalizationField, string | null>>,
): string {
  if (!validPersonalizationSyntax(body)) throw new Error(enServerText.personalizationUnsupported);
  return body.replace(TOKEN, (_, field: PersonalizationField) => {
    const value = values[field]?.trim();
    if (!value || /\{\{|\}\}|\$\{/.test(value)) throw new Error(enServerText.personalizationMissing);
    return value;
  });
}
