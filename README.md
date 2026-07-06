# agent-ship-fast

**Ship a SaaS on Stripe in minutes — driven by your AI agent.**

A pure CLI (no embedded LLM, no API key to buy) built on the [postiz-agent](https://github.com/gitroomhq/postiz-agent) model: the agent you already have — Claude Code, Cursor, whatever — reads [`SKILL.md`](./SKILL.md) and drives the CLI for you. Create your products, checkout links and product pages — one-time or subscriptions — in a couple of commands. One command sets up everything a founder needs to start charging:

- 📦 Products + recurring prices (monthly / yearly with 2 months free)
- 💳 Shareable payment links (checkout pages, free trials included)
- 🛒 Sell one thing in one command — ebook, template, lifetime deal, or a single subscription
- 📄 Standalone product / pricing pages (self-contained HTML, wired to the real payment links)
- 🚪 Self-serve customer portal (cancel, update card, invoices)
- 🏷️ Coupons + promotion codes
- 🪝 Webhooks (prod endpoints + local dev forwarding)

## Quick start

```bash
# Prereqs: Node 18+, the official stripe CLI (https://docs.stripe.com/stripe-cli)
git clone https://github.com/lgdlcs/agent-ship-fast.git
cd agent-ship-fast
npm link          # installs the `shipfast` command

shipfast auth:login   # browser pairing with your Stripe account (test mode)

# The founder one-shot:
shipfast saas:init --name "MyApp" --plan "Starter:9" --plan "Pro:29" --yearly --trial 14
```

That single `saas:init` call creates the products, the monthly + yearly prices, live payment-link checkout pages with a 14-day trial, and the customer portal — and prints everything as JSON.

Just selling one thing? Two commands and you have a page to deploy:

```bash
# Sell a 29€ ebook (no --interval = one-shot payment), then generate its page
shipfast sell --name "My Ebook" --price 29 --description "150 pages of Stripe wisdom"
shipfast page:generate --out page.html
```

`page.html` is self-contained (inline CSS, zero deps) and wired to the real payment link — open it locally to test, then deploy it wherever you like (GitHub Pages, Cloudflare Pages…). Deploying is the agent's job, not the CLI's.

## Use it with an AI agent

Tell your agent (e.g. Claude Code):

> Read SKILL.md and launch my SaaS "MyApp" with a Pro plan at 29€/month, yearly option, 14-day trial. Then create a 20% launch coupon LAUNCH20.

The agent does the rest. **Output contract:** JSON on stdout, human messages on stderr — pipe-friendly, `jq`-friendly, agent-friendly.

## Commands

```
auth:login | auth:status | auth:logout
saas:init --name "MyApp" --plan "Starter:9" [--plan …] [--yearly] [--trial 14] [--currency eur]
sell --name "My Ebook" --price 29 [--interval month|year] [--trial 14] [--description "…"] [--image https://…]
page:generate [--product prod_xxx] [--name "MyApp"] [--out page.html] [--headline "…"] [--features "A|B|C"] [--cta "…"] [--lang en|fr]
portal:setup [--headline "…"]
coupons:create --percent 20 [--code LAUNCH20] [--duration once|forever|repeating]
webhooks:create --url https://… | webhooks:listen --forward localhost:3000/api/stripe
products:list | prices:list | links:list | customers:list | subscriptions:list | balance
cards            # test card numbers
```

Full agent documentation (rules, workflow, pitfalls): [`SKILL.md`](./SKILL.md).

## Everything else Stripe can do

Commands cover the 20% that launches 80% of SaaS. For the rest, the official `stripe` CLI is the escape hatch — same credentials, entire Stripe API:

```bash
stripe checkout sessions create -d "line_items[0][price]=price_…" -d "mode=subscription" …
```

## Safety

- **Test mode first.** SKILL.md instructs agents to never switch to live keys without explicit founder confirmation.
- No Stripe key is ever committed — auth lives in `~/.config/stripe/config.toml` (via `stripe login`) or a local `.env`.

## License

MIT
