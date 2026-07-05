#!/usr/bin/env node
// agent-ship-fast — Stripe CLI for shipping a SaaS fast, built on the postiz-agent model:
// a pure CLI (no embedded LLM) that any AI agent — Claude Code, Cursor, whatever —
// drives via SKILL.md. Auth and API calls ride on the official `stripe` CLI.
//
//   shipfast auth:login                # browser pairing (like `postiz auth:login`)
//   shipfast saas:init --name "MyApp" --plan "Starter:9" --plan "Pro:29" --yearly --trial 14
//
// Human-readable lines go to stderr; JSON goes to stdout (pipe-friendly, jq-friendly).

import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_ENV = { ...process.env, PATH: `${process.env.HOME}/bin:${process.env.PATH}` };

// ---- .env loader (STRIPE_API_KEY optional — `stripe login` creds work too) ----
const ENV_PATH = path.join(HERE, ".env");
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) CLI_ENV[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const say = (s) => process.stderr.write(s + "\n");
const out = (obj) => process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
const die = (msg) => { say(`✗ ${msg}`); process.exit(1); };

// ---- run the official stripe CLI, parse JSON ----
function stripe(args) {
  return new Promise((resolve, reject) => {
    execFile("stripe", args, { env: CLI_ENV, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === "ENOENT") return reject(new Error("stripe CLI not found — install: https://docs.stripe.com/stripe-cli"));
        return reject(new Error((stderr || stdout || err.message).trim().split("\n").slice(-3).join(" ")));
      }
      const text = `${stdout}`.trim();
      let parsed;
      try { parsed = JSON.parse(text); } catch { return resolve(text); }
      if (parsed?.error) return reject(new Error(parsed.error.message));
      resolve(parsed);
    });
  });
}

// ---- tiny argv parser: flags become {key: value|[values]|true} ----
const [, , command, ...rest] = process.argv;
const flags = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = rest[i + 1];
    const val = next !== undefined && !next.startsWith("--") ? (i++, next) : true;
    if (flags[key] === undefined) flags[key] = val;
    else flags[key] = [].concat(flags[key], val);
  } else positional.push(a);
}
const list = (v) => (v === undefined ? [] : [].concat(v));

// ---- commands ----
const commands = {
  // ----- auth (postiz-style) -----
  "auth:login": async () => {
    say("🔐 Opening browser pairing with `stripe login`…");
    await new Promise((resolve, reject) => {
      const child = spawn("stripe", ["login"], { stdio: "inherit", env: CLI_ENV });
      child.on("exit", (c) => (c === 0 ? resolve() : reject(new Error("login failed"))));
      child.on("error", () => reject(new Error("stripe CLI not found — install: https://docs.stripe.com/stripe-cli")));
    });
    await commands["auth:status"]();
  },

  "auth:status": async () => {
    const probe = await stripe(["products", "list", "--limit", "1"]).catch((e) => { die(`not connected — run \`shipfast auth:login\` (${e.message})`); });
    let account = null;
    try { account = await stripe(["accounts", "retrieve"]); } catch { /* restricted/sandbox keys can't read the account */ }
    say("✅ Connected to Stripe (test mode).");
    out({
      connected: true,
      account_name: account?.settings?.dashboard?.display_name || account?.email || null,
      auth: CLI_ENV.STRIPE_API_KEY ? "api_key (STRIPE_API_KEY)" : "stripe login (~/.config/stripe/config.toml)",
      products_visible: probe.data?.length ?? 0,
    });
  },

  "auth:logout": async () => {
    await stripe(["logout"]).catch(() => {});
    say("👋 Logged out (note: a STRIPE_API_KEY in .env still works until removed).");
  },

  // ----- the founder one-shot -----
  // saas:init --name "MyApp" --plan "Starter:9" --plan "Pro:29" [--yearly] [--trial 14] [--currency eur]
  "saas:init": async () => {
    const name = flags.name;
    const planSpecs = list(flags.plan);
    if (!name || planSpecs.length === 0) {
      die('usage: shipfast saas:init --name "MyApp" --plan "Starter:9" [--plan "Pro:29"] [--yearly] [--trial 14] [--currency eur]');
    }
    const currency = (flags.currency || "eur").toLowerCase();
    const trial = flags.trial ? Number(flags.trial) : 0;
    const wantYearly = Boolean(flags.yearly);

    const plans = [];
    for (const spec of planSpecs) {
      const [planName, priceStr] = spec.split(":");
      const monthlyAmount = Math.round(parseFloat(priceStr) * 100);
      if (!planName || !Number.isFinite(monthlyAmount)) die(`bad --plan "${spec}" — expected "Name:price", e.g. "Pro:29"`);

      say(`📦 Creating plan ${planName} (${priceStr} ${currency}/month)…`);
      const product = await stripe(["products", "create", "--name", `${name} ${planName}`]);

      const mkPrice = (amount, interval) =>
        stripe(["prices", "create", "-d", `product=${product.id}`, "-d", `unit_amount=${amount}`, "-d", `currency=${currency}`, "-d", `recurring[interval]=${interval}`]);
      const mkLink = async (priceId) => {
        const args = ["payment_links", "create", "-d", `line_items[0][price]=${priceId}`, "-d", "line_items[0][quantity]=1"];
        if (trial > 0) args.push("-d", `subscription_data[trial_period_days]=${trial}`);
        return stripe(args);
      };

      const monthly = await mkPrice(monthlyAmount, "month");
      const monthlyLink = await mkLink(monthly.id);
      const plan = {
        plan: planName,
        product: product.id,
        monthly: { price: monthly.id, amount: monthlyAmount / 100, currency, payment_link: monthlyLink.url },
      };
      if (wantYearly) {
        const yearly = await mkPrice(monthlyAmount * 10, "year"); // 2 months free
        const yearlyLink = await mkLink(yearly.id);
        plan.yearly = { price: yearly.id, amount: (monthlyAmount * 10) / 100, currency, payment_link: yearlyLink.url };
      }
      plans.push(plan);
    }

    say("🚪 Configuring the self-serve customer portal…");
    const portal = await commands["portal:setup"]({ silent: true, headline: flags.headline || name });

    say(`🎉 ${name} is ready to sell.`);
    out({
      name,
      trial_days: trial || null,
      plans,
      customer_portal: portal,
      test_checkout: "Pay any payment_link with card 4242 4242 4242 4242, any future date, any CVC.",
      next_steps: [
        "shipfast webhooks:create --url https://yourapp.com/api/stripe (prod) or webhooks:listen --forward localhost:3000/api/stripe (dev)",
        "shipfast coupons:create --percent 20 --code LAUNCH20 (optional launch promo)",
        "Claim/upgrade your Stripe account, then switch to live keys when ready.",
      ],
    });
  },

  // ----- customer portal (self-serve: cancel, update card, invoices) -----
  "portal:setup": async (opts = {}) => {
    const cfg = await stripe([
      "billing_portal", "configurations", "create",
      "-d", `business_profile[headline]=${opts.headline || flags.headline || "Manage your subscription"}`,
      "-d", "features[invoice_history][enabled]=true",
      "-d", "features[payment_method_update][enabled]=true",
      "-d", "features[customer_update][enabled]=true",
      "-d", "features[customer_update][allowed_updates][0]=email",
      "-d", "features[subscription_cancel][enabled]=true",
      "-d", "login_page[enabled]=true",
    ]);
    const result = { configuration: cfg.id, login_url: cfg.login_page?.url || null };
    if (!opts.silent) { say("🚪 Customer portal configured."); out(result); }
    return result;
  },

  // ----- promos -----
  // coupons:create --percent 20 [--code LAUNCH20] [--duration once|forever|repeating] [--months 3]
  "coupons:create": async () => {
    if (!flags.percent && !flags.amount) die("usage: shipfast coupons:create --percent 20 [--code LAUNCH20] [--duration once]");
    const args = ["coupons", "create", "-d", `duration=${flags.duration || "once"}`];
    if (flags.percent) args.push("-d", `percent_off=${flags.percent}`);
    if (flags.amount) args.push("-d", `amount_off=${Math.round(parseFloat(flags.amount) * 100)}`, "-d", `currency=${(flags.currency || "eur").toLowerCase()}`);
    if (flags.duration === "repeating") args.push("-d", `duration_in_months=${flags.months || 3}`);
    const coupon = await stripe(args);
    let promo = null;
    if (flags.code) {
      promo = await stripe(["promotion_codes", "create", "-d", "promotion[type]=coupon", "-d", `promotion[coupon]=${coupon.id}`, "-d", `code=${flags.code}`]);
    }
    say(`🏷️  Coupon created${flags.code ? ` with code ${flags.code}` : ""}.`);
    out({ coupon: coupon.id, percent_off: coupon.percent_off, promotion_code: promo?.code || null });
  },

  // ----- webhooks -----
  DEFAULT_EVENTS: null,
  "webhooks:create": async () => {
    if (!flags.url) die("usage: shipfast webhooks:create --url https://yourapp.com/api/stripe [--events a,b,c]");
    const events = (flags.events ? String(flags.events).split(",") : [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_failed",
    ]);
    const args = ["webhook_endpoints", "create", "-d", `url=${flags.url}`];
    events.forEach((e, i) => args.push("-d", `enabled_events[${i}]=${e.trim()}`));
    const wh = await stripe(args);
    say("🪝 Webhook endpoint created — store the secret in your app env.");
    out({ id: wh.id, url: wh.url, events: wh.enabled_events, signing_secret: wh.secret });
  },

  // webhooks:listen --forward localhost:3000/api/stripe  (local dev, blocks)
  "webhooks:listen": async () => {
    if (!flags.forward) die("usage: shipfast webhooks:listen --forward localhost:3000/api/stripe");
    say(`🪝 Forwarding Stripe events to ${flags.forward} (Ctrl+C to stop)…`);
    spawn("stripe", ["listen", "--forward-to", String(flags.forward)], { stdio: "inherit", env: CLI_ENV });
  },

  // ----- read/ops commands -----
  "products:list": async () => out((await stripe(["products", "list", "--limit", String(flags.limit || 20)])).data.map((p) => ({ id: p.id, name: p.name, active: p.active }))),
  "prices:list": async () => out((await stripe(["prices", "list", "--limit", String(flags.limit || 20)])).data.map((p) => ({ id: p.id, product: p.product, amount: p.unit_amount / 100, currency: p.currency, interval: p.recurring?.interval || "one_time" }))),
  "links:list": async () => out((await stripe(["payment_links", "list", "--limit", String(flags.limit || 20)])).data.map((l) => ({ id: l.id, url: l.url, active: l.active }))),
  "customers:list": async () => out((await stripe(["customers", "list", "--limit", String(flags.limit || 20)])).data.map((c) => ({ id: c.id, email: c.email, name: c.name }))),
  "subscriptions:list": async () => out((await stripe(["subscriptions", "list", "--limit", String(flags.limit || 20)])).data.map((s) => ({ id: s.id, customer: s.customer, status: s.status }))),
  balance: async () => { const b = await stripe(["balance", "retrieve"]); out({ available: b.available, pending: b.pending }); },

  // ----- reference -----
  cards: async () => out({
    success: "4242 4242 4242 4242",
    declined: "4000 0000 0000 0002",
    requires_3ds: "4000 0025 0000 3155",
    insufficient_funds: "4000 0000 0000 9995",
    note: "Any future expiry, any CVC, any postal code. Test mode only.",
  }),

  help: async () => {
    say(`agent-ship-fast — ship your SaaS on Stripe, agent-friendly (postiz model)

Auth:
  auth:login                       Connect via browser (stripe login pairing)
  auth:status                      Check connection (live API round-trip)
  auth:logout                      Remove stripe CLI credentials

Launch:
  saas:init --name "MyApp" --plan "Starter:9" --plan "Pro:29" [--yearly] [--trial 14] [--currency eur]
                                   Products + monthly/yearly prices + payment links + customer portal
  portal:setup [--headline "…"]    Self-serve customer portal (cancel, card, invoices) + login URL
  coupons:create --percent 20 [--code LAUNCH20] [--duration once|forever|repeating]
  webhooks:create --url https://…  Webhook endpoint (returns signing secret)
  webhooks:listen --forward localhost:3000/api/stripe   Local dev forwarding

Inspect:
  products:list | prices:list | links:list | customers:list | subscriptions:list | balance
  cards                            Test card numbers

JSON on stdout, human messages on stderr.`);
  },
};
delete commands.DEFAULT_EVENTS;

const fn = commands[command || "help"];
if (!fn) { say(`✗ unknown command: ${command}`); await commands.help(); process.exit(1); }
try {
  await fn();
} catch (err) {
  die(err.message);
}
