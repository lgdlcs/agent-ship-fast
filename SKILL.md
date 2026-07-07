---
name: agent-ship-fast
description: Ship a SaaS on Stripe in minutes — products, recurring prices, payment links, customer portal, coupons, webhooks — via a single agent-friendly CLI built on the official stripe CLI.
homepage: https://github.com/lgdlcs/agent-ship-fast
---

| Property | Value |
|----------|-------|
| **name** | agent-ship-fast |
| **description** | Stripe SaaS-launcher CLI for AI agents (postiz-agent model) |
| **allowed-tools** | Bash(shipfast:*), Bash(node cli.mjs:*) |

---

## ⚠️ Two Hard Rules (Read First)

**Rule 1 — Authenticate before anything.** All commands fail without a Stripe connection.

**Rule 2 — Test mode first.** Everything here targets Stripe TEST mode. Never switch a founder to live keys without their explicit confirmation. Test checkouts use card `4242 4242 4242 4242` (see `cards`).

**Rule 3 — Never post on the founder's behalf.** Scout, draft, track — the founder clicks publish. This applies to every distribution reply and every launch submission (see *Distribute*).

---

## Authentication

Start with `shipfast init` — it draws the banner, runs the full diagnostic (stripe CLI present? connected? test/live mode? how many products) and prints the contextual next step. Then confirm the connection:
```bash
shipfast status          # long form: auth:status
```

If not connected, one of:
1. **Browser pairing (recommended):** `shipfast login` (= `auth:login`) — wraps `stripe login`, credentials stored by the stripe CLI in `~/.config/stripe/config.toml` (test-mode key, 90-day expiry).
2. **API key:** put `STRIPE_API_KEY=sk_test_...` (or a sandbox `rkcs_test_...`) in `.env` next to `cli.mjs`.
3. **No account at all?** `stripe sandbox create --email <email>` provisions a claimable sandbox without a browser; put its `secret_key` in `.env`. Limitation: sandbox keys cannot access `balance`, `accounts`, or `webhook_endpoints` — everything else works.

**Do NOT proceed with any other command until `status` succeeds.**

---

## Core Workflow — ship a SaaS

```bash
# 1. Front door: banner + diagnostic (stripe CLI, connection, mode, product count) + next step
shipfast init

# 2. One-shot launch: products + monthly/yearly prices + payment links + customer portal
shipfast launch --name "MyApp" --plan "Starter:9" --plan "Pro:29" --yearly --trial 14

# 3. Wire the app (webhooks)
shipfast hook --url https://myapp.com/api/stripe                    # prod (returns signing secret)
shipfast listen --forward localhost:3000/api/stripe                 # local dev (blocks)

# 4. Launch promo (optional)
shipfast promo --percent 20 --code LAUNCH20

# 5. Verify
shipfast list links
shipfast cards        # test card numbers for a manual checkout
```

`launch` (= `saas:init`) returns JSON with, per plan: product id, price ids, and shareable `payment_link` URLs — plus the customer-portal login URL. Yearly price = 10× monthly (2 months free). `--trial N` adds a free trial to every payment link.

---

## Sell a product in 2 commands

Not every founder is shipping a multi-plan SaaS. Selling one thing — an ebook, a template, a lifetime deal, or a single subscription — takes two commands: create the product, then generate a page for it.

```bash
# 1. Sell anything in one call — no --interval = one-shot payment; --interval month|year = subscription
shipfast sell --name "My Ebook" --price 29 --description "150 pages of Stripe wisdom"

# 2. Generate a standalone HTML page wired to the real payment link
shipfast page --out page.html

# 3. Deploy the page wherever the founder wants — this is the agent's job, not the CLI's:
#    GitHub Pages:      cp page.html docs/index.html && git add docs && git commit -m "landing" && git push
#    Cloudflare Pages:  wrangler pages deploy . --project-name my-ebook
```

`sell` returns JSON: `{product, price, mode: "one_time"|"subscription", interval, trial_days, amount, currency, payment_link, test_checkout}`. For a subscription with a free trial: `shipfast sell --name "Pro" --price 19 --interval month --trial 14`.

`page` (= `page:generate`) writes a **self-contained** HTML file (zero dependencies, inline CSS, responsive, basic og/twitter SEO) branched onto the real payment links — a product page with a CTA for a one-shot product, or pricing cards with a monthly/yearly toggle for a multi-plan SaaS (`--name "MyApp"` picks up the "MyApp Starter"/"MyApp Pro" products from `launch`; no flag → the last product created). Because it's self-contained, you can open it locally to test it (`open page.html`) before deploying. Output JSON: `{file, products, deploy_hint}`.

---

## Distribute: the daily scout

Monetization gets the founder paid. Distribution gets them found. The CLI doubles as a **local distribution registry** — `distribution.json` lives in the product folder, versionable in the product's own repo. **No network calls, no Reddit API, no scraping, no auto-posting.** The positioning is simple:

> **Your agent scouts, the founder posts — human-scale, no Reddit API.**

You find conversations the way a human would: normal web search and browsing (`site:reddit.com <keyword>`, X search, niche forums, Indie Hackers threads). You never touch the Reddit API, never scrape at scale, never post anything yourself.

### The daily routine

```bash
# 1. Read the product profile (set it once with target --name … --url …)
shipfast target --name "MyApp" --url https://myapp.com --keywords "invoicing|freelance|stripe" --audience "solo founders"
shipfast target                    # no flags → print the current profile
```

Then, once per day:

1. **Read the profile** — `shipfast target` tells you what the product does, who it's for, and the keywords to search on.
2. **Search for real, recent problems** — conversations from the **last 7 days** where the audience has a problem the product genuinely solves. Recency matters: a dead thread is a dead reply.
3. **Hold a strict quality bar** — **max 2–3 opportunities per day.** A reply must be useful *even if it never mentions the product*. Mention the product **at most once**, and only when it's the honest answer. Volume is the enemy here; one great reply beats ten generic ones.
4. **Record each opportunity** — `shipfast found --url <thread> --title "…" --channel reddit [--note "…"]`. If it returns `{duplicate: true}`, you've already logged that URL — skip it and move on.
5. **Draft a value-first reply** and present it to the founder with two mandatory lines:
   - `Why:` — why this conversation, why now (recency, fit, the specific pain).
   - `Success =` — what tells us it worked (an upvote, a "thanks, trying it", a click, a reply from OP).
6. **Add a tracked link only if a link is justified** — `shipfast link --channel reddit` returns the product URL with UTM tags so the founder can attribute the traffic later.
7. **The founder validates and posts it themselves.** After they publish, record it: `shipfast replied <id> --link <permalink>`. If the founder passes, `shipfast skip <id> --reason "…"`.

```bash
shipfast found --url https://reddit.com/r/SaaS/comments/abc --title "How do you handle invoicing?" --channel reddit
shipfast opps                      # list everything logged
shipfast opps --status new         # only the ones awaiting a decision
shipfast replied 3 --link https://reddit.com/r/SaaS/comments/abc/xyz
shipfast skip 4 --reason "OP already solved it"
shipfast link --channel reddit     # tracked product URL for this channel
```

### Launch playbook

For directory launches, `shipfast plan` ships a checklist of 14 embedded directories (Product Hunt, Smol Launch, Launching Next, DevHunt, Uneed, Peerlist, BetaList, Microlaunch, Fazier, SaaSHub, AlternativeTo, Indie Hackers, Show HN, Toolfolio).

```bash
shipfast plan                                    # the launch checklist, done/todo
shipfast plan --done producthunt --url https://www.producthunt.com/posts/myapp
shipfast report                                  # weekly registry stats
```

**Don't submit to all 14.** Pick the **3–4** that actually fit the product (a dev tool → DevHunt + Show HN + Peerlist; a consumer app → Product Hunt + BetaList). Submit them **manually** — a hand-filled submission beats an automated one every time — then check them off with `plan --done`. Run `shipfast report` weekly to see opportunities by status/channel, launches done vs. todo, tracked links, and last activity.

---

## Command Reference

Short verbs are the default; the `long form` in the last column is an equivalent alias.

| Command | What it does | Long form |
|---|---|---|
| `init` | Welcome screen: banner + diagnostic (stripe CLI, connection, mode, product count) + next step. JSON: `{stripe_cli, stripe_version, connected, mode, products, next}` | — |
| `login` / `status` / `logout` | Connect / verify (live API round-trip) / disconnect | `auth:login` / `auth:status` / `auth:logout` |
| `launch --name X --plan "Name:price" [--plan …] [--yearly] [--trial N] [--currency eur]` | Full SaaS setup in one call | `saas:init` |
| `sell --name X --price 29 [--interval month\|year] [--trial N] [--description "…"] [--image https://…] [--currency eur]` | Sell one thing: product + price + payment link. No `--interval` = one-shot; with `--interval` = subscription | — |
| `page [--product prod_xxx] [--name "MyApp"] [--out page.html] [--headline "…"] [--features "A\|B\|C"] [--cta "Buy now"] [--lang en\|fr]` | Self-contained HTML product/pricing page wired to real payment links | `page:generate` |
| `portal [--headline "…"]` | Self-serve customer portal (cancel, update card, invoices) + no-code login URL | `portal:setup` |
| `promo --percent 20 [--code X] [--duration once\|forever\|repeating] [--months 3]` | Coupon (+ customer-facing promotion code) | `coupons:create` |
| `hook --url X [--events a,b]` | Webhook endpoint; defaults to the 5 events a SaaS needs; returns `signing_secret` | `webhooks:create` |
| `listen --forward host:port/path` | Local dev event forwarding (blocks; Ctrl+C to stop) | `webhooks:listen` |
| `list products` / `list prices` / `list links` / `list customers` / `list subscriptions` | Inspect (add `--limit N`) | `products:list` / `prices:list` / … |
| `balance` | Account balance (not available on sandbox keys) | — |
| `cards` | Test card numbers (success, declined, 3DS, insufficient funds) | — |
| `target [--name X --url https://… ] [--keywords "a\|b\|c"] [--audience "…"]` | Set the product distribution profile + init the launch checklist; no flags → print the profile | — |
| `found --url <thread> --title "…" --channel reddit [--note "…"]` | Log a reply opportunity; dedupes by URL → `{duplicate: true}` if already seen | — |
| `opps [--status new\|replied\|skipped]` | List logged opportunities | — |
| `replied <id> --link <permalink>` | Mark an opportunity as replied (after the founder posts) | — |
| `skip <id> [--reason "…"]` | Mark an opportunity as skipped | — |
| `plan [--done <slug> --url <submission>]` | Launch checklist (14 embedded directories); `--done` checks one off | — |
| `link --channel <slug> [--to <url>]` | Product URL with UTM tags (`utm_source=<channel>&utm_medium=agent-scout&utm_campaign=<product>`), idempotent | — |
| `report` | Distribution registry stats (opportunities by status/channel, launch done/todo, links, last activity) | — |

**Output contract:** JSON on **stdout** (parse it), human-readable progress on **stderr**. Pipe-friendly:

```bash
LINK=$(shipfast launch --name "MyApp" --plan "Pro:29" 2>/dev/null | jq -r '.plans[0].monthly.payment_link')
```

---

## Default webhook events

`hook` (= `webhooks:create`) subscribes to what a subscription SaaS actually needs:
`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Override with `--events`.

## Escape hatch

Anything not covered by a command: the official `stripe` CLI is available directly (`stripe <resource> <operation> -d "nested[param]=value"`, JSON output, `stripe resources` to discover). Same credentials. This gives the agent access to the **entire Stripe API** — anything possible via the Stripe SDK is possible here.

## Common pitfalls

- Amounts in `--plan` are in major units (`"Pro:29"` = 29.00 €); the CLI converts to cents.
- A claimable-sandbox key (`rkcs_test_`) can't read `balance`/`accounts`/`webhook_endpoints` — claim the sandbox or `auth:login` for full access.
- `listen` (= `webhooks:listen`) blocks the shell — run it in a background terminal during dev.
- Payment links are live immediately; deactivate via `stripe payment_links update <id> -d active=false`.
- Recent Stripe API: promotion codes use `promotion[type]=coupon` + `promotion[coupon]=<id>` (the old `coupon=` parameter is gone) — the CLI handles this for you.
