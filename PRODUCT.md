# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Confirmed by the owner's master prompt, not delegated: React + TypeScript + Vite; Tailwind CSS with accessible primitives; React Router; Supabase for Postgres, Auth (Discord OAuth) and private Storage; Cloudflare Pages for static hosting; Vitest + React Testing Library, SQL security/integrity tests and Playwright where feasible; Git with a private GitHub repository.

## Users

Four to five members of AOWDEE, a FiveM gang in LUV TOWN: one Head who is the site OWNER, two Deputies, and regular members. They record in-game assets and currency by hand, often from a phone after a session and sometimes from a desktop. The owner is not a coder and follows written Thai setup steps.

## Product Purpose

A private, Thai-language bookkeeping hub for one gang. It makes the shared roster, weapons, inventory, treasury, weekly dues, vehicles, points, activities and outfits readable and editable by the right people, with every change attributed and reversible. Success means two members on different devices see the same true numbers, and an outsider or a VIEWER cannot change them.

## Positioning

The roster, ledgers and access list live in one PostgreSQL source of truth where authorization and multi-effect transactions are enforced by the database, not the screen. A spreadsheet or a Discord bot cannot truthfully offer per-member audit, frozen dues periods and single-holder vehicle contracts enforced server-side.

## Operating Context

Thai UI with 24-hour Asia/Bangkok display and UTC persistence. Manual bookkeeping of in-game assets only, with no real-money payments, transfers or game-server actions. Supabase Auth with Discord as the only sign-in. Supabase Free and Cloudflare Pages Free, including the risk of a paused project after low activity. Windows 11, T3 Code, a private GitHub repository, and deployment through Cloudflare Pages connected to GitHub.

## Capabilities and Constraints

- 30 main slots and 5 reserve slots, one stable member identity across all records, archive instead of delete.
- Site roles OWNER / EDITOR / VIEWER in an authoritative table checked per request; only allowlisted Discord identities reach private data; role changes apply to live sessions.
- One canonical inventory ledger with concurrency-safe, idempotent stock changes; one treasury ledger with integer-safe amounts; corrections are appended reversals.
- Weekly dues frozen per period at issuance, partial payments atomic with treasury, reserve members never owe dues.
- Vehicles hold at most one live contract at a time; availability derives from server time without a background job.
- Gang points and personal points are separate accounts with no transfer path.
- Private Storage buckets for vehicle, activity and outfit media with MIME and size limits.
- Every critical mutation writes an audit record with actor, subject, before and after.
- No fabricated members, balances or counters on a fresh instance.
- Open decisions: no Supabase project or Discord OAuth app exists yet; the verification environment is not chosen; production deploy needs separate owner approval.

## Brand Commitments

Name AOWDEE Gang HQ (LUV TOWN / FiveM). Pinned by the owner's brief: dark green `#011D11` with gold `#D2BB80`, Luxury Gang / Premium Minimal, no graffiti, clipart, generic AI decoration or glass cards. The original crowned-bear logo is owner-supplied at `assets/logo/aowdee-logo.png` and is the only identity mark on the public landing. It is opaque (1254×1254, field `#022C08`), so it ships as a framed plate rather than a keyed-out cutout.

## Evidence on Hand

Owner-supplied specification: `AOWDEE_T3Code_Fullstack_Master_Prompt_v2.0.md` (business rules and AC-01–AC-30), `AOWDEE_T3Code_Beginner_Workflow.md` (setup and deploy workflow), and `DESIGN.md` (a MiniMax design-system analysis used as structural reference only; its white canvas and vivid gradient palette are not adopted). The gang crest is present at `assets/logo/aowdee-logo.png`. No real member data, no balances, and no hosted project exist yet. None may be invented.

## Product Principles

1. A demonstrably correct and auditable ledger beats an impressive-looking dashboard.
2. Authorization and invariants live in the database; the UI only reflects them.
3. One canonical balance per resource, and every correction is an appended record.
4. Empty means empty; development fixtures never appear on real surfaces.
5. Thai-first legibility and fast entry at phone width come before decoration.

## Accessibility & Inclusion

WCAG AA contrast on both dark and light surfaces, full keyboard operation, visible focus, 200% zoom without loss, 44px touch targets, reduced-motion support, and no critical data reachable only by hover.
