<!-- SEED: established with the user before implementation; re-run $impeccable document once there's code to capture the actual tokens and components. -->

---
name: AOWDEE Gang HQ
description: A private Thai bookkeeping hub for one FiveM gang, built as a dark emerald ledger room with brass instruments.
---

# Design System: AOWDEE Gang HQ

## Overview

**Creative North Star: "The Counting Room"**

A private back room with green baize, a brass lamp, and one ledger that everyone trusts. The product is not a dashboard about a gang. It is the room where the gang's numbers are kept, entered by hand, and checked before anyone acts on them. The visual world borrows from club ledgers, brass instruments, and engraved stationery rather than from gaming HUDs or SaaS analytics.

Two rooms, one system. The public landing is the closed door. It is deep emerald, nearly black, with the crowned-bear crest lit by a single warm key and thin brass rules that behave like inlay, not glow. The private app is the ledger on the table. Its chrome stays emerald, but every working surface is warm bone paper so Thai text and long tables stay readable under room light.

The system is flat, quiet, and exact. Depth comes from tonal steps and 1px hairlines, never from glass, blur, or floating cards. Brass is an instrument. It marks the one action that matters, the current state, and the edge of the active row. It never fills a surface.

**Key Characteristics:**
- Deep emerald ground (`#011D11`) with warm bone paper (`#F6F3EA`) for every data surface
- Brass gold (`#D2BB80`) reserved for action, state, and 1px rules, never for large fills
- One Thai-native typeface carries display, UI, and numerals
- Pill controls everywhere; rectangular tables and code only
- Numbers are the decoration: large, tabular, and always labelled with a unit
- The owner-supplied crest is the only image on the landing, presented as a plate with a brass hairline

## Colors

A near-black green field, a warm paper working surface, and one brass accent. No third hue competes.

### Primary
- **Emerald Ground** (`#011D11`): The page field for the landing, app chrome, navigation, and dialogs on dark. It is the room.
- **Emerald Raised** (`#06271A`): Panels and rows that sit on the ground without a shadow.
- **Emerald Panel** (`#0A3323`): Hovered nav items, selected rows, and inset blocks on dark.

### Secondary
- **Brass** (`#D2BB80`): Primary action fill, focus ring, active tab underline, and the 1px rules that frame the crest. Maximum one brass fill per viewport section.
- **Brass Deep** (`#A98F4F`): Pressed state and brass text on bone paper where `#D2BB80` fails contrast.

### Neutral
- **Bone Paper** (`#F6F3EA`): Every working content surface, table background, form field, and dialog body.
- **Bone Dim** (`#E7E0CF`): Table header rows, secondary panels, and dividers on paper.
- **Ink** (`#14180F`): Primary text on paper.
- **Ink Muted** (`#5A5F52`): Metadata, captions, and table labels on paper.
- **Cream Text** (`#F4EFE2`): Primary text on emerald; never pure white.
- **Cream Muted** (`#A9B3A4`): Secondary text on emerald.

### Tertiary
- **Signal Rust** (`#B4472F`): Overdue dues, destructive confirmation, and negative deltas. Text and icons only, never a large fill.
- **Signal Moss** (`#3F7F5A`): Paid, active, and positive deltas. Text and small badges only.

### Named Rules

**The Instrument Rule.** Brass marks action or state change. It may fill a button, underline an active tab, or draw a 1px rule. It never fills a card, a header, or a chart area.

**The Two Rooms Rule.** Public surfaces are emerald, working surfaces are bone paper. One viewport belongs to one room; do not place a dark panel and a paper panel side by side as competing fields.

**The Crest Field Rule.** The supplied logo is opaque with a `#022C08` field. Present it as a square plate framed by a 1px brass rule, and calibrate the surrounding landing field toward `#022C08` so the plate reads as inlay. Never chroma-key the crest out.

## Typography

**Display Font:** Anuphan (with IBM Plex Sans Thai, sans-serif)
**Body Font:** Anuphan (with IBM Plex Sans Thai, sans-serif)
**Label/Mono Font:** Anuphan, tabular numerals

**Character:** A loopless Thai grotesque with a calm, engineered voice. It replaces the Latin-only reference face because every heading and table must carry Thai first. Hierarchy comes from weight, size, and tracking, never from a second family.

### Hierarchy
- **Display** (600, clamp 40–64px, 1.10, -0.02em): Landing crest wordmark and the single promise line. Latin only on this surface.
- **Headline** (600, 32px, 1.25): Page titles such as `ภาพรวมแก๊ง` and `คลังของกลาง`.
- **Title** (600, 20px, 1.35): Card titles and member names.
- **Body** (400, 16px, 1.60): Thai prose and form text; max 68ch on paper.
- **Label** (600, 13px, 1.40, +0.04em): Table headers, field labels, and status chips. Thai labels are not uppercased.
- **Numeral** (600, 28px, 1.10, `font-variant-numeric: tabular-nums`): Balances, counts, and remaining time. Always paired with a unit such as `เงินในแก๊ง` or `ชม.`.

### Named Rules

**The One Typeface Rule.** Anuphan carries Thai, Latin, and numerals. Introducing a second display face is a regression.

**The Unit Rule.** A number never appears alone. Every balance, count, and duration carries its Thai label and unit in the same block.

## Layout

A 4px rhythm with an 8px working increment. The landing uses a single centred column at 1280px maximum with 32px gutters, 96px above the crest and 64px between sections. The private app uses a 12-column grid inside 1200px with 24px gutters.

The app shell is a 64px top bar on emerald, with the crest at 32px, the five primary destinations, and one brass pill for the primary action. Below 1024px the bar collapses to a compact header plus a sheet menu; the table column set collapses to label and value pairs rather than horizontal scroll for primary records.

Dashboard composition follows the five owner priorities. Row one is three equal cards at 4 columns each: slot occupancy, dues overdue, cars held or expiring. Row two is points at 4 columns and the activity board at 8 columns. Nothing else competes for the first screen.

Records use dense paper tables with 44px rows, 16px horizontal padding, and a header row on Bone Dim. Detail views use a two-column layout at 1024px and above, 320px of context on the left and the editable record on the right, collapsing to one column on phones.

## Elevation & Depth

The system is flat by default and uses tonal layering plus 1px hairlines. No glass, no backdrop blur, no glow, no ambient gradient behind content. Depth is conveyed by three emerald steps on dark and by the paper-to-bone step on light.

### Shadow Vocabulary
- **Dialog only** (`box-shadow: 0 24px 48px -12px rgba(1, 29, 17, 0.45)`): Modal sheets and confirmation dialogs that must separate from the page.
- **Sticky bar** (`box-shadow: 0 1px 0 rgba(210, 187, 128, 0.18)`): The top bar once content scrolls under it, expressed as a brass hairline rather than a blur.

### Named Rules

**The No Glass Rule.** Translucency, blur, and gradient washes are prohibited. If a surface needs separation, change its tone or draw a hairline.

## Shapes

Corners are softly cut, never fully rounded on containers. Controls are the exception and are always pills.

- Inputs and small controls: 12px
- Paper cards and table containers: 16px
- Feature panels and dialogs: 24px
- Landing crest plate: 32px
- Buttons, chips, tabs, and badges: full pill

Borders are 1px. On emerald they are `rgba(210, 187, 128, 0.18)`. On paper they are Bone Dim. The crest plate carries a 1px brass rule at 40% and 24px of breathing room inside.

## Do's and Don'ts

### Do:
- **Do** keep brass to one fill per section and use it for the single next action.
- **Do** put every table, form, and long Thai paragraph on Bone Paper.
- **Do** show `LV` numerically beside every weapon level, with the number never hidden by color alone.
- **Do** use 44px minimum touch targets and visible `:focus-visible` rings in brass at 2px with a 2px offset.
- **Do** format every timestamp in 24-hour Asia/Bangkok and label the unit.
- **Do** keep the landing to one crest, one promise line, and one entry action above the fold.

### Don't:
- **Don't** use neon, neon gradients, glow, scanlines, or gaming HUD chrome.
- **Don't** use glassmorphism, frosted cards, or floating translucent panels.
- **Do not** introduce graffiti, clipart, stock mascots, or AI-generated decoration.
- **Don't** use pure black `#000000` or pure white `#FFFFFF` as a surface or text color.
- **Don't** show fabricated members, balances, or counters on any real surface.
- **Don't** encode status by color alone; pair every signal with a Thai label.
- **Don't** place critical data behind hover only; every hover summary has a tap and focus equivalent.
