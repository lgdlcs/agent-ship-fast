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

---

## Authentication

Check status first:
```bash
shipfast auth:status
```

If not connected, one of:
1. **Browser pairing (recommended):** `shipfast auth:login` — wraps `stripe login`, credentials stored by the stripe CLI in `~/.config/stripe/config.toml` (test-mode key, 90-day expiry).
2. **API key:** put `STRIPE_API_KEY=sk_test_...` (or a sandbox `rkcs_test_...`) in `.env` next to `cli.mjs`.
3. **No account at all?** `stripe sandbox create --email <email>` provisions a claimable sandbox without a browser; put its `secret_key` in `.env`. Limitation: sandbox keys cannot access `balance`, `accounts`, or `webhook_endpoints` — everything else works.

**Do NOT proceed with any other command until `auth:status` succeeds.**

---

## Core Workflow — ship a SaaS

```bash
# 1. Authenticate
shipfast auth:status

# 2. One-shot launch: products + monthly/yearly prices + payment links + customer portal
shipfast saas:init --name "MyApp" --plan "Starter:9" --plan "Pro:29" --yearly --trial 14

# 3. Wire the app (webhooks)
shipfast webhooks:create --url https://myapp.com/api/stripe          # prod (returns signing secret)
shipfast webhooks:listen --forward localhost:3000/api/stripe        # local dev (blocks)

# 4. Launch promo (optional)
shipfast coupons:create --percent 20 --code LAUNCH20

# 5. Verify
shipfast links:list
shipfast cards        # test card numbers for a manual checkout
```

`saas:init` returns JSON with, per plan: product id, price ids, and shareable `payment_link` URLs — plus the customer-portal login URL. Yearly price = 10× monthly (2 months free). `--trial N` adds a free trial to every payment link.

---

## Sell a product in 2 commands

Not every founder is shipping a multi-plan SaaS. Selling one thing — an ebook, a template, a lifetime deal, or a single subscription — takes two commands: create the product, then generate a page for it.

```bash
# 1. Sell anything in one call — no --interval = one-shot payment; --interval month|year = subscription
shipfast sell --name "My Ebook" --price 29 --description "150 pages of Stripe wisdom"

# 2. Generate a standalone HTML page wired to the real payment link
shipfast page:generate --out page.html

# 3. Deploy the page wherever the founder wants — this is the agent's job, not the CLI's:
#    GitHub Pages:      cp page.html docs/index.html && git add docs && git commit -m "landing" && git push
#    Cloudflare Pages:  wrangler pages deploy . --project-name my-ebook
```

`sell` returns JSON: `{product, price, mode: "one_time"|"subscription", interval, trial_days, amount, currency, payment_link, test_checkout}`. For a subscription with a free trial: `shipfast sell --name "Pro" --price 19 --interval month --trial 14`.

`page:generate` writes a **self-contained** HTML file (zero dependencies, inline CSS, responsive, basic og/twitter SEO) branched onto the real payment links — a product page with a CTA for a one-shot product, or pricing cards with a monthly/yearly toggle for a multi-plan SaaS (`--name "MyApp"` picks up the "MyApp Starter"/"MyApp Pro" products from `saas:init`; no flag → the last product created). Because it's self-contained, you can open it locally to test it (`open page.html`) before deploying. Output JSON: `{file, products, deploy_hint}`.

---

## Command Reference

| Command | What it does |
|---|---|
| `auth:login` / `auth:status` / `auth:logout` | Connect / verify (live API round-trip) / disconnect |
| `saas:init --name X --plan "Name:price" [--plan …] [--yearly] [--trial N] [--currency eur]` | Full SaaS setup in one call |
| `sell --name X --price 29 [--interval month\|year] [--trial N] [--description "…"] [--image https://…] [--currency eur]` | Sell one thing: product + price + payment link. No `--interval` = one-shot; with `--interval` = subscription |
| `page:generate [--product prod_xxx] [--name "MyApp"] [--out page.html] [--headline "…"] [--features "A\|B\|C"] [--cta "Buy now"] [--lang en\|fr]` | Self-contained HTML product/pricing page wired to real payment links |
| `portal:setup [--headline "…"]` | Self-serve customer portal (cancel, update card, invoices) + no-code login URL |
| `coupons:create --percent 20 [--code X] [--duration once\|forever\|repeating] [--months 3]` | Coupon (+ customer-facing promotion code) |
| `webhooks:create --url X [--events a,b]` | Webhook endpoint; defaults to the 5 events a SaaS needs; returns `signing_secret` |
| `webhooks:listen --forward host:port/path` | Local dev event forwarding (blocks; Ctrl+C to stop) |
| `products:list` / `prices:list` / `links:list` / `customers:list` / `subscriptions:list` | Inspect (add `--limit N`) |
| `balance` | Account balance (not available on sandbox keys) |
| `cards` | Test card numbers (success, declined, 3DS, insufficient funds) |

**Output contract:** JSON on **stdout** (parse it), human-readable progress on **stderr**. Pipe-friendly:

```bash
LINK=$(shipfast saas:init --name "MyApp" --plan "Pro:29" 2>/dev/null | jq -r '.plans[0].monthly.payment_link')
```

---

## Default webhook events

`webhooks:create` subscribes to what a subscription SaaS actually needs:
`checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Override with `--events`.

## Escape hatch

Anything not covered by a command: the official `stripe` CLI is available directly (`stripe <resource> <operation> -d "nested[param]=value"`, JSON output, `stripe resources` to discover). Same credentials. This gives the agent access to the **entire Stripe API** — anything possible via the Stripe SDK is possible here.

## Common pitfalls

- Amounts in `--plan` are in major units (`"Pro:29"` = 29.00 €); the CLI converts to cents.
- A claimable-sandbox key (`rkcs_test_`) can't read `balance`/`accounts`/`webhook_endpoints` — claim the sandbox or `auth:login` for full access.
- `webhooks:listen` blocks the shell — run it in a background terminal during dev.
- Payment links are live immediately; deactivate via `stripe payment_links update <id> -d active=false`.
- Recent Stripe API: promotion codes use `promotion[type]=coupon` + `promotion[coupon]=<id>` (the old `coupon=` parameter is gone) — the CLI handles this for you.
