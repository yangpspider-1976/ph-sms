---
version: alpha
name: PH SMS
description: >-
  The PH SMS interface, modelled on munjashot.com (문자쏴): white pages, one teal
  brand colour, square controls, hairline tables, and a top menu that drops a
  full-width panel. KakaoTalk features are left out. Colours are adjusted where
  the reference fails WCAG 2.1 AA.
colors:
  primary: "#077d79"
  primary-hover: "#066f6b"
  primary-bright: "#0bc0b9"
  primary-tint: "#e8f8f7"
  on-primary: "#ffffff"
  secondary: "#282c47"
  on-secondary: "#ffffff"
  tertiary: "#35d8aa"
  neutral: "#f2f2f2"
  surface: "#ffffff"
  surface-subtle: "#fafafa"
  surface-hover: "#f4f4f4"
  surface-button: "#f3f3f3"
  on-surface: "#111111"
  body: "#595959"
  muted: "#6b6b6b"
  placeholder: "#767676"
  line: "#f0f0f0"
  line-strong: "#e5e5e5"
  control-border: "#8c8c8c"
  inverse-surface: "#000000"
  inverse-raised: "#1f1f1f"
  on-inverse: "#ffffff"
  copyright: "#767676"
  error: "#c62828"
  error-tint: "#ffe9e9"
  success: "#066f6b"
  success-tint: "#e8f8f7"
  warning: "#9a5a11"
  warning-tint: "#fdf1de"
  info: "#1b4fc4"
  info-tint: "#e8f0fe"
  review: "#812a44"
  decor-pink: "#ffe9e9"
  decor-lavender: "#9e9ec3"
typography:
  display-lg:
    fontFamily: Noto Sans KR
    fontSize: 37px
    fontWeight: 300
    lineHeight: 49px
    letterSpacing: -1px
  display-lg-strong:
    fontFamily: Noto Sans KR
    fontSize: 37px
    fontWeight: 700
    lineHeight: 49px
    letterSpacing: -1px
  number-lg:
    fontFamily: Gmarket Sans
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.2
  number-md:
    fontFamily: Gmarket Sans
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
  headline-lg:
    fontFamily: Noto Sans KR
    fontSize: 24px
    fontWeight: 500
    lineHeight: 1.4
  headline-md:
    fontFamily: Noto Sans KR
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.4
  title-dialog:
    fontFamily: Noto Sans KR
    fontSize: 22px
    fontWeight: 700
    lineHeight: 1.3
  title-card:
    fontFamily: Noto Sans KR
    fontSize: 19px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: -0.5px
  body-lg:
    fontFamily: Noto Sans KR
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.6
  body-md:
    fontFamily: Noto Sans KR
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.7
  body-sm:
    fontFamily: Noto Sans KR
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.6
  label-sm:
    fontFamily: Noto Sans KR
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.5
  menu-main:
    fontFamily: Noto Sans KR
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1
  menu-sub:
    fontFamily: Noto Sans KR
    fontSize: 15px
    fontWeight: 500
    lineHeight: 42px
    letterSpacing: -0.5px
  button-lg:
    fontFamily: Noto Sans KR
    fontSize: 17px
    fontWeight: 500
    lineHeight: 1
rounded:
  none: 0px
  sm: 5px
  md: 6px
  lg: 10px
  xl: 20px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 50px
  block: 80px
  section: 120px
  container: 1200px
  gutter: 40px
  gutter-mobile: 20px
  header: 90px
  header-mobile: 56px
  row: 50px
  row-head: 52px
  tab: 50px
  field: 44px
  field-compact: 36px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    height: 44px
    padding: 20px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-lg:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.none}"
    height: 54px
    padding: 50px
  button-primary-sm:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    height: 28px
    padding: 14px
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    height: 40px
    padding: 24px
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.none}"
    height: 54px
  button-quiet:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    height: 36px
    padding: 20px
  button-quiet-hover:
    backgroundColor: "{colors.surface-hover}"
  button-cancel:
    backgroundColor: "{colors.surface-button}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    height: 40px
  button-dark:
    backgroundColor: "{colors.inverse-surface}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    height: 40px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    height: 44px
    padding: 20px
  input-compact:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    height: 36px
    padding: 12px
  checkbox:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.full}"
    size: 20px
  checkbox-checked:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    size: 20px
  tab:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.none}"
    height: 50px
  tab-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  filter-tab:
    textColor: "{colors.muted}"
    typography: "{typography.body-lg}"
  filter-tab-active:
    textColor: "{colors.secondary}"
  table-head:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    height: 52px
  table-row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    height: 50px
  pagination-item:
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
  pagination-item-active:
    textColor: "{colors.on-surface}"
  pagination-arrow:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.full}"
    size: 24px
  badge-rank:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
  badge-account-verified:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.on-secondary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
  badge-account-review:
    backgroundColor: "{colors.review}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
  pill-status-success:
    backgroundColor: "{colors.success-tint}"
    textColor: "{colors.success}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
  pill-status-warning:
    backgroundColor: "{colors.warning-tint}"
    textColor: "{colors.warning}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
  pill-status-error:
    backgroundColor: "{colors.error-tint}"
    textColor: "{colors.error}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
  pill-status-info:
    backgroundColor: "{colors.info-tint}"
    textColor: "{colors.info}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
  pill-status-neutral:
    backgroundColor: "{colors.surface-button}"
    textColor: "{colors.muted}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
  page-title:
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-md}"
    height: 80px
  menu-main-item:
    textColor: "{colors.on-surface}"
    typography: "{typography.menu-main}"
    padding: 28px
  menu-sub-link:
    textColor: "{colors.muted}"
    typography: "{typography.menu-sub}"
    rounded: "{rounded.full}"
    height: 42px
  menu-sub-link-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.on-surface}"
  rates-pill:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
    height: 26px
  quick-menu:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    width: 90px
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.none}"
    padding: 30px
    width: 450px
  service-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 40px
    height: 340px
  shortcut-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    height: 180px
  flow-node:
    backgroundColor: "{colors.inverse-raised}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
  flow-node-active:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.full}"
  dark-band:
    backgroundColor: "{colors.inverse-surface}"
    textColor: "{colors.on-inverse}"
  footer:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.muted}"
    typography: "{typography.label-sm}"
  copyright-bar:
    backgroundColor: "{colors.copyright}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.body-sm}"
    height: 40px
---

# PH SMS Design System

The tokens above are the values to use. The sections below say where and how to
use them. Values that differ from the reference are marked, with the reason.

## Overview

PH SMS takes its look from **munjashot.com (문자쏴)**, a Korean bulk-messaging
service. The look has these traits:

- **Layout:** white pages with plenty of space.
- **Colour:** one bright teal carries the brand.
- **Controls and tables:** square controls, and tables with hairline rules and
  centred text.
- **Navigation:** a single top menu. It drops a full-width panel that lists
  every page.

The signed-in screens are plain and practical. The marketing pages are livelier,
with pastel circles, phone mock-ups, cards that lift on hover and one black band.
All text, English and Korean, is set in Noto Sans KR. The overall feel is
practical and trustworthy, with a little warmth. Working screens (tables and
forms) are dense; screens where people decide (home, pricing) are spacious.

What PH SMS keeps, changes and leaves out:

- **Kept:** the navigation model, page anatomy, component shapes, type scale,
  spacing, and the bright teal as the signature colour.
- **Changed for accessibility:** the reference's teal measures 2.27:1 with white
  text, and its grey text measures 4.35:1. The project's CI checks pages against
  WCAG 2.1 AA with axe (`e2e/accessibility.spec.ts`), so:
  - wherever teal sits behind text or is text, a deeper shade of the same hue is
    used;
  - greys are a step darker.
- **Changed for small screens:** the reference fixes its width at 1200 px or more
  and scrolls sideways below that. Here those widths are maximums, because
  `e2e/responsive.spec.ts` fails any page that scrolls sideways at 375 px or
  768 px.
- **Left out:** everything KakaoTalk, and reference features PH SMS does not have.
  See [Left Out](#left-out).

How the reference was studied:

- **When:** 3 November 2026.
- **What was seen:**
  - the public pages (home, log-in, sign-up, notices, FAQ, the drop-down menu and
    the phone menu), at 1920 px and 390 px wide;
  - the site's style sheets.
- **What was not seen:** the signed-in screens, which sit behind the log-in. The
  page patterns below for those screens are composed from the reference's own
  components, plus what its FAQ says about them.
- **Re-checking it:** the site only opens from inside Korea. A VPN server in
  Seoul worked.

## Colors

The palette is one teal on white, with a slate navy for weight and greys doing
most of the work.

- **Signal Teal (#0bc0b9, `primary-bright`):** the reference's brand colour, used
  for decoration only:
  - the logo and illustrations;
  - the 5–6 px top border on dialogs and the quick menu;
  - decorative shapes.

  It is 2.27:1 against white. Never put text on it, never set text in it, and
  never use it on its own to show a state.
- **Deep Teal (#077d79, `primary`):** the colour of every action and state:
  - filled buttons, the active tab and links;
  - checked boxes, the focus ring and the current-page underline;
  - the credit balance.

  White text on it measures 4.98:1. As text it passes on white, on #fafafa and on
  the teal tint. Hover and pressed: **#066f6b**. On the footer grey (#f2f2f2),
  set teal text in #066f6b, because #077d79 measures 4.45:1 there.
- **Teal Tint (#e8f8f7):** selected rows and success pills.
- **Slate Navy (#282c47, `secondary`):** secondary filled buttons, the
  verified-business badge, the active filter tab, and the admin console's
  sidebar.
- **Mint (#35d8aa, `tertiary`):** decoration, and the highlighted step in the
  black band. Text on mint is ink, never white.
- **Ink (#111111):** headings and main text. The reference uses pure black.
- **Body Grey (#595959):** table cells and longer secondary text.
- **Muted Grey (#6b6b6b):** captions, helper text, inactive tabs, menu-panel
  links and footer text. It replaces the reference's #797979, which measures
  4.35:1. Placeholders are **#767676**. The reference's #e9e9e9 placeholders
  were unreadable.
- **Lines:**
  - **#f0f0f0:** hairlines on table rows, tabs and cards;
  - **#e5e5e5:** the header rule and field borders;
  - **#8c8c8c:** checkbox and radio outlines (3.36:1, enough for a control's
    edge).
- **Surfaces:**
  - pages are white, not the current grey canvas;
  - **#fafafa:** table heads, form label columns, answer boxes and dialog bands;
  - **#f4f4f4:** menu-link hover;
  - **#f3f3f3:** cancel buttons;
  - **#f2f2f2:** the footer and the hero band.
- **Black band:** #000000, with #1f1f1f flow steps.
- **Status:**
  - success: #066f6b on #e8f8f7;
  - warning: #9a5a11 on #fdf1de;
  - error: #c62828 on white or #ffe9e9;
  - info: #1b4fc4 on #e8f0fe.

  A status is never shown by colour alone; every pill carries its word. The
  reference's red (#ff5858) and blue (#2f7dff) helper text fail AA and are
  replaced by error and info.
- **Review Burgundy (#812a44):** the account badge while a business is under
  review or needs documents. The reference uses it for "기업 서류 미제출" and
  "기업 심사중".
- **Decoration:** pink #ffe9e9, lavender #9e9ec3 and mint, for the large soft
  circles behind home-page sections. The reference's yellow (#ffed3d) is left
  out because it reads as KakaoTalk.
- **Copyright bar:** #767676 with white text. The reference's #b6b6b6 with white
  measured 2.03:1.

## Typography

**Noto Sans KR** sets all text, English and Korean alike. It is under the SIL
Open Font License and available from `next/font/google`.

- **Weights:** the default is 500 (Medium), as in the reference. That weight is
  much of its crisp, slightly heavy look. Large light headings use 300; titles
  and emphasis use 700.
- **Big numbers:** **Gmarket Sans Bold** is for figures only: the credit
  balance, prices and result counts. The reference uses it for its support phone
  number. Sandoll lists it under the SIL Open Font License. Confirm that on
  Gmarket's own licence page, and self-host the files with the licence. The
  fallback is Noto Sans KR 700.
- **Marketing section headings:** 37 px, two lines, letter-spacing −1 px. One
  line is bold (700) and the other light (300). The product name, or the key
  word in the light line, takes the primary colour.
- **Page titles:** 20/500 in the portal; 24/500 centred on log-in and sign-up.
- **Text:**
  - body and table text: 14/500, line height 1.7 for paragraphs;
  - compact text: 13 px;
  - captions: 12 px. Nothing is smaller; the reference's 11 px Gulim utility
    links become 12 px Noto Sans KR.
- **Menus:** the top menu is 16 px; panel links are 15 px at −0.5 px letter
  spacing. Tabs and filter tabs are 16 px.
- **Phones:**
  - section headings: 28/36;
  - page titles: 18 px;
  - **form fields: 16 px**, because iOS zooms in on smaller fields. The reference
    avoids that by blocking zoom, which PH SMS must not do.
- **Korean wrapping:** Korean wraps between words (`word-break: keep-all`). That
  rule is already in `globals.css`.

## Layout

The desktop layout is a **centred column, 1200 px at most**. It has 20 px side
padding on phones and 40 px from 768 px up. The header spans the full width with
40 px padding.

| Width | What changes |
|---|---|
| 1580 px and up | The floating quick menu and the "My rates" pill appear in the right margin |
| 1536 px and up | Top-menu items get 28 px of padding either side and 16 px text (16 px and 15 px below that) |
| 1280 px and up | Full 90 px header with the drop-down menu. Below: a compact 56 px header with a slide-out menu. PH SMS's six menu labels are longer than the reference's, so the full header needs 1280 px, not the reference's 1120 px |
| 768 px and up | Two-column grids. Below: single column, and wide tables scroll inside their own frame |

**Page anatomy (portal).** Every working page has the same stack:

1. Page title band, 80 px tall, with a #f0f0f0 hairline under it.
2. Optional section tabs, 50 px tall, with 50 px of space below.
3. Toolbar: 36 px controls, with filters on the left and search and actions on
   the right.
4. The table or form.
5. Pagination, 30–50 px below the table.

**Rhythm:**

- The spacing steps are 4, 8, 16, 24, 40, 50, 80 and 120 px.
- Home-page sections take 90–180 px of top padding.
- The footer sits 120 px below the content.

**Forms:**

- **Log-in and sign-up:** a single 480 px column.
- **Long desktop forms** (support request, sender application, settings): rows
  with a 200 px #fafafa label column beside the field column, which is the
  reference's inquiry form.
- **Phones:** every form stacks its labels above the fields.

**Grids:**

- **Home feature cards:** 2 × 2, with the right column set 50 px higher.
- **Trust badges:** 5 across, 2 per row on phones.
- **Shortcut card:** 6 across, 3 per row on phones.

## Elevation & Depth

Working pages are flat. Hairlines and #fafafa fills separate things, and there
are no shadows. Shadows belong only to layers that float:

| Layer | Shadow and edge |
|---|---|
| Menu panel | 98 % white; `-9px 17px 16px rgba(77,77,77,.09)` |
| Quick menu | `0 2px 35px rgba(0,0,0,.09)`; 6 px Signal Teal top border |
| "My rates" card | `-3px -1px 30px rgba(0,0,0,.2)` |
| Home feature cards | `-23px 16px 84px rgba(51,57,91,.07)`; they shift 8 px down and right on hover |
| Shortcut card | `-3px -4px 59px rgba(193,193,193,.22)`; it overlaps the hero by 40 px |
| Trust badges | Inset `0 8px 7px rgba(181,181,201,.18)` with `5px 11px 10px rgba(50,45,95,.03)` |
| Dialogs | No shadow. The page dims to `rgba(0,0,0,.5)`; 5 px Signal Teal top border |

## Shapes

Anything people operate is **square**: buttons, fields, selects, tabs, tables,
dialogs and account badges. Rounding is kept for floating and marketing surfaces:

- **5 px:** rank badges ("TOP 1") and footer buttons;
- **6 px:** the quick menu;
- **10 px:** home feature cards and drop-down cards. The "My rates" card keeps
  its top-right corner square, pointing at its pill;
- **20 px:** the top corners of the shortcut card;
- **Full pill or circle:** floating toggles, pagination arrows, the hover shape
  of panel links, flow steps, trust badges and phone-menu shortcuts.

Checkboxes and radios are both **20 px circles with a check mark**, as in the
reference.

## Components

### Buttons

| Kind | Look | Use |
|---|---|---|
| Primary | Deep teal, white 14 px label, 44 px tall | The main action in a form or toolbar |
| Primary large | 54 px, 17 px label, 50 px side padding; full width in narrow forms | The last action of a form or wizard step |
| Primary small | 28 px, 13 px label | The header log-in button, dialog confirm |
| Secondary | Slate navy, white label, 40 px | A second action that still needs weight ("Raise a request", verify) |
| Outline | White, 1 px primary border, primary label, 54 px | A row that expands a section (the reference's "business member" toggle) |
| Quiet | #fafafa, 1 px #f0f0f0 border, ink label, 36 px | Back, list, export ("Download CSV") |
| Cancel | #f3f3f3, ink label, 40 px | The cancel button in dialogs |
| Dark | Black, white label, 5 px radius, 40 px | Footer secondary action, black-band CTA |

- **Hover:** primary turns #066f6b; quiet turns #f4f4f4.
- **Disabled:** a #fafafa fill with a muted label, plus `aria-disabled` or
  `disabled`. Disabled is never shown by lightness alone.
- **Busy:** a button that submits shows its busy label ("Saving…"), as now.

### Fields

- **Size:** 44 px tall in forms and 36 px in toolbars, with 20 px side padding.
- **Look:** white, with a 1 px #e5e5e5 border and square corners.
- **Text:** 14 px, or 16 px on phones.
- **Label:** above the field, in 14 px ink. Auth forms put 23 px above the label
  and 14 px below it.
- **Helper text:** 12 px muted, under the field.
- **Errors:** the error text and the field border both turn #c62828.
- **Focus:** a 2 px primary outline, offset 2 px. The border also turns primary.
- **Select:** styled like a field, with its chevron 20 px from the right.
- **Field with a button:** a 120 px square quiet button sits 10 px to its right.
  A search box is the exception: its 36 px icon button joins the field with no
  gap.
- **Date range:** two 170 px date fields with "~" between them.
- **File picker:** a bordered box with an 80 px "Choose file" segment and the
  file name beside it.
- **Checkbox and radio:**
  - unchecked: a 20 px white circle with a #8c8c8c outline and a faint check;
  - checked: primary fill with a white check;
  - the label sits 6 px to the right, 16 px (13 px in dense lists).
- **"Agree to all":** the row for agreeing to every term sits on #fafafa with
  16 px padding.

### Tabs

- **Section tabs:** equal-width segments across the column.
  - Size: 50 px tall, sharing 1 px #f0f0f0 borders.
  - Labels: 16 px muted. The current tab is filled primary with a white label.
  - Behaviour: each tab is a link with `aria-current="page"`. On phones they stay
    on one row, so keep them to four.
- **Filter tabs:** text only, 16 px muted, separated by 1 px #f0f0f0 rules. The
  current filter is slate navy at 700. On phones they become a boxed grid, with
  the current box filled navy and white text.
- **Wizard steps:** styled like section tabs and numbered ("1 Recipients").
  Finished steps link back; later steps are plain text.

### Tables

- **Frame:** a 1 px #f0f0f0 top rule. FAQ-style lists use a 1 px #595959 rule
  instead.
- **Head row:** #fafafa, 52 px, weight 500.
- **Rows:** 50 px, with a #f0f0f0 bottom rule.
- **Cells:** centred, in body grey. The title column is left-aligned and wraps or
  truncates, following the existing `cell-title` rules.
- **Wide tables:** they scroll inside their own frame. That is the current
  `DataTable`; keep its "Scrollable table" region and keyboard scrolling.
- **Empty table:** one centred 16 px muted line, in a 300 px-tall area.
- **Drill-down:** where a count opens a list (for example "Rejected" → the
  numbers), a small magnifier button sits under the count, as in the reference's
  results.

### Pagination

A centred row:

- **Arrows:** 24 px circles with a 1 px #f0f0f0 border, grey when there is
  nowhere to go.
- **Page numbers:** 14 px body grey, 5 px apart.
- **Current page:** ink, with a 2 px primary underline, and `aria-current="page"`.

### Badges and pills

- **Rank badge** ("TOP 1" to "TOP 5"): primary fill, white 13 px label, 5 px
  radius, 1 × 10 px padding.
- **Account badge:** beside the organisation name in the header. It is square,
  with white 12 px text:
  - slate navy for a verified business;
  - burgundy while the business is under review or needs documents.
- **Status pills** (campaign, contact, sender ID and import states): square,
  12 px, tinted background with status-colour text, always with the word. Solid
  fills are kept for the account badge.

### Header and menus

- **Utility row** (top right, 12 px muted): links separated by 1 × 10 px
  #c1c1c1 rules. It also holds the language switcher.
- **Top menu:** 16 px ink items, with 1 × 15 px #e5e5e5 rules between them.
  Each item is a link to its section's first page, so it works without hover.
- **Menu panel:**
  - **Opens:** when the pointer is over the menu or keyboard focus is inside it.
    It closes on Escape and when focus leaves.
  - **Layout:** full width under the header, with one column under each item, and
    20 px of padding above and 40 px below.
  - **Links:** 15 px muted, 42 px tall. On hover or focus they become a #f4f4f4
    pill with ink text.
  - **Markup:** plain lists of links inside `<nav>`, not `role="menu"`.
- **Account area (signed in, right):**
  - utility row: Settings, Log out and the language switcher. The switcher is
    the one control here that stays at every width, so a page has exactly one;
  - second line: the organisation name (14 px) and the account badge;
  - third line: "Credit ₱1,000.00", with the amount in primary.
- **"My rates" pill:**
  - **Look:** 13 px white on a primary pill, fixed below the header 60 px from
    the right.
  - **Contents:** it opens a 150 px card listing the price per SMS part. Use the
    organisation's own price if it has one, otherwise the default. Show nothing
    that is not actually billed.
- **Quick menu:**
  - **Position:** fixed 60 px from the right and 250 px from the top; 90 px wide.
  - **Look:** white, with a 6 px radius and a 6 px Signal Teal top border.
  - **Items:** 80 px tall with 2 px #efefef separators. Each label is two 13 px
    lines, the first word in ink and the rest muted.
  - **Narrower screens:** below 1580 px it is not shown, because the top menu
    and the phone menu have the same links. (The reference folds it into a pill
    at the bottom right, which covers page content.)
- **Phone menu (below 1280 px):** a full-screen white panel that slides in from
  the left, with a close button at the top right. Its contents exist only while
  it is open, so the page never holds a hidden second copy of the header. From
  top to bottom:
  1. the account summary, or a log-in prompt for visitors;
  2. three circle shortcuts: 60 px, 1 px ink outline, line icon and 16 px label;
  3. menu rows 62 px tall with #f0f0f0 rules;
  4. a three-column strip of links;
  5. a #f2f2f2 block with the legal links.

  It traps focus while open, closes on Escape, and returns focus to the menu
  button.

### Dialogs

- **Confirmation:**
  - Size: at least 450 px wide, and at most 90 vw on phones.
  - Look: white, with a 5 px Signal Teal top border and 30 px padding.
  - Content: a 22/700 title and a 16 px message.
  - Buttons: right-aligned, primary confirm beside grey cancel, both 40 px tall
    and at least 64 px wide.
  - Use a native `<dialog>`, which the app already uses.
- **Form dialog:**
  - 360 px wide.
  - Top band: #fafafa, with an 18 px title and a close button.
  - Body: 20 px × 30 px padding, ending in a full-width 40 px primary button.
  - Optional bottom band: #fafafa, for notes.

### Notices and empty states

- **Inline notices** (the existing `Notice`) become square boxes with 30 px
  padding:
  - on the status tint, or #fafafa when neutral;
  - with a 16/700 title in the status colour and the message in body grey;
  - on a page or under a form, never as a timed toast.
- **Empty states:** one centred line plus at most one action.

### Marketing pieces

- **Hero:**
  - **Band:** #f2f2f2, or a light photo, about 500 px tall.
  - **Left:** a small grey pill as eyebrow, a 30 px headline with bold
    keywords, a 16 px muted line, and one dark or primary button.
  - **Right:** the phone mock-up with a message card. PH SMS already has one.
  - **Slides:** one by default. A second slide rotates no faster than every
    6 seconds, stops on hover or focus, and has a visible pause button and
    labelled dots.
- **Shortcut card:**
  - **Placement:** 1280 px wide, 180 px tall, overlapping the hero by 40 px.
  - **Left block (340 px):** a title, one line, and a number in Gmarket Sans.
    Show a number only if it is real. PH SMS has no support phone line, so this
    block holds the help-centre entry instead.
  - **Right:** 6 equal columns, each a 64 px illustrated icon over a 14 px label,
    split by 1 px #f7f7f7 rules. The icon grows on hover.
- **Feature card:**
  - Box: 340 px tall, 40 px padding, 10 px radius.
  - Contents: a 72 px icon, a 19/700 title, and two to four 14 px muted lines
    (line height 24 px).
- **Trust badge:** a 160 px white circle with an inset ring and a 120 px icon.
  Its 18 px label sits underneath.
- **Black band:** black, optionally over a dark photo.
  - Heading: white, mixing light and bold; key phrases in mint.
  - Flow: a row of pill-shaped steps (dark #1f1f1f, white icon and label), joined
    by dashed lines. The current step is mint with ink text.
- **Footer:** #f2f2f2, 50 px top padding.
  - **Left:** a grey logo, 12 px muted product lines split by thin rules, and
    12 px ink legal links.
  - **Right:** a support block with two 40 px buttons, each 49 % wide with a
    5 px radius: primary "Contact support" and dark "Help center".
  - **Below:** the 40 px copyright bar. The demo notice stays in the footer.

## Navigation and Page Map

Labels come from the dictionaries in `src/i18n/locales`. A new label needs an
entry in both `en.ts` and `ko.ts`.

**Signed-in top menu.** Each top item links to the first page in its column.

| Top item (en / ko) | Panel column | Reference equivalent |
|---|---|---|
| Dashboard / 대시보드 | Dashboard `/app/dashboard`, Account status `/app/account-status` | none (the reference opens on its home page) |
| Send SMS / SMS 보내기 | Send SMS `/app/send`, Templates `/app/templates` | 메시지발송: 문자전송 |
| Contacts / 연락처 | Contacts `/app/contacts`, Groups `/app/contacts/groups`, Opt-outs `/app/contacts/opt-outs` | 주소록관리: 주소록 관리, 주소록 등록, 수신거부관리 |
| Campaigns / 캠페인 | Campaigns `/app/campaigns`, Approvals `/app/approvals` | 발송결과: 발송내역, 상세발송내역, 예약발송 |
| Credits & billing / 크레딧 및 결제 | Credits & billing `/app/credits` | 충전: 충전, 충전내역, 사용내역 |
| Support / 고객 지원 | Help center `/help`, Contact support `/app/support`, Bulk quote `/bulk` | 고객센터: 공지사항, 자주묻는질문, 1:1문의 |

- **Settings** (`/app/settings`, with Profile, Sender IDs and Team as its tabs)
  sits in the account area's utility row, where the reference keeps
  "마이페이지". Sender IDs also gets a quick-menu entry, matching the
  reference's "발신번호 관리".
- **Quick menu (signed in):** How it works, Sender IDs, Import contacts, Contact
  support.
- **Quick menu (visitors):** How it works, Pricing, Bulk quote, Help.
- **Visitor top menu:** Features, How it works, Pricing, Bulk SMS.
- **Visitor utility row:** Get started, Help, language. The log-in button sits
  below it.
- **Phone menu shortcuts:** Send SMS, Add credit, Campaigns. These replace the
  reference's 문자발송, 충전하기 and 이벤트.
- **Admin console:** keeps its own sidebar, so an operator always knows which
  console they are in. The sidebar turns slate navy, the active item primary,
  and every page inside uses the components above.

## Screen Patterns

These show how the components combine on PH SMS screens. Flows and steps stay as
they are; only their presentation changes.

- **Home `/`:** the sections run in this order:
  1. hero;
  2. shortcut card: Send SMS, Bulk quote, Campaigns, Sender IDs, Pricing, Help;
  3. features: a heading block on the left and four feature cards on the right;
  4. trust: five circle badges;
  5. black band: "From your list to their phone" as the flow (Add recipients →
     Write your message → Review & send), with the bulk-sending call to action;
  6. footer.

  The words for cards and badges come from the claims `/features` and
  `/how-it-works` already make. Do not carry over the reference's claims (for
  example "100 % automatic refund").
- **Log-in:**
  - a 480 px column with the title set beside a 4 px ink bar (▌);
  - a label and a 44 px field for each input;
  - a full-width primary button;
  - a row of links underneath, with "Create one" on the right.
- **Sign-up:**
  - a centred 24 px title over a 7 px #fafafa rule;
  - the form, then a full-width large primary "Submit for review".
  - The form has no terms rows today. If some are added, they use the circle
    checkboxes and the "agree to all" row. A policy nobody may miss sits in a
    box with a 3 px error-red border, as the reference does with its anti-spam
    notice.
- **List pages** (campaigns, approvals, contacts, groups, opt-outs, templates,
  admin lists): title band, section tabs, toolbar, table, pagination.
  - Contacts takes the tabs Contacts, Groups and Opt-outs.
  - Campaigns takes the tabs Campaigns and Approvals. Its toolbar has a date
    range, a status select, search, and a quiet "Download CSV" button on the
    right, which is the reference's "엑셀 다운로드".
- **Detail pages** (campaign, contact, import):
  - a summary strip of counts in Gmarket Sans (Accepted, Delivered, Rejected);
  - label and value rows (a 120–200 px #fafafa label column, 42 px rows,
    #f0f0f0 rules);
  - then the recipients table.
- **Send `/app/send`:**
  - **Steps:** the three-step wizard stays (Recipients → Message → Review), with
    the steps shown as wizard tabs.
  - **Wide screens:** the step's form sits on the left. A summary sits on the
    right and stays in view: count, parts, cost and the phone preview.
  - **Recipients:** the "Mobile numbers" box, plus a contact search that adds
    people to the list. The reference's FAQ describes this as "주소록검색" then
    "추가하기".
  - **Review:** the quote sits in label and value rows, with the total in Gmarket
    Sans, then the authorisation checkbox and a large primary "Send N messages".
- **Credits:** a balance card (Gmarket Sans 32 px in primary) with "Add credit".
  Below it, the ledger as a board table.
- **Settings:** section tabs for Profile, Sender IDs and Team. The forms use the
  label-column layout on desktop.
- **Support:** section tabs for Help and Contact support. The request form is the
  reference's inquiry form: label column, 600 px fields, a 400 px message box on
  #fafafa, and centred buttons (quiet cancel, large primary submit).
- **Dashboard:** the shortcut-card pattern. "Available credit" sits on the left
  in Gmarket Sans with "Add credit"; shortcuts sit on the right. Recent campaigns
  follow as a board table with a quiet "View all".

## Left Out

**KakaoTalk.** None of it comes across:

- the 카카오 알림톡 and 카카오 친구톡 menu entries;
- Kakao template management and the Kakao channel and chat buttons;
- AlimTalk and FriendTalk prices in "My rates";
- the Kakao hero slide and feature card;
- the 알림톡 and 친구톡 shortcuts, and the 카카오톡 FAQ category;
- the yellow colour.

**Features PH SMS does not have:**

- the API and API-results menus (PH SMS has no customer API);
- events;
- Telegram and live-chat buttons;
- the bookmark link;
- ID plus SMS-code log-in (PH SMS keeps email and password);
- Korean phone identity checks and 080 opt-out numbers;
- tax-invoice and cash-receipt pages;
- long and picture messages (PH SMS sends SMS, split into parts);
- daily and monthly statistics pages.

If PH SMS later builds any of these, they take the reference's slot for them.

**Things not copied at all:**

- the reference's logo, illustrations, photos, icon images and wording. PH SMS
  draws its own, and keeps the PH SMS wordmark with the mark recoloured to
  primary;
- its fixed pixel widths and sideways scrolling;
- text sized in viewport units;
- `user-scalable=no`;
- image-based checkboxes;
- sections that stay invisible until scrolled into view.

## Do's and Don'ts

**Do:**

- Use primary (#077d79) for every filled button, link, active tab and checked
  control. Keep Signal Teal (#0bc0b9) for decoration.
- Keep controls square, and keep rounding for floating and marketing surfaces.
- Keep tables centred and hairline-ruled, with a #fafafa head row.
- Give every status pill its word, not just its colour.
- Make the top menu work by keyboard (focus opens the panel, Escape closes it)
  and by touch (the top items are links).
- Show content without JavaScript. Entrance animations only add movement, and
  they stop under `prefers-reduced-motion`.
- Put every new label in both `en.ts` and `ko.ts`.

**Don't:**

- Put text on Signal Teal or mint in white, or set grey text lighter than
  #6b6b6b.
- Fix a width that makes a page scroll sideways. 1200 px is a maximum, not a
  width.
- Block zoom, size text in viewport units, or go below 12 px.
- Add KakaoTalk, API or event entries back to menus, shortcuts or rates.
- Copy the reference's assets or claims.

## Applying It to This Codebase

- **Tokens:** they go into the `@theme` block in `src/app/globals.css`
  (Tailwind 4).
  - Replace the brand-blue and navy scales and `--color-canvas`.
  - Keep the status and focus rules, recoloured from this file.
  - The format's README says its CLI turns this file into a Tailwind theme to
    start from: `npx @google/design.md export --format css-tailwind DESIGN.md`.
- **Fonts:**
  - Noto Sans KR comes from `next/font/google` (`Noto_Sans_KR`, weights 300,
    500 and 700) in `src/app/layout.tsx`, set as `--font-sans`.
  - Gmarket Sans comes from `next/font/local`, with its licence beside the
    files.
  - AGENTS.md asks for Next's own guide first:
    `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md`.
- **Where it lives:**
  - `src/app/(app)/layout.tsx`: the 90 px header, the account area, the quick
    menu and the footer.
  - `src/components/top-menu.tsx`: the top menu and its panel.
  - `src/components/phone-menu.tsx`: the phone menu.
  - `src/components/quick-menu.tsx`: the quick menu and "My rates".
  - `src/components/sidebar.tsx` and `src/components/mobile-nav.tsx`: the
    admin console's slate sidebar and its drawer.
  - `src/app/(public)/layout.tsx` and `src/app/(auth)/layout.tsx`: header and
    footer.
  - `src/components/ui.tsx`: Button, Card, DataTable, Field, Pill, Notice,
    PageHeader, SectionTabs and Stat.
- **Names the browser tests find controls by:**
  - "Change language" / "언어 변경";
  - "Log out";
  - the "Settings" link;
  - the "Dashboard" / "대시보드" link;
  - "Add credit" and "Create one";
  - the visitor links Features / 기능, How it works / 이용 방법, Log in / 로그인
    and Get started / 시작하기;
  - the footer's demo line;
  - the "Scrollable table" region.

  Keep these, or update the tests in the same change.
- **Before calling a restyled page done:** run `e2e/accessibility.spec.ts` and
  `e2e/responsive.spec.ts`, then both full suites.
