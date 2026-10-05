# CannabisSage roadmap: from chem MVP to an AI shopping guide

Status: Living roadmap. Edit by PR; product owner is the PM.
Owners: Assay (SA/eng), Sage (product PM), Cheech (shopper reality / domain advisor)
Source of the vision: Shai's StrainChain demo (Dec 2023).
Last edit: 2026-10-05 by Assay

> How to edit: change this file in place and add a line to the Change log at the bottom. Mark open questions with `Q(<name>):`.

## North star

An AI guide that knows the shopper's taste, reads the listed chemistry on every menu nearby, knows what's in stock right now, and talks them to a good pick in plain chem terms. In the demo this is "Taylor": chat first, voice and an avatar later, backed by verified lab data from growers.

**Strategy (Shai, 2026-10-04):** build market share first with the MVP, then layer toward the vision. Every layer has to be useful on its own and ship to the Chrome Web Store.

## Guardrails that carry all the way to the vision

- No medical, effects, or treatment claims, and no dosing advice. The guide talks in chem terms, for example "high in beta-caryophyllene, close to products you rated well", and never says "relieves back pain" or "anti-inflammatory". The demo script breaks this rule, so its copy gets reworked, not reused.
- No retailer brand names in marketing, FOMO, store short description, or new UI copy (adapters, host justification, manifest, and privacy are the exceptions).
- No remote code. Data, not logic, comes from the server (denylist and partners pattern).
- Paid tier stays named Pro. Stripe stays on the cannabissage-stripe account.
- The shopper decides. The guide proposes and explains; it never places orders.

## Where we are (shipped through v1.3.17)

| Vision layer (demo) | MVP today | Status |
|---|---|---|
| Chem profile per product | Hover badges, compare, floating PDP chem panel, terpene overlap, chem-first labels | Shipped |
| Picks based on your profile | Taste map, similar-by-chem on the same menu, cross-store soft match (v1.3.17) | Partly shipped |
| Price sense | Deal vs median, $/mg | Shipped |
| Real-time availability near you | 3 supported menus, cached; no map or hours | Partly shipped |
| Verified lab results / provenance | Provenance strip, partner registry (`/partners.json`), community vs verified status | Seed shipped |
| Session memory, history, usage tracking | Nothing beyond local prefs | Not started |
| Conversational guide (chat, then voice, then avatar) | Nothing | Not started |
| Grower / supply side (batches, certificates) | Nothing | Not started, later |

## Phases

### Phase 1: Market share (now through Q1 2027, ends on the gate, not the date)
Goal: installs, weekly actives, Pro conversions. The extension is the wedge.
- Step zero: a current version approved and live on the Chrome Web Store with the generic listing. Today the store still shows v1.3.2 pending review, so every Phase 1 number is near zero until this lands. Nothing below matters more.
- Finish Q1'27: cross-store soft match (PR #22), store switcher, polish (glossary, saved menus, skins).
- More supported menus in PA, then neighboring states, through the adapter model.
- Chrome Web Store presence: listing quality, reviews, landing page FOMO.
- Measure: installs, weekly active shoppers, compare usage, Pro conversion rate.
- A(Sage) exit gate: **weekly active shoppers** (a shopper who opens Sage chem on a supported menu at least once in the week). Phase 1 exits when weekly active shoppers hold at or above the target for 4 weeks in a row **and** paid Pro conversion stays at or above its floor over the same 4 weeks. Installs alone do not count; they measure the listing, not the product.
  - Proposed targets: 1,000 weekly active shoppers; Pro conversion floor of 3% of weekly actives. These are placeholders with no baseline behind them. Re-base both 30 days after the store approves a current version, using real numbers, and record the re-based targets here.
  - If the gate is not met by the end of Q1 2027, Phase 1 keeps going, Phase 2 can still start, and Phase 4 waits.

### Phase 2: Profile and availability layer (Q2 2027)
Goal: the data the guide will need, useful on its own. Can start on the calendar even if the Phase 1 gate is not met yet.
- Free vs Pro: a local saved profile and ratings stay free. Account sync, picks across stores, and alerts are Pro, which matches today's rule that multi-store is Pro.
- Saved taste profile on the account (opt-in, synced through cannabissage.app for Pro). Ratings on products tried.
- "Picks for you" across all supported nearby menus, ranked by chem match, price, and stock.
- Availability view: which nearby supported menus list a close chem match right now, with store hours if the menu exposes them.
- Restock and deal alerts for saved items (Pro): a re-buy item is back, or lands in a deal tier that beats the shopper's value target. One daily digest, not pings.
- Q(Cheech): what does a real shopper actually want saved: favorites, "never again" list, form preferences, budget?
  - A(Cheech): all of those, plus a few things the counter forces on you. Structured fields only, no free text:
    - **Forms and sizes:** troche packs (count + total mg), live-resin carts 0.5g vs 1g, all-in-ones 1g/2g, 7g flower (smalls, ground, infused ground), occasional RSO/tincture. Hardware: 510 cart vs all-in-one.
    - **Cannabinoid ratios:** e.g. THC-only, 1:1 CBD:THC, 1:1 THC:CBG, CBN-forward (1:2 or 5:1 CBN:THC), CBD-dominant. Plus a potency band per form (e.g. cart THC % floor, total-terpene % floor).
    - **Terpenes:** top 2-3 dominant terpenes liked, plus an avoid list (e.g. "skip myrcene-led").
    - **Bought before:** product + batch, flagged re-buy / fine / never again. Three states, not 5 stars.
    - **Budget:** per-trip cap (real carts run about $240-$330 after discounts) and value targets: $/g on flower, $ per 1g cart, $/mg THC (or CBD/CBN/CBG) per form.
    - **Stores:** home store, secondary store, "only if needed" stores, driving radius.
    - **Brand lists:** loyal and avoid (producer level).
    - **Deal-tier sensitivity:** willing to stack to buy-3 / buy-6 tiers, and standing discounts the shopper qualifies for (kept local).
    - **Never save:** moods, outcomes, or health notes. The demo's mood and outcome panels go away.

#### Shopper-reality pass, Phase 2 (Cheech)
Won't help at the counter as written:
- *Ratings on products tried:* nobody rates a troche pack on a 5-star scale. Use the 3-state flag, prompt once after pickup, and prefill from order history.
- *"Picks for you":* filter by form, size, and ratio first, then rank by chem match. A great chem match in the wrong form is just noise. Rank on price **after** the deal tier, not list price.
- *Store hours:* low value, since shoppers know their store's hours. What matters is "listed now" plus how old the menu data is ("menu checked 14 min ago").
- *Price-drop alerts:* PA promos are % tiers that rotate daily or weekly, so a "price dropped" ping is mostly noise. Alert when a re-buy item comes back, or when it lands in a tier that beats the shopper's value target. One daily digest, not pings.

Missing:
- **Batch-level chem:** the same product name ships new batches with different numbers. Key the profile on batch chem, show "new batch: terpenes shifted" diffs, and show test date / COA age when listed.
  - A(Assay): sunnyside: no (no batch ID, lot number, or lab test date; `source_sku` is menu source, `mfg_date` is packaged date)
  - A(Assay): zenleaf: no (no batch ID or lot number); lab test date: yes, `labTests.testedAt` when present (`provenance.timestamp`)
  - A(Assay): terravida: no (no batch ID or lot number); lab test date: yes, `labTests.testedAt` when present (`provenance.timestamp`) — same `parseProductHtml` as zenleaf
- **Out-of-stock and restock awareness:** menus drop items silently. Show "gone since <date>" and "back" for re-buy items.
- **Deal-tier math on mixed carts:** which items count toward buy-3 / buy-6, and the cheapest cart that hits the tier. Stack standing discounts the shopper entered.
- **Multi-store compare within driving range:** the same item or closest chem match at home vs secondary store, net price after tier, distance.
- **Re-buy from order history:** import past orders (receipt emails or the menu's order history) to seed the profile. This is the biggest setup-friction cut.
  - A(Assay): v1 is a local-only import (the shopper pastes or drops a receipt; we parse it in the extension; nothing leaves the browser), and it's free. Reading receipt emails needs Gmail access and server processing, and reading a store's order-history page needs new host access to logged-in account pages. Both need a privacy policy update and a store review, so they're Pro candidates for later and need Shai's OK, not part of v1.
- **Pickup reality:** a listing doesn't guarantee shelf stock (menus lag). Many stores are debit/cash only, and you need card + ID before close. Output is a shopping list the shopper re-creates in the store's own cart.

### Phase 3: Trust layer (Q2-Q3 2027)
Goal: make the chem data more trustworthy than the menu. Runs alongside Phase 2: verified partner proof in Q2, lab certificate link-through in Q3. It comes before the chat guide on purpose, so the guide answers from data we can stand behind.
- Verified partner proof (DNS TXT or `.well-known`), then a "verified" badge.
- Lab certificate link-through when a menu or partner provides one; explore on-chain certificate lookup (Blockticity-style) as an optional source, not a dependency.
- A(Sage) partnerships: **both, split by who gets what.**
  - Shopper side: the verified badge and the lab certificate link are free for every shopper, because trust drives market share. Pro adds tools on top: a "verified lab results only" filter and alerts for verified items.
  - Supply side (B2B, Phase 5): growers, labs, and stores can pay for registration tooling and insights. Joining as a partner and getting verified stays free in Phases 3 and 4 so we build supply first.
  - Hard rule: verified status, ranking, and picks can never be bought. Verified means proof (DNS or `.well-known`, a lab certificate), never payment. Any paid placement would have to be labeled, and none is planned.

### Phase 4: Ask Sage, the chat guide (Q3-Q4 2027, gated)
Goal: the first version of the Taylor experience, inside the extension side panel and on the site.
- Starts only after the Phase 1 gate is met and the Phase 3 verified-proof work has shipped. If either slips, this phase slips with it.
- Text chat grounded only in our data: the shopper's profile, listed chem, cached menus, prices. Answers cite the products and numbers they come from.
- Session starters in chem terms: "Find something like my last favorite", "Compare these two", "What's a good value near me today", "Explain this terpene".
- Strict copy filter for medical or effects language, with a test suite, before anything ships.
- Pro feature with a small free taste.
- A(Assay) LLM path: the extension only sends a structured request to a cannabissage.app API route (Vercel). The server builds the prompt from the shopper's profile and cached listed chem, calls an org-stack provider (Anthropic or OpenRouter), runs the output filter, and returns text plus cited product ids. No model output is ever executed, and no remote code reaches the extension. Input-side deflection (Cheech's "what's good for X") runs on the server before the model is called.

#### Shopper-reality pass, Phase 4 (Cheech)
Won't help at the counter as written:
- *Chat at the counter:* nobody types paragraphs in line. Starters must be one tap, default to the saved profile filters, and answer with 1-3 picks: form, size, chem line, net price, store, menu age.
- *"Explain this terpene":* keep it to chem facts (what it is, its aroma descriptor, which in-stock listings lead with it, at what %). This is where outcome talk creeps in fastest.
- *Order:* don't ship chat before Phase 2 batch-fresh stock data exists. Chat over stale menus loses trust on the first wrong pick.

Missing:
- **Menu-age and "listed, not guaranteed" line** on every answer that names a product.
- **Cart builder output:** "this list hits the buy-3 tier for $X at your home store", given as a draft list. The shopper places the order.
- **"What's good for X" deflection:** shoppers will type outcome questions. Handle the *input* side as well as the output filter: redirect to chem preferences ("I match on cannabinoids and terpenes. Which ratio or batch have you re-bought?") and point to the store pharmacist or the shopper's practitioner.
- **Cross-store compare in chat:** the same form at home vs secondary store, net of deal tiers.
- **Memory = structured profile:** save forms, ratios, terpenes, and flags. Don't keep free-text chat logs by default (privacy, and it keeps health talk out of storage).

### Phase 5: Voice and avatar, multi-sided platform (2028 or later)
- Voice in and out, then an optional avatar persona, on the site or a mobile app.
- Grower and dispensary side: batch and certificate registration, verified listings, insights for the supply side.
- Only after the consumer side has real market share.

## Open questions
- Q(Shai): how much of the Web3 / chain-per-strain idea stays in the vision, versus verified lab data without a chain?
- Q(Cheech): top three questions a real shopper asks a budtender that we could answer from chem data alone.
  - A(Cheech):
    1. "What's in stock today that's closest to the batch I liked last time?" (top-terpene overlap + cannabinoid ratio + potency band)
    2. "What's the best $/mg in my form right now at my home store vs my second store, after the deal tier?"
    3. "Which listings match my ratio and terpene picks (e.g. 1:1 CBD:THC, limonene-led, no myrcene-heavy) and are on the menu today?"
- A(Sage): public roadmap wording is settled below. Only shipped features go under Now. Cross-store soft match is in Now after PR #22 merged.

## Draft public roadmap section (landing page)

Short, no dates, no brand names, no medical claims. Sage-approved wording:

- **Now:** Listed cannabinoids and primary terpenes on supported menus, side-by-side chem comparison, similar picks on the same menu, close matches at your other supported stores, and value math.
- **Next:** A saved taste profile, picks that match it across nearby supported menus, and restock and deal alerts.
- **Later:** Verified lab results from partners, and Ask Sage, a chat guide that explains listed chemistry in plain words.

Footer line: "Plans can change. We ship each piece when it's solid."

Copy rules for the landing section: no quarter or month anywhere, no "AI budtender", "Taylor", celebrity, or avatar promises, and no words about effects, relief, or conditions.

## Change log
- 2026-10-05 Assay: first draft from Shai's StrainChain demo and the shipped MVP.
- 2026-10-05 Sage: set the Phase 1 exit gate (weekly active shoppers plus a Pro conversion floor, placeholder targets re-based 30 days after store approval) and made store approval step zero. Partnerships are both: verified badge and certificate link free to shoppers, Pro filters and alerts on top, B2B tooling and insights in Phase 5, and verified can never be bought. Kept phase order. Phase 3 runs alongside Phase 2, and Phase 4 is gated on the Phase 1 exit and verified proof. Settled the public Now/Next/Later wording.
- 2026-10-05 Cheech: answered Q(Cheech), shopper pass on Phases 2 and 4.
- 2026-10-05 Assay: answered Q(Assay) (server-only LLM route with input and output filters), order-history import (local-only v1, email and store-account import later with Shai's OK), and changed "price-drop alerts" to "restock and deal alerts" in Phase 2 and the public Next line, per Cheech. Batch ID / test date in the 3 adapters is checked in the repo PR.
- 2026-10-05: moved into the repo.
- 2026-10-05 Assay: moved cross-store soft match into public Now after PR #22 merged (v1.3.17).
