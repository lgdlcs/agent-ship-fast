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

Prereqs: Node 18+, the official stripe CLI ([docs](https://docs.stripe.com/stripe-cli)). Nothing to install — `npx` runs it straight from npm:

```bash
# Start here: the welcome screen — diagnostic + your next steps
npx agent-ship-fast init

# Sell a 29€ ebook (no --interval = one-shot payment)
npx agent-ship-fast sell --name "My Ebook" --price 29 --description "150 pages of Stripe wisdom"
```

Prefer the short `shipfast` command everywhere? Install it globally once:

```bash
npm i -g agent-ship-fast     # gives you the `shipfast` binary
shipfast init
```

`init` is the front door: it draws the banner, checks your setup, and tells you exactly what to run next.

```text
  ▄▄▄ ▄▄▄ ▄▄ ▄▄▄▄ ▄▄▄▄ ▄▄▄ ▄▄▄ ▄▄▄▄
  ███ ███ ██ ███  ███  ███ ███ ███    S H I P F A S T
  ▀▀▀ ▀▀▀ ▀▀ ▀▀   ▀▀   ▀▀▀ ▀▀▀ ▀▀

  ✓ stripe CLI v1.43.6
  ✓ connected to Stripe (test mode)
  · 0 products yet
  → next: shipfast sell --name "My Ebook" --price 29
```

### The founder one-shot

```bash
shipfast login    # browser pairing with your Stripe account (test mode)
shipfast launch --name "MyApp" --plan "Starter:9" --plan "Pro:29" --yearly --trial 14
```

That single `launch` call creates the products, the monthly + yearly prices, live payment-link checkout pages with a 14-day trial, and the customer portal — and prints everything as JSON.

### From source (alternative)

```bash
git clone https://github.com/lgdlcs/agent-ship-fast.git
cd agent-ship-fast
npm link          # installs the `shipfast` command
shipfast init
```

Just selling one thing? Two commands and you have a page to deploy:

```bash
# Sell a 29€ ebook (no --interval = one-shot payment), then generate its page
shipfast sell --name "My Ebook" --price 29 --description "150 pages of Stripe wisdom"
shipfast page --out page.html
```

`page.html` is self-contained (inline CSS, zero deps) and wired to the real payment link — open it locally to test, then deploy it wherever you like (GitHub Pages, Cloudflare Pages…). Deploying is the agent's job, not the CLI's.

## Use it with an AI agent

Tell your agent (e.g. Claude Code):

> Read SKILL.md and launch my SaaS "MyApp" with a Pro plan at 29€/month, yearly option, 14-day trial. Then create a 20% launch coupon LAUNCH20.

The agent does the rest. **Output contract:** JSON on stdout, human messages on stderr — pipe-friendly, `jq`-friendly, agent-friendly.

## Commands

Short verbs are the default; the longer `foo:bar` forms still work as aliases.

```
init             # welcome screen: banner + diagnostic + next steps
login | status | logout                          (= auth:login | auth:status | auth:logout)
launch --name "MyApp" --plan "Starter:9" [--plan …] [--yearly] [--trial 14] [--currency eur]   (= saas:init)
sell --name "My Ebook" --price 29 [--interval month|year] [--trial 14] [--description "…"] [--image https://…]
page [--product prod_xxx] [--name "MyApp"] [--out page.html] [--headline "…"] [--features "A|B|C"] [--cta "…"] [--lang en|fr]   (= page:generate)
portal [--headline "…"]                           (= portal:setup)
promo --percent 20 [--code LAUNCH20] [--duration once|forever|repeating]   (= coupons:create)
hook --url https://… | listen --forward localhost:3000/api/stripe   (= webhooks:create | webhooks:listen)
list products | list prices | list links | list customers | list subscriptions   (= products:list | …)
balance | cards  # account balance | test card numbers
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
