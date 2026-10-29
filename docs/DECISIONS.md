# Decisions

Durable decisions that later work must not silently reverse. Newest last.

## 2026-10-29 · Design direction

The owner chose MiniMax's structural grammar with AOWDEE's own palette. The structural reference is `DESIGN.md` in the briefs: 4px rhythm, pill controls, dense tables, one typeface, oversized display. Its white canvas and vivid gradient cards are not adopted. The committed world is documented in `DESIGN.md` as "The Counting Room".

## 2026-10-29 · Logo asset

The owner supplied the crest at `assets/logo/aowdee-logo.png`. Measured: 1254×1254 px, 24bpp RGB, no alpha channel, opaque field `#022C08`. It is the only identity mark on the landing. Because it cannot be keyed out, it ships as a framed plate on a calibrated field.

## 2026-10-29 · Owner bootstrap identity

The Head's Discord user ID is `477456950104293378`. It is a public identifier, not a secret. Bootstrap must bind this ID to a verified Supabase Discord identity (`auth.identities`, provider `discord`, `identity_data->>'sub'`), never to a browser-supplied value or editable `user_metadata`. No "first user wins" path is permitted.

## 2026-10-29 · Verification environment

Pending owner choice between a hosted Supabase Free development project and a local Docker stack. Security and transaction gates G2–G4 need runtime evidence from one of them.

## 2026-10-29 · Build approval

The plan was presented and is awaiting explicit approval. No application code has been written.
