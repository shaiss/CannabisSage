# CannabisSage roadmap

Status: Living roadmap. Edit by PR.

## North star

Help shoppers understand listed cannabinoids and terpenes, compare products on the page, and find close chem matches across nearby supported menus—in plain chem terms. Longer term: a chat guide that knows the shopper’s taste, reads listed chemistry on nearby menus, knows what’s listed now, and talks them to a good pick without placing the order.

## Guardrails

- No medical, effects, or treatment claims, and no dosing advice. Talk in listed chemistry only.
- No remote code. The extension ships its own logic; the server may send data and config, not executable code.
- The shopper decides. CannabisSage proposes and explains; it never places orders.
- Paid tier stays named Pro.

## Where we are

| Layer | Today | Status |
|---|---|---|
| Chem profile per product | Hover badges, compare, floating product-page chem panel, terpene overlap, chem-first labels | Shipped |
| Picks based on your profile | Taste map, similar-by-chem on the same menu, cross-store soft match (Pro) | Partly shipped |
| Price sense | Deal vs median, $/mg | Shipped |
| Real-time availability near you | Supported menus, cached; no map | Partly shipped |
| Verified lab results / provenance | Provenance strip, partner registry, community vs verified status | Seed shipped |
| Session memory / order history | Local prefs only | Not started |
| Conversational guide (chat, then voice, then avatar) | Nothing | Not started |
| Grower / supply side | Nothing | Later |

## Phases

### 1. Market share (now)

Grow installs and everyday use of chem on supported menus. Free covers hover badges, compare, similar picks on the same menu, and product-page chem. Pro adds taste-map match, filters and sort, export, deal and $/mg badges, and chem insights across more supported stores—including jumping to a close match on another supported store when that data is already saved.

Ship each piece when it is solid. More supported menus through the adapter model. Landing and store listing stay generic: no retailer names in marketing copy.

**Exit gate:** Phase 1 ends when weekly active shoppers (someone who opens Sage chem on a supported menu at least once that week) hold at or above the target for 4 weeks in a row **and** paid Pro conversion stays at or above its floor over the same 4 weeks. Installs alone do not count. Targets are set from real usage after a current version is live in the store, and recorded here when re-based. If the gate is not met on the calendar, Phase 1 keeps going; Phase 2 can still start; Phase 4 waits.

### 2. Profile and availability

The data the guide will need, useful on its own. Can start even if the Phase 1 gate is not met yet.

- Free vs Pro: a local saved profile and ratings stay free. Account sync, picks across stores, and alerts are Pro.
- Saved taste profile (opt-in). Structured fields only—no free-text moods or health notes: forms and sizes, cannabinoid ratios and potency bands, liked and avoid terpenes, bought-before flags (re-buy / fine / never again), per-trip budget and value targets, home and secondary stores, brand loyal/avoid lists, deal-tier sensitivity.
- “Picks for you” across nearby supported menus: filter by form, size, and ratio first, then rank by chem match and net price after deal tier.
- Availability: which nearby menus list a close chem match right now, plus how old the menu data is. Restock and deal alerts for saved items (Pro)—one daily digest, not pings.
- Batch-aware chem: key the profile on batch chem when listed; show “new batch: terpenes shifted” and test date / COA age when the menu exposes them.
- **Order and receipt import:** v1 is local-only and free—the shopper pastes or drops a receipt; parsing stays in the extension; nothing leaves the browser. Reading receipt emails (e.g. Gmail) or a store’s logged-in order-history page needs new access, a privacy update, and a store review; those are Pro candidates later and need an explicit product-owner OK before work starts.

### 3. Trust layer

Runs alongside Phase 2. Verified partner proof first, then lab certificate link-through when a menu or partner provides one.

- Verified badge from proof (DNS TXT or `.well-known`), never from payment.
- Shopper-facing verified badge and certificate link stay free; Pro can add a “verified lab results only” filter and alerts for verified items.
- Hard rule: verified status, ranking, and picks can never be bought.

**Order relative to chat:** this layer ships before Ask Sage so the guide answers from data we can stand behind.

### 4. Ask Sage (chat guide)

Gated: starts only after the Phase 1 exit gate is met **and** Phase 3 verified-proof work has shipped. If either slips, this phase slips.

- Text chat in the extension side panel and on the site, grounded only in our data: the shopper’s profile, listed chem, cached menus, prices. Answers cite the products and numbers they come from.
- One-tap session starters in chem terms (not long typing at the counter): find something like a re-buy, compare two, good value near me today, explain this terpene in chem facts only.
- Pro feature with a small free taste.
- Strict copy filter for medical or effects language, with a test suite, before anything ships. Outcome questions on the **input** side are deflected to chem preferences and to the store pharmacist or the shopper’s practitioner.
- Every answer that names a product includes menu age and a “listed, not guaranteed” line.
- Memory stays the structured profile; free-text chat logs are not kept by default.

**How the model is called:** the extension only sends a structured request to a cannabissage.app API route. The server builds the prompt from the shopper’s profile and cached listed chem, calls a model provider, runs the output filter, and returns text plus cited product ids. No model output is ever executed, and no remote code reaches the extension. Input-side deflection runs on the server before the model is called.

### 5. Voice, avatar, and grower side

Voice in and out, then an optional avatar, plus later B2B and partner work for growers and menus. Verified status and ranking can never be bought. Only after the consumer side has real market share.

## Landing page (public summary)

Kept short on cannabissage.app:

- **Now:** Listed cannabinoids and primary terpenes on supported menus, side-by-side chem comparison, similar picks on the same menu, close matches at your other supported stores, and value math.
- **Next:** A saved taste profile, picks that match it across nearby supported menus, and restock and deal alerts.
- **Later:** Verified lab results from partners, and Ask Sage, a chat guide that explains listed chemistry in plain words.

Footer: “Plans can change. We ship each piece when it’s solid.” The landing page does not link to this file.
