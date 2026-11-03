"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { IconPause, IconPlay } from "./icons";
import { cx } from "./ui";
import { useT } from "@/i18n/client";

/** Past the five seconds after which WCAG 2.2.2 asks for a way to pause, which there is. */
const INTERVAL_MS = 6500;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Reduced until the browser says otherwise, so the server render never rotates. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
}

/**
 * The home page's hero as a carousel (DESIGN.md, "Marketing pieces"), after
 * the WAI-ARIA carousel pattern.
 *
 * It moves on every 6.5 seconds, and stops while the pointer is over it or
 * focus is inside it, after the pause button, and for anyone who prefers
 * reduced motion. The slides share one grid cell, so the hero is as tall as
 * the tallest and nothing below it jumps. A slide that is not showing is
 * `inert`: out of the tab order and the accessibility tree.
 *
 * Slides change by a cross-fade; inside a slide, anything under
 * `group-data-current:` can move with it.
 */
export function HeroCarousel({ slides, backdrop }: { slides: ReactNode[]; backdrop?: ReactNode }) {
  const t = useT();
  const reducedMotion = usePrefersReducedMotion();
  const [current, setCurrent] = useState(0);
  // The pause button, and the pointer or focus resting inside.
  const [stopped, setStopped] = useState(false);
  const [held, setHeld] = useState(false);
  const rotating = slides.length > 1 && !stopped && !held && !reducedMotion;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => setCurrent((index) => (index + 1) % slides.length), INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [rotating, current, slides.length]);

  return (
    <section
      aria-roledescription={t.home.carouselRole}
      aria-label={t.home.carouselLabel}
      className="relative overflow-hidden bg-band"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false);
      }}
    >
      {backdrop}

      {/* Announced only once it has stopped moving, or it would talk over the reader. */}
      <div className="relative grid" aria-live={rotating ? "off" : "polite"}>
        {slides.map((slide, index) => {
          const active = index === current;
          return (
            <div
              key={index}
              role="group"
              aria-roledescription={t.home.carouselSlideRole}
              aria-label={t.home.carouselSlide(index + 1, slides.length)}
              inert={!active}
              data-current={active ? "" : undefined}
              // Centred in the shared cell, so a shorter slide does not leave its gap at the bottom.
              className={cx(
                "group flex flex-col justify-center [grid-area:1/1] transition-opacity duration-700 motion-reduce:transition-none",
                active ? "opacity-100" : "opacity-0",
              )}
            >
              {slide}
            </div>
          );
        })}
      </div>

      {slides.length > 1 ? (
        <div className="absolute inset-x-0 bottom-14">
          <div className="mx-auto flex max-w-[1280px] items-center gap-0.5 px-5 md:px-10">
            {reducedMotion ? null : (
              <button
                type="button"
                onClick={() => setStopped((value) => !value)}
                aria-label={stopped ? t.home.carouselPlay : t.home.carouselPause}
                className="mr-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-white text-ink hover:bg-navy-50"
              >
                {stopped ? <IconPlay size={12} /> : <IconPause size={12} />}
              </button>
            )}
            {slides.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setCurrent(index)}
                aria-label={t.home.carouselSlide(index + 1, slides.length)}
                aria-current={index === current ? "true" : undefined}
                className="flex h-6 min-w-6 items-center justify-center px-1"
              >
                {/* The current dot is a longer bar in ink; the others are 3:1 on the band. */}
                <span
                  className={cx(
                    "h-2 rounded-full transition-[width,background-color] duration-300",
                    index === current ? "w-5 bg-ink" : "w-2 bg-navy-400",
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
