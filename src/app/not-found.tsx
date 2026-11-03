import { Wordmark } from "@/components/brand";
import { ButtonLink, Card } from "@/components/ui";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { getDictionary } from "@/i18n/server";

/**
 * The page for an address that does not exist, or that the reader may not see.
 *
 * It replaces everything under the root layout, so it brings its own header.
 * The two cases are worded as one on purpose: telling them apart would confirm
 * that someone else's record exists.
 */
export default async function NotFound() {
  const t = await getDictionary();

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center px-5">
          <Wordmark />
          <span className="ml-auto">
            <LocaleSwitcher />
          </span>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 py-12">
        <div className="w-full max-w-[440px]">
          <h1 className="text-[26px] font-extrabold tracking-tight text-ink">{t.notFound.title}</h1>
          <Card className="mt-6 p-6">
            <p className="text-[14px] text-body">{t.notFound.body}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <ButtonLink href="/app/dashboard">{t.notFound.dashboard}</ButtonLink>
              <ButtonLink href="/" variant="ghost">
                {t.notFound.home}
              </ButtonLink>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
