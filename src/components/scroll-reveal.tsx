"use client";

import { useEffect } from "react";

/**
 * Plays a page's `data-reveal` elements in as they scroll into view, as the
 * reference's sections do (the styles are in globals.css).
 *
 * Content is visible until this runs, and stays visible for anyone who prefers
 * reduced motion. What is already on screen when it runs is left alone rather
 * than hidden and replayed: that would flash, and text caught mid-fade is low
 * contrast. Everything else is hidden at once, with no transition, so nothing
 * is ever half-faded except while it is coming into view.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const root = document.documentElement;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-revealed", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );

    for (const element of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
      if (element.getBoundingClientRect().top < window.innerHeight) {
        element.setAttribute("data-revealed", "");
      } else {
        observer.observe(element);
      }
    }
    root.setAttribute("data-reveal-armed", "");

    return () => {
      observer.disconnect();
      root.removeAttribute("data-reveal-armed");
    };
  }, []);

  return null;
}
