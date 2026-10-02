import { Scribble } from "@/components/brand";
import { ButtonLink, Card } from "@/components/ui";
import { getDictionary } from "@/i18n/server";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  IconArrowRight,
  IconCard,
  IconChat,
  IconDocument,
  IconFile,
  IconLocation,
  IconSend,
  IconShield,
  IconUsers,
  IconX,
  IconCheckCircle,
} from "@/components/icons";

export default async function HomePage() {
  const t = await getDictionary();
  return (
    <>
      <Hero t={t} />
      <HowItWorks t={t} />
      <BulkBand t={t} />
    </>
  );
}

function Hero({ t }: { t: Dictionary }) {
  return (
    <section className="relative overflow-hidden bg-[#eff5fe]">
      {/* Soft background shapes */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-32 h-[520px] w-[720px] rounded-full bg-white/50 blur-[2px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 bottom-[-180px] h-[420px] w-[620px] rounded-full bg-brand-100/60"
      />

      <div className="relative mx-auto grid max-w-[1240px] items-center gap-12 px-5 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:py-20">
        <div>
          <h1 className="whitespace-pre-line text-[44px] font-extrabold leading-[1.05] tracking-tight text-ink sm:text-[54px]">
            {t.home.heroTitle}
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-body">
            {t.home.heroBody}
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/signup" size="lg">
              {t.home.startSending} <IconArrowRight size={17} />
            </ButtonLink>
            <ButtonLink href="/bulk" size="lg" variant="ghost">
              {t.home.requestBulkQuote}
            </ButtonLink>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-7 gap-y-3">
            <Assurance icon={<IconLocation size={15} />} tint="teal">
              {t.home.philippinesOnly}
            </Assurance>
            <Assurance icon={<IconShield size={15} />} tint="brand">
              {t.home.verifiedBusinesses}
            </Assurance>
            <Assurance icon={<IconCard size={15} />} tint="brand">
              {t.home.prepaidCredits}
            </Assurance>
          </ul>
        </div>

        <div className="relative">
          <Scribble
            className="absolute -top-8 right-2 z-10 hidden whitespace-pre-line text-right lg:block"
            rotate={6}
          >
            {t.home.scribbleHero}
          </Scribble>

          <div className="flex items-start gap-4">
            <UploadPreviewCard />
            <PhonePreview t={t} />
          </div>

          <div className="relative mt-3 hidden lg:block">
            <Scribble className="absolute left-2 top-1 whitespace-pre-line" rotate={-5}>
              {t.home.scribbleUpload}
            </Scribble>
            <svg
              aria-hidden="true"
              width="120"
              height="52"
              viewBox="0 0 120 52"
              fill="none"
              className="absolute left-[132px] top-0 text-navy-300"
            >
              <path
                d="M2 46C28 40 66 30 104 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path
                d="M94 4.5 106 7.5 100 17"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

function Assurance({
  icon,
  children,
  tint,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tint: "teal" | "brand";
}) {
  return (
    <li className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
      <span
        className={
          tint === "teal"
            ? "flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 text-teal-700"
            : "flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-brand-600"
        }
      >
        {icon}
      </span>
      {children}
    </li>
  );
}

/** Illustrative CSV upload card from the marketing hero. Not interactive. */
async function UploadPreviewCard() {
  const t = await getDictionary();

  return (
    <Card className="w-full max-w-[380px] p-5 shadow-[0_18px_40px_-24px_rgba(15,34,68,0.35)]">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold text-ink">{t.publicExtra.uploadCardTitle}</p>
        <span className="text-[12.5px] font-semibold text-brand-600">{t.publicExtra.uploadCardTemplate}</span>
      </div>

      <div className="mt-3.5 rounded-[10px] border border-dashed border-brand-200 bg-brand-50/40 px-4 py-7 text-center">
        <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center text-muted">
          <IconFile size={26} />
        </span>
        <p className="text-[13px] text-body">{t.publicExtra.uploadCardDrop}</p>
        <p className="text-[13px]">
          <span className="text-muted">{t.publicExtra.uploadCardOr}</span>
          <span className="font-semibold text-brand-600">{t.publicExtra.uploadCardBrowse}</span>
        </p>
        <p className="mt-1.5 text-[11.5px] text-muted">
          {t.publicExtra.uploadCardFormat}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2.5 rounded-[9px] border border-line px-3 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-success-bg text-success-fg">
          <IconDocument size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">
            {t.publicExtra.uploadCardFileName}
          </span>
          <span className="block text-[12px] text-muted">{t.publicExtra.uploadCardCount}</span>
        </span>
        <IconX size={14} className="text-muted" />
      </div>

      <div className="mt-2.5 flex items-start gap-2.5 rounded-[9px] bg-success-bg px-3 py-2.5">
        <IconCheckCircle size={16} className="mt-px shrink-0 text-success-fg" />
        <span className="text-[12.5px] leading-snug text-success-fg">
          <span className="block font-semibold">{t.publicExtra.uploadCardSuccess}</span>
          {t.publicExtra.uploadCardFound}
        </span>
      </div>
    </Card>
  );
}

/** Phone mock showing how a message looks on a handset. */
function PhonePreview({ t, compact = false }: { t: Dictionary; compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "w-[236px] shrink-0"
          : "hidden w-[250px] shrink-0 sm:block"
      }
    >
      <div className="rounded-[26px] border-[6px] border-navy-900 bg-white p-3 shadow-[0_22px_45px_-26px_rgba(15,34,68,0.5)]">
        <div className="flex items-center justify-between px-1 pb-2 text-[10.5px] font-semibold text-ink">
          <span>9:41</span>
          <span className="flex items-center gap-1 text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            <span className="h-2 w-3.5 rounded-[2px] border border-current" />
          </span>
        </div>
        <p className="border-b border-line pb-2 text-center text-[12px] font-semibold text-ink">
          {t.home.phoneNewMessage}
        </p>

        <div className="py-3">
          <div className="whitespace-pre-line rounded-[14px] bg-[#f1f3f7] px-3 py-2.5 text-[12.5px] leading-snug text-ink">
            {t.home.phoneSample}
          </div>
          <p className="mt-1.5 text-right text-[11px] text-muted">67/160</p>
        </div>

        <div className="rounded-[9px] bg-brand-600 py-2.5 text-center text-[13px] font-bold text-white">
          {t.nav.send}
        </div>
      </div>
    </div>
  );
}

function HowItWorks({ t }: { t: Dictionary }) {
  const steps = [
    { icon: <IconUsers size={20} />, title: t.home.step1Title, body: t.home.step1Body },
    { icon: <IconDocument size={20} />, title: t.home.step2Title, body: t.home.step2Body },
    { icon: <IconSend size={20} />, title: t.home.step3Title, body: t.home.step3Body },
  ];

  return (
    <section className="bg-white py-16">
      <div className="mx-auto max-w-[1240px] px-5">
        <h2 className="text-center text-[30px] font-extrabold tracking-tight text-ink">
          {t.home.stepsTitle}
        </h2>
        <p className="mt-2 text-center text-[15px] text-body">
          {t.home.stepsSubheading}
        </p>

        <div className="mt-10 grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
          {steps.map((step, index) => (
            <div key={step.title} className="contents">
              <Card className="px-6 py-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
                  {step.icon}
                </span>
                <p className="mt-4 text-[16px] font-bold text-ink">{step.title}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-body">
                  {step.body}
                </p>
              </Card>
              {index < steps.length - 1 ? (
                <div className="hidden items-center justify-center text-muted md:flex">
                  <IconArrowRight size={20} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BulkBand({ t }: { t: Dictionary }) {
  return (
    <section className="bg-white pb-16">
      <div className="mx-auto max-w-[1240px] px-5">
        <div className="relative overflow-hidden rounded-[14px] bg-navy-800 px-8 py-10 sm:px-12">
          <IconChat
            size={80}
            className="pointer-events-none absolute -left-3 bottom-2 text-white/5"
            aria-hidden="true"
          />
          <IconChat
            size={48}
            className="pointer-events-none absolute left-16 top-6 text-white/5"
            aria-hidden="true"
          />
          <PhilippinesGlyph className="pointer-events-none absolute right-40 top-1/2 hidden h-28 -translate-y-1/2 text-white/5 lg:block" />

          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div>
              <h2 className="text-[27px] font-extrabold tracking-tight text-white">
                {t.home.bulkTitle}
              </h2>
              <p className="mt-1.5 text-[15px] text-navy-200">
                {t.home.bulkBody}
              </p>
            </div>
            <div className="flex items-center gap-6">
              {/* A variant, not a className override: `cx` does not merge, so
                  overriding primary's colours left its white text on a white
                  button and the label disappeared. */}
              <ButtonLink href="/bulk" size="lg" variant="ghost">
                {t.home.bulkCta} <IconArrowRight size={17} />
              </ButtonLink>
              <Scribble className="hidden whitespace-pre-line lg:block" rotate={-6} on="dark">
                {t.home.scribbleBulk}
              </Scribble>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Loose decorative glyph suggesting the archipelago. Not a real map. */
function PhilippinesGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 110" fill="currentColor" className={className} aria-hidden="true">
      <path d="M22 4c6 2 10 8 12 15 2 8-1 14-5 18-3 3-4 7-2 11 2 5 1 9-3 11-3 2-6 1-8-2-3-5-4-12-2-19 2-8 5-13 5-20 0-6 0-11 3-14Z" />
      <path d="M34 52c4 1 6 5 5 9-1 5-5 7-8 5-3-2-3-8-1-11 1-2 3-3 4-3Z" />
      <path d="M18 62c3 0 5 3 4 7-1 5-5 9-9 8-3-1-4-5-2-9 2-4 5-6 7-6Z" />
      <path d="M30 76c6 1 11 6 13 13 2 6 0 12-4 15-4 2-9 0-13-5-4-6-5-13-2-18 1-3 3-5 6-5Z" />
      <path d="M10 84c2-1 4 1 4 4s-2 6-4 6-3-3-2-6c0-2 1-4 2-4Z" />
    </svg>
  );
}
