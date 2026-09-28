import type { Metadata, Viewport } from "next";
import { PRODUCT_NAME } from "@/components/brand";
import { I18nProvider } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import "./globals.css";

/**
 * Metadata is generated per request rather than exported as a constant, so the
 * page title and description are in the reader's language too — a translated
 * page with an English browser tab is only half translated.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: {
      default: `${PRODUCT_NAME} — ${t.meta.titleSuffix}`,
      template: `%s · ${PRODUCT_NAME}`,
    },
    description: t.meta.tagline,
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale, tag } = await getI18n();

  return (
    // `lang` carries the real tag: screen readers choose a voice from it, and
    // announcing Korean text with an English voice makes it unintelligible.
    <html lang={tag}>
      <body>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
