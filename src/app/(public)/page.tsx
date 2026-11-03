import type { CSSProperties } from "react";
import Link from "next/link";
import { PRODUCT_NAME } from "@/components/brand";
import { HeroCarousel } from "@/components/hero-carousel";
import { ScrollReveal } from "@/components/scroll-reveal";
import { ButtonLink, Card, cx } from "@/components/ui";
import { getDictionary } from "@/i18n/server";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  IconArrowRight,
  IconBlock,
  IconCard,
  IconChat,
  IconCheckCircle,
  IconDocument,
  IconFile,
  IconInfo,
  IconLocation,
  IconMegaphone,
  IconSend,
  IconShield,
  IconSliders,
  IconTag,
  IconUser,
  IconUsers,
  IconX,
} from "@/components/icons";

/**
 * The home page, in the order of DESIGN.md's "Screen Patterns": hero, shortcut
 * card, features, trust badges, then the black band with the flow and the
 * bulk-sending call to action. Every claim on it is one /features and
 * /how-it-works already make.
 */
export default async function HomePage() {
  const t = await getDictionary();
  return (
    <>
      <Hero t={t} />
      <Shortcuts t={t} />
      <Features t={t} />
      <Trust t={t} />
      <FlowBand t={t} />
      <ScrollReveal />
    </>
  );
}

/** Staggers one element of a row: its entrance starts `ms` after the row's first. */
function delay(ms: number): CSSProperties {
  return { "--reveal-delay": `${ms}ms` } as CSSProperties;
}

/** A two-line section heading: one line bold, one light. */
function SectionHeading({
  strong,
  light,
  className,
}: {
  strong: React.ReactNode;
  light: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={cx("text-[28px] leading-9 tracking-[-1px] sm:text-[37px] sm:leading-[49px]", className)}>
      <span className="block font-bold">{strong}</span>{" "}
      <span className="block font-light">{light}</span>
    </h2>
  );
}

/** A slide's text and pictures rise into place as the slide comes in (see HeroCarousel). */
const SLIDE_PART =
  "translate-y-6 transition-transform duration-700 ease-out group-data-current:translate-y-0 motion-reduce:translate-y-0";

/** Splits copy whose line break is part of it: the first line is set bold, the rest light. */
function TitleLines({ text }: { text: string }) {
  const [strong, ...rest] = text.split("\n");
  return (
    <>
      <span className="block font-bold">{strong}</span>{" "}
      {rest.length > 0 ? <span className="block font-light">{rest.join(" ")}</span> : null}
    </>
  );
}

function Hero({ t }: { t: Dictionary }) {
  return (
    <HeroCarousel
      backdrop={
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 -top-44 h-[520px] w-[520px] rounded-full bg-white/70"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-56 left-[6%] h-[380px] w-[380px] rounded-full bg-decor-pink/70"
          />
        </>
      }
      slides={[<WelcomeSlide key="welcome" t={t} />, <SafetySlide key="safety" t={t} />]}
    />
  );
}

/** The page's own heading, so it is the only h1; the other slides use h2. */
function WelcomeSlide({ t }: { t: Dictionary }) {
  return (
    <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-5 pb-28 pt-14 md:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pb-32 lg:pt-16">
      <div className={SLIDE_PART}>
        <h1 className="text-[36px] leading-[1.25] tracking-[-1px] text-ink sm:text-[46px]">
          <TitleLines text={t.home.heroTitle} />
        </h1>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-muted">{t.home.heroBody}</p>

        <div className="mt-8 flex flex-wrap gap-2">
          <ButtonLink href="/signup" size="lg">
            {t.home.startSending} <IconArrowRight size={17} />
          </ButtonLink>
          <ButtonLink href="/bulk" size="lg" variant="ghost">
            {t.home.requestBulkQuote}
          </ButtonLink>
        </div>

        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3">
          <Assurance icon={<IconLocation size={15} />}>{t.home.philippinesOnly}</Assurance>
          <Assurance icon={<IconShield size={15} />}>{t.home.verifiedBusinesses}</Assurance>
          <Assurance icon={<IconCard size={15} />}>{t.home.prepaidCredits}</Assurance>
        </ul>
      </div>

      <div className={cx(SLIDE_PART, "flex items-start justify-center gap-4 delay-100 lg:justify-end")}>
        <UploadPreviewCard />
        <PhonePreview t={t} />
      </div>
    </div>
  );
}

/**
 * What is checked before anything is sent, as numbered points beside a phone:
 * the reference's second slide does the same for its advertising rules.
 */
function SafetySlide({ t }: { t: Dictionary }) {
  const points = [
    { title: t.home.slide2Point1Title, body: t.home.slide2Point1Body, tone: "bg-decor-lavender/30 text-ink" },
    { title: t.home.slide2Point2Title, body: t.home.slide2Point2Body, tone: "bg-decor-pink text-danger-fg" },
    { title: t.home.slide2Point3Title, body: t.home.slide2Point3Body, tone: "bg-mint/30 text-ink" },
  ];

  return (
    <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-5 pb-28 pt-14 md:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pb-32 lg:pt-16">
      <div className={SLIDE_PART}>
        <p className="flex items-center gap-2 text-[14px] font-bold text-danger-fg">
          <IconInfo size={16} /> {t.home.slide2Eyebrow}
        </p>
        <h2 className="mt-4 text-[34px] leading-[1.25] tracking-[-1px] text-ink sm:text-[42px]">
          <TitleLines text={t.home.slide2Title} />
        </h2>
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-muted">{t.home.slide2Body}</p>
        <div className="mt-8">
          <ButtonLink href="/how-it-works" size="lg" variant="ghost">
            {t.publicSite.linkHowItWorks} <IconArrowRight size={17} />
          </ButtonLink>
        </div>
      </div>

      <div
        className={cx(
          SLIDE_PART,
          "flex flex-col items-center gap-8 delay-100 sm:flex-row sm:justify-center lg:justify-end",
        )}
      >
        <ol className="w-full max-w-xs space-y-6">
          {points.map((point, index) => (
            <li key={point.title} className="flex gap-4">
              <span
                className={cx(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[14px] font-bold tabular-nums",
                  point.tone,
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <span className="block text-[15px] font-bold text-ink">{point.title}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-muted">{point.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <InboxPhone t={t} />
      </div>
    </div>
  );
}

/** Phone mock showing a message as it arrives, from an approved sender name. */
function InboxPhone({ t }: { t: Dictionary }) {
  return (
    <div className="hidden w-[230px] shrink-0 sm:block">
      <div className="rounded-[26px] border-[6px] border-navy-900 bg-white p-3 shadow-[0_22px_45px_-26px_rgba(17,17,17,0.5)]">
        <div className="flex flex-col items-center border-b border-line pb-2.5 pt-1 text-center">
          <span className="mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-bg text-muted">
            <IconUser size={14} />
          </span>
          <span className="text-[11.5px] font-bold text-ink">{PRODUCT_NAME}</span>
          <span className="text-[10px] text-muted">{t.send.phoneTextMessage}</span>
        </div>
        <div className="py-3">
          <div className="whitespace-pre-line rounded-[14px] bg-navy-50 px-3 py-2.5 text-[12.5px] leading-snug text-ink">
            {t.home.phoneSample}
          </div>
        </div>
      </div>
    </div>
  );
}

function Assurance({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-[13.5px] text-ink">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-brand-700">
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
    <Card className="w-full max-w-[380px] p-5 shadow-[-23px_16px_84px_rgba(51,57,91,0.1)]">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-bold text-ink">{t.publicExtra.uploadCardTitle}</p>
        <span className="text-[12.5px] text-brand-700">{t.publicExtra.uploadCardTemplate}</span>
      </div>

      <div className="mt-3.5 border border-dashed border-brand-200 bg-brand-50/40 px-4 py-7 text-center">
        <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center text-muted">
          <IconFile size={26} />
        </span>
        <p className="text-[13px] text-body">{t.publicExtra.uploadCardDrop}</p>
        <p className="text-[13px]">
          <span className="text-muted">{t.publicExtra.uploadCardOr}</span>
          <span className="font-bold text-brand-700">{t.publicExtra.uploadCardBrowse}</span>
        </p>
        <p className="mt-1.5 text-[12px] text-muted">{t.publicExtra.uploadCardFormat}</p>
      </div>

      <div className="mt-3 flex items-center gap-2.5 border border-line px-3 py-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-bg text-success-fg">
          <IconDocument size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold text-ink">
            {t.publicExtra.uploadCardFileName}
          </span>
          <span className="block text-[12px] text-muted">{t.publicExtra.uploadCardCount}</span>
        </span>
        <IconX size={14} className="text-muted" />
      </div>

      <div className="mt-2.5 flex items-start gap-2.5 bg-success-bg px-3 py-2.5">
        <IconCheckCircle size={16} className="mt-px shrink-0 text-success-fg" />
        <span className="text-[12.5px] leading-snug text-success-fg">
          <span className="block font-bold">{t.publicExtra.uploadCardSuccess}</span>
          {t.publicExtra.uploadCardFound}
        </span>
      </div>
    </Card>
  );
}

/** Phone mock showing how a message looks on a handset. */
function PhonePreview({ t }: { t: Dictionary }) {
  return (
    <div className="hidden w-[250px] shrink-0 sm:block lg:mt-10">
      <div className="rounded-[26px] border-[6px] border-navy-900 bg-white p-3 shadow-[0_22px_45px_-26px_rgba(17,17,17,0.5)]">
        <div className="flex items-center justify-between px-1 pb-2 text-[10.5px] font-bold text-ink">
          <span>9:41</span>
          <span className="flex items-center gap-1 text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            <span className="h-2 w-3.5 rounded-[2px] border border-current" />
          </span>
        </div>
        <p className="border-b border-line pb-2 text-center text-[12px] font-bold text-ink">
          {t.home.phoneNewMessage}
        </p>

        <div className="py-3">
          <div className="whitespace-pre-line rounded-[14px] bg-navy-50 px-3 py-2.5 text-[12.5px] leading-snug text-ink">
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

/**
 * The shortcut card that overlaps the hero: help on the left, the places a
 * visitor is most likely going on the right. Portal pages ask for a log-in
 * first, as the reference's do.
 */
function Shortcuts({ t }: { t: Dictionary }) {
  const items = [
    { href: "/app/send", label: t.nav.send, icon: <IconSend size={26} /> },
    { href: "/bulk", label: t.home.requestBulkQuote, icon: <IconChat size={26} /> },
    { href: "/app/campaigns", label: t.nav.campaigns, icon: <IconMegaphone size={26} /> },
    { href: "/app/settings/senders", label: t.settings.tileSenders, icon: <IconTag size={26} /> },
    { href: "/pricing", label: t.publicSite.linkPricing, icon: <IconCard size={26} /> },
    { href: "/how-it-works", label: t.publicSite.linkHowItWorks, icon: <IconDocument size={26} /> },
  ];

  return (
    <section aria-label={t.home.shortcuts} className="relative mx-auto -mt-10 max-w-[1280px] px-5 md:px-10">
      {/* It rises into place and its icons drop in, once, on load. */}
      <div className="rise-in grid rounded-t-[20px] bg-white shadow-[-3px_-4px_59px_rgba(193,193,193,0.22)] lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="px-8 py-8 lg:py-10">
          <p className="text-[18px] text-ink">{t.helpCentre.title}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{t.helpCentre.subheading}</p>
          <Link
            href="/help"
            className="mt-3 inline-flex items-center gap-1 py-1 text-[13px] font-bold text-brand-700 hover:underline"
          >
            {t.publicSite.linkHelp} <IconArrowRight size={14} />
          </Link>
        </div>
        <ul className="grid grid-cols-3 sm:grid-cols-6">
          {items.map((item, index) => (
            <li key={item.href} className="border-[#f7f7f7] sm:border-l sm:first:border-l-0 lg:first:border-l">
              <Link
                href={item.href}
                className="group flex h-full flex-col items-center justify-center gap-3 px-2 py-7 text-center text-[14px] text-ink hover:text-brand-700"
              >
                <span
                  style={delay(150 + index * 90)}
                  className="drop-in flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-700 transition-transform group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Features({ t }: { t: Dictionary }) {
  const [beforeProduct, afterProduct] = t.home.featuresHeadingLight.split("{product}");
  const cards = [
    { icon: <IconCard size={30} />, title: t.home.card1Title, body: t.home.card1Body },
    { icon: <IconCheckCircle size={30} />, title: t.home.card2Title, body: t.home.card2Body },
    { icon: <IconBlock size={30} />, title: t.home.card3Title, body: t.home.card3Body },
    { icon: <IconShield size={30} />, title: t.home.card4Title, body: t.home.card4Body },
  ];

  return (
    <section className="relative overflow-hidden pb-24 pt-24 sm:pt-32">
      <div
        aria-hidden="true"
        data-reveal="zoom"
        className="pointer-events-none absolute -left-32 top-[38%] h-[400px] w-[400px] rounded-full bg-decor-lavender/15"
      />
      <div
        aria-hidden="true"
        data-reveal="zoom"
        style={delay(200)}
        className="pointer-events-none absolute left-[32%] top-[30%] h-[320px] w-[320px] rounded-full bg-decor-pink/60"
      />

      <div className="relative mx-auto grid max-w-[1280px] gap-12 px-5 md:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div data-reveal="">
          <SectionHeading
            strong={t.home.featuresHeadingStrong}
            light={
              <>
                {beforeProduct}
                <span className="text-brand-700">{PRODUCT_NAME}</span>
                {afterProduct}
              </>
            }
          />
          <p className="mt-5 max-w-sm text-[14px] leading-6 text-ink">{t.home.featuresIntro}</p>
        </div>

        {/* The right-hand cards sit higher, as in the reference's staggered grid. */}
        <ul className="grid gap-6 sm:grid-cols-2">
          {cards.map((card, index) => (
            <li
              key={card.title}
              data-reveal="zoom"
              style={delay(index * 120)}
              className={cx(
                "rounded-[10px] bg-white p-8 shadow-[-23px_16px_84px_rgba(51,57,91,0.07)] transition-transform hover:translate-x-2 hover:translate-y-2 motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0 sm:min-h-[300px]",
                index % 2 === 1 && "sm:relative sm:-top-[50px]",
              )}
            >
              <span className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-brand-50 text-brand-700">
                {card.icon}
              </span>
              <h3 className="mt-6 text-[19px] tracking-[-0.5px] text-ink">{card.title}</h3>
              <p className="mt-3 text-[14px] leading-6 text-muted">{card.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Trust({ t }: { t: Dictionary }) {
  const badges = [
    { icon: <IconLocation size={44} />, label: t.home.philippinesOnly },
    { icon: <IconShield size={44} />, label: t.home.verifiedBusinesses },
    { icon: <IconCard size={44} />, label: t.home.prepaidCredits },
    { icon: <IconCheckCircle size={44} />, label: t.home.trustReview },
    { icon: <IconSliders size={44} />, label: t.home.trustLimits },
  ];

  // The badges close in on the middle as they arrive, the outer ones first.
  const entrances = ["left", "left", "", "right", "right"];

  return (
    // Clipped sideways: a badge on its way in starts outside the column.
    <section className="overflow-hidden pb-28 pt-4">
      <div className="mx-auto max-w-[1280px] px-5 md:px-10">
        <div data-reveal="">
          <SectionHeading strong={t.home.trustHeadingStrong} light={t.home.trustHeadingLight} />
          <p className="mt-5 max-w-md text-[14px] leading-6 text-ink">{t.home.trustIntro}</p>
        </div>

        <ul className="mt-16 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          {badges.map((badge, index) => (
            <li
              key={badge.label}
              data-reveal={entrances[index]}
              style={delay(100 * Math.min(index, badges.length - 1 - index))}
              className="flex flex-col items-center text-center"
            >
              <span className="flex h-32 w-32 items-center justify-center rounded-full bg-white text-brand-700 shadow-[5px_11px_10px_rgba(50,45,95,0.03),inset_0_8px_7px_rgba(181,181,201,0.18)] lg:h-40 lg:w-40">
                {badge.icon}
              </span>
              <span className="mt-6 text-[17px] text-ink">{badge.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The black band: how a message travels, then the bulk-sending call to action. */
function FlowBand({ t }: { t: Dictionary }) {
  const steps = [
    { icon: <IconUsers size={26} />, title: t.home.step1Title, body: t.home.step1Body },
    { icon: <IconDocument size={26} />, title: t.home.step2Title, body: t.home.step2Body },
    { icon: <IconSend size={26} />, title: t.home.step3Title, body: t.home.step3Body },
  ];

  return (
    <section className="overflow-hidden bg-black py-24">
      <div className="mx-auto max-w-[1280px] px-5 md:px-10">
        <h2
          data-reveal="down"
          className="text-[28px] leading-9 font-light tracking-[-1px] text-white sm:text-[37px] sm:leading-[49px]"
        >
          {t.home.stepsTitle}
        </h2>
        <p data-reveal="" style={delay(150)} className="mt-4 max-w-md text-[14px] leading-6 text-mint">
          {t.home.stepsSubheading}
        </p>

        <ol className="mt-14 grid gap-10 md:grid-cols-3">
          {steps.map((step, index) => {
            const last = index === steps.length - 1;
            return (
              <li
                key={step.title}
                data-reveal=""
                style={delay(index * 150)}
                className="relative flex flex-col items-center text-center"
              >
                {!last ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-[calc(50%+60px)] right-[calc(-50%+60px)] top-[70px] hidden border-t border-dashed border-mint/60 md:block"
                  />
                ) : null}
                {/* The last step is the one the band leads to, so it is the lit one. */}
                <span
                  className={cx(
                    "flex h-[140px] w-[100px] flex-col items-center justify-center gap-3 rounded-full",
                    last ? "bg-mint text-ink" : "bg-[#1f1f1f] text-white",
                  )}
                >
                  {step.icon}
                  <span className="text-[13px] font-bold">{index + 1}</span>
                </span>
                <h3 className="mt-5 text-[17px] text-white">{step.title}</h3>
                <p className="mt-2 max-w-[260px] text-[13.5px] leading-relaxed text-navy-300">{step.body}</p>
              </li>
            );
          })}
        </ol>

        <div
          data-reveal=""
          className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-white/15 pt-10"
        >
          <div>
            <h2 className="text-[24px] text-white">{t.home.bulkTitle}</h2>
            <p className="mt-1.5 text-[15px] text-navy-300">{t.home.bulkBody}</p>
          </div>
          <ButtonLink href="/bulk" size="lg">
            {t.home.bulkCta} <IconArrowRight size={17} />
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
