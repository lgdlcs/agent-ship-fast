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

// ---- pixel-art banner (stderr only; never stdout, so JSON/pipes stay clean) ----
const BANNER_LINES = [
  "█▀▀▀ █  █ ▀█▀ █▀▀█ █▀▀▀ ▄▀▀▄ █▀▀▀ ▀▀█▀▀",
  "█▄▄▄ █▄▄█  █  █▄▄█ █▄▄▄ █▄▄█ █▄▄▄   █",
  "   █ █  █  █  █    █    █  █    █   █",
  "▀▀▀▀ ▀  ▀ ▀▀▀ ▀    ▀    ▀  ▀ ▀▀▀▀   ▀",
];
const BANNER_TAGLINE = "ship your SaaS fast ⚡";
function banner() {
  const color = Boolean(process.stderr.isTTY) && !process.env.NO_COLOR;
  const shades = [27, 33, 39, 45]; // 256-color blue → cyan gradient
  const width = Math.max(...BANNER_LINES.map((l) => [...l].length));
  const pad = Math.max(0, Math.floor((width - [...BANNER_TAGLINE].length) / 2));
  const tag = " ".repeat(pad) + BANNER_TAGLINE;
  const lines = BANNER_LINES.map((l, i) => (color ? `\x1b[38;5;${shades[i]}m${l}\x1b[0m` : l));
  lines.push(color ? `\x1b[2m${tag}\x1b[0m` : tag);
  say("\n" + lines.join("\n") + "\n");
}

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
const str = (v) => (typeof v === "string" ? v : "");

// ---- HTML page helpers (used by page:generate) ----
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const CUR = { eur: (a) => `${a} €`, usd: (a) => `$${a}`, gbp: (a) => `£${a}`, chf: (a) => `${a} CHF` };
const fmtMoney = (amount, currency) => (CUR[currency] || ((a) => `${a} ${String(currency).toUpperCase()}`))(amount);
const PAGE_CSS = `*{box-sizing:border-box;margin:0;padding:0}
:root{--accent:#2563eb;--ink:#0f172a;--muted:#64748b;--bg:#f8fafc;--card:#fff;--line:#e2e8f0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);line-height:1.5;-webkit-font-smoothing:antialiased}
.wrap{max-width:1080px;margin:0 auto;padding:64px 24px}
.product{max-width:640px;text-align:center}
.hero-img{max-width:180px;height:auto;margin:0 auto 24px;border-radius:16px}
h1{font-size:2.4rem;font-weight:800;letter-spacing:-.02em}
.lead{color:var(--muted);font-size:1.15rem;margin:16px auto 28px;max-width:34em}
.features{list-style:none;text-align:left;max-width:22em;margin:0 auto 32px}
.features li{padding:8px 0 8px 30px;position:relative}
.features li::before{content:"✓";position:absolute;left:0;color:var(--accent);font-weight:700}
.price{font-size:2.6rem;font-weight:800;margin:8px 0 24px}
.cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;padding:14px 34px;border-radius:999px;font-size:1.05rem;transition:opacity .15s}
.cta:hover{opacity:.9}
.head{text-align:center;margin-bottom:40px}
.head h1{margin-bottom:12px}
.toggle{display:flex;justify-content:center;gap:4px;background:#eef2f7;border-radius:999px;padding:4px;width:max-content;margin:0 auto 40px}
.toggle button{border:0;background:transparent;padding:8px 20px;border-radius:999px;font:inherit;font-weight:600;color:var(--muted);cursor:pointer}
.toggle button.active{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.1)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;align-items:start}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:32px 26px;text-align:center}
.card.featured{border-color:var(--accent);transform:scale(1.04);box-shadow:0 12px 30px rgba(37,99,235,.15)}
.card h2{font-size:1.3rem;margin-bottom:14px}
.card .price{font-size:2.2rem;margin:6px 0 20px}
.badge{display:none;background:#dcfce7;color:#166534;font-size:.78rem;font-weight:700;padding:3px 10px;border-radius:999px;margin-bottom:14px}
body.show-yearly .badge{display:inline-block}
footer{text-align:center;color:var(--muted);padding:32px;font-size:.9rem}
@media(max-width:640px){.grid{grid-template-columns:1fr}.card.featured{transform:none}h1{font-size:1.9rem}}`;

function pageHead({ lang, title, desc, image }) {
  const og = image ? `\n<meta property="og:image" content="${esc(image)}">` : "";
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">${og}
<meta name="twitter:card" content="summary_large_image">
<style>${PAGE_CSS}</style>
</head>`;
}

function buildProductPage({ lang, name, headline, description, image, features, priceLabel, cta, href }) {
  const metaDesc = headline || description || name;
  const feats = features.length ? `\n  <ul class="features">${features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : "";
  const img = image ? `\n  <img class="hero-img" src="${esc(image)}" alt="${esc(name)}">` : "";
  const lead = headline || description ? `\n  <p class="lead">${esc(headline || description)}</p>` : "";
  return `${pageHead({ lang, title: name, desc: metaDesc, image })}
<body>
<main class="wrap product">${img}
  <h1>${esc(name)}</h1>${lead}${feats}
  <div class="price">${esc(priceLabel)}</div>
  <a class="cta" href="${esc(href)}">${esc(cta)}</a>
</main>
<footer>Powered by <strong>Stripe</strong></footer>
</body>
</html>`;
}

function buildPricingPage({ lang, t, title, headline, description, image, cta, cards, hasToggle }) {
  const metaDesc = headline || description || title;
  const lead = headline || description ? `<p class="lead">${esc(headline || description)}</p>` : "";
  const toggle = hasToggle
    ? `\n  <div class="toggle">
    <button id="btn-m" class="active" onclick="setYear(false)">${esc(t.monthly)}</button>
    <button id="btn-y" onclick="setYear(true)">${esc(t.yearly)}</button>
  </div>`
    : "";
  const cardsHtml = cards.map((c) => {
    const badge = c.hasYearly ? `\n    <span class="badge">${esc(t.freebadge)}</span>` : "";
    return `  <div class="card${c.featured ? " featured" : ""}">
    <h2>${esc(c.label)}</h2>${badge}
    <div class="price" data-m="${esc(c.mLabel)}" data-y="${esc(c.yLabel)}">${esc(c.mLabel)}</div>
    <a class="cta" href="${esc(c.mHref)}" data-hm="${esc(c.mHref)}" data-hy="${esc(c.yHref)}">${esc(cta)}</a>
  </div>`;
  }).join("\n");
  const script = hasToggle
    ? `\n<script>
function setYear(y){
  document.getElementById('btn-y').classList.toggle('active',y);
  document.getElementById('btn-m').classList.toggle('active',!y);
  document.body.classList.toggle('show-yearly',y);
  document.querySelectorAll('.price').forEach(function(el){var v=y?el.dataset.y:el.dataset.m;if(v)el.textContent=v;});
  document.querySelectorAll('.cta').forEach(function(el){var h=y?el.dataset.hy:el.dataset.hm;if(h)el.href=h;});
}
</script>`
    : "";
  return `${pageHead({ lang, title, desc: metaDesc, image })}
<body>
<main class="wrap">
  <div class="head"><h1>${esc(title)}</h1>${lead}</div>${toggle}
  <div class="grid">
${cardsHtml}
  </div>
</main>
<footer>Powered by <strong>Stripe</strong></footer>${script}
</body>
</html>`;
}

// ---- distribution registry (local persistent state in CWD, zero network) ----
const DIST_PATH = path.join(process.cwd(), "distribution.json");
const DIRECTORIES = [
  { slug: "producthunt", name: "Product Hunt", submit: "https://www.producthunt.com/posts/new", pricing: "free", dofollow: false },
  { slug: "smollaunch", name: "SmolLaunch", submit: "https://smollaunch.com/submit", pricing: "free", dofollow: true },
  { slug: "launchingnext", name: "Launching Next", submit: "https://www.launchingnext.com/submit/", pricing: "freemium", dofollow: true },
  { slug: "devhunt", name: "DevHunt", submit: "https://devhunt.org/", pricing: "free", dofollow: true },
  { slug: "uneed", name: "Uneed", submit: "https://www.uneed.best/submit-a-tool", pricing: "freemium", dofollow: true },
  { slug: "peerlist", name: "Peerlist", submit: "https://peerlist.io/launchpad", pricing: "free", dofollow: true },
  { slug: "betalist", name: "BetaList", submit: "https://betalist.com/submit", pricing: "freemium", dofollow: false },
  { slug: "microlaunch", name: "MicroLaunch", submit: "https://microlaunch.net/", pricing: "freemium", dofollow: true },
  { slug: "fazier", name: "Fazier", submit: "https://fazier.com/submit", pricing: "freemium", dofollow: true },
  { slug: "saashub", name: "SaaSHub", submit: "https://www.saashub.com/submit-service", pricing: "freemium", dofollow: false },
  { slug: "alternativeto", name: "AlternativeTo", submit: "https://alternativeto.net/manage-item/", pricing: "free", dofollow: false },
  { slug: "indiehackers", name: "Indie Hackers", submit: "https://www.indiehackers.com/products", pricing: "free", dofollow: false },
  { slug: "showhn", name: "Show HN", submit: "https://news.ycombinator.com/submit", pricing: "free", dofollow: false },
  { slug: "toolfolio", name: "Toolfolio", submit: "https://toolfolio.io/submit", pricing: "freemium", dofollow: true },
];

const slugify = (s) => String(s ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const normUrl = (u) => {
  let s = String(u ?? "").trim();
  const h = s.indexOf("#"); if (h >= 0) s = s.slice(0, h);
  const q = s.indexOf("?"); if (q >= 0) s = s.slice(0, q);
  return s.replace(/\/+$/, "").toLowerCase();
};
const distHint = "run `shipfast target --name … --url …` first";
function loadDist() {
  if (!fs.existsSync(DIST_PATH)) die(`no distribution.json here — ${distHint}`);
  try { return JSON.parse(fs.readFileSync(DIST_PATH, "utf8")); }
  catch { die(`distribution.json is invalid JSON — ${distHint}`); }
}
const saveDist = (d) => fs.writeFileSync(DIST_PATH, JSON.stringify(d, null, 2) + "\n");

// ---- commands ----
const commands = {
  // ----- onboarding diagnostic (never exits non-zero — it's a health check) -----
  init: async () => {
    banner();
    let stripe_cli = false, stripe_version = null;
    try {
      const v = await stripe(["version"]);
      stripe_version = String(v).trim().split("\n")[0].replace(/^stripe\s+version\s+/i, "").trim() || String(v).trim();
      stripe_cli = true;
      say(`✓ stripe CLI ${stripe_version}`);
    } catch {
      say("✗ stripe CLI not found");
      say("  → install: https://docs.stripe.com/stripe-cli  (brew install stripe/stripe-cli/stripe, or a GitHub release)");
    }

    let connected = false, mode = null, products = null;
    try {
      const probe = await stripe(["products", "list", "--limit", "1"]);
      connected = true;
      products = probe.data?.length ?? 0;
      const first = probe.data?.[0];
      if (first && typeof first.livemode === "boolean") mode = first.livemode ? "live" : "test";
      else mode = (CLI_ENV.STRIPE_API_KEY || "").startsWith("sk_live") ? "live" : "test";
      say(`✓ connected to Stripe (${mode} mode)`);
    } catch {
      say("✗ not connected");
      say("  → run `shipfast login`, or set STRIPE_API_KEY=sk_test_… in .env");
    }

    const next = [];
    if (!connected) next.push("shipfast login");
    else if (products === 0) {
      next.push('shipfast sell --name "My Ebook" --price 29');
      next.push('shipfast launch --name "MyApp" --plan "Pro:29"');
    } else {
      next.push("shipfast page");
      next.push("shipfast list products");
    }
    say("");
    say("Next steps:");
    next.forEach((n) => say(`  → ${n}`));

    out({ stripe_cli, stripe_version, connected, mode, products, next });
  },

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
    const probe = await stripe(["products", "list", "--limit", "1"]).catch((e) => { die(`not connected — run \`shipfast login\` (${e.message})`); });
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
      die('usage: shipfast launch --name "MyApp" --plan "Starter:9" [--plan "Pro:29"] [--yearly] [--trial 14] [--currency eur]');
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
        `shipfast page --name "${name}" (generate a ready-to-deploy pricing page)`,
        "shipfast hook --url https://yourapp.com/api/stripe (prod) or shipfast listen --forward localhost:3000/api/stripe (dev)",
        "shipfast promo --percent 20 --code LAUNCH20 (optional launch promo)",
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

  // ----- sell a single thing (one-shot product or subscription) -----
  // sell --name "Mon Ebook" --price 29 [--interval month|year] [--trial 14] [--description "…"] [--image https://…] [--currency eur]
  "sell": async () => {
    const name = flags.name;
    if (!name || !flags.price) {
      die('usage: shipfast sell --name "Mon Ebook" --price 29 [--interval month|year] [--trial 14] [--description "…"] [--image https://…] [--currency eur]');
    }
    const amount = Math.round(parseFloat(flags.price) * 100);
    if (!Number.isFinite(amount)) die(`bad --price "${flags.price}" — expected a number, e.g. 29`);
    const currency = (flags.currency || "eur").toLowerCase();
    const interval = flags.interval && flags.interval !== true ? String(flags.interval) : null;
    if (interval && interval !== "month" && interval !== "year") die('--interval must be "month" or "year"');
    const trial = flags.trial ? Number(flags.trial) : 0;
    if (trial > 0 && !interval) die("--trial requires --interval month|year");
    const recurring = Boolean(interval);

    say(`📦 Creating product ${name} (${flags.price} ${currency}${recurring ? `/${interval}` : ", one-time"})…`);
    const prodArgs = ["products", "create", "--name", name];
    if (flags.description) prodArgs.push("-d", `description=${flags.description}`);
    if (flags.image) prodArgs.push("-d", `images[0]=${flags.image}`);
    const product = await stripe(prodArgs);

    say("💶 Creating price…");
    const priceArgs = ["prices", "create", "-d", `product=${product.id}`, "-d", `unit_amount=${amount}`, "-d", `currency=${currency}`];
    if (recurring) priceArgs.push("-d", `recurring[interval]=${interval}`);
    const price = await stripe(priceArgs);

    say("🔗 Creating payment link…");
    const linkArgs = ["payment_links", "create", "-d", `line_items[0][price]=${price.id}`, "-d", "line_items[0][quantity]=1"];
    if (trial > 0) linkArgs.push("-d", `subscription_data[trial_period_days]=${trial}`);
    const link = await stripe(linkArgs);

    say(`🎉 ${name} is ready to sell.`);
    out({
      product: product.id,
      price: price.id,
      mode: recurring ? "subscription" : "one_time",
      interval: interval,
      trial_days: trial || null,
      amount: amount / 100,
      currency,
      payment_link: link.url,
      test_checkout: "Pay the payment_link with card 4242 4242 4242 4242, any future date, any CVC.",
    });
  },

  // ----- generate a self-contained product/pricing page wired to payment links -----
  // page:generate [--product prod_xxx] [--name "MyApp"] [--out page.html] [--headline "…"] [--features "A|B|C"] [--cta "Buy now"] [--lang en|fr]
  "page:generate": async () => {
    const lang = flags.lang === "fr" ? "fr" : "en";
    const t = lang === "fr"
      ? { month: "/mois", year: "/an", monthly: "Mensuel", yearly: "Annuel", freebadge: "2 mois offerts", buy: "Acheter" }
      : { month: "/mo", year: "/yr", monthly: "Monthly", yearly: "Yearly", freebadge: "2 months free", buy: "Buy now" };
    const headline = str(flags.headline) || null;
    const cta = str(flags.cta) || t.buy;
    const namePrefix = str(flags.name);
    const features = str(flags.features).split("|").map((s) => s.trim()).filter(Boolean);

    // ---- collect products ----
    let products;
    if (str(flags.product)) {
      products = [await stripe(["products", "retrieve", str(flags.product)])];
    } else if (namePrefix) {
      const all = await stripe(["products", "list", "--limit", "100", "-d", "active=true"]);
      products = (all.data || []).filter((p) => p.name && p.name.startsWith(namePrefix));
    } else {
      const recent = await stripe(["products", "list", "--limit", "1", "-d", "active=true"]);
      products = recent.data || [];
    }
    if (!products.length) die("no product found — pass --product prod_… or --name, or create one with launch / sell");

    // ---- payment links (fetched once, matched by first line-item price) ----
    const linksResp = await stripe(["payment_links", "list", "--limit", "100", "-d", "expand[]=data.line_items"]);
    const links = (linksResp.data || []).filter((l) => l.active);
    const linkForPrice = (priceId) => links.find((l) => l.line_items?.data?.[0]?.price?.id === priceId)?.url || null;

    // ---- prices per product (only those with an active payment link survive) ----
    const collected = [];
    for (const p of products) {
      const pricesResp = await stripe(["prices", "list", "-d", `product=${p.id}`, "-d", "active=true"]);
      const prices = [];
      for (const pr of pricesResp.data || []) {
        const link = linkForPrice(pr.id);
        if (!link) { say(`⚠️  price ${pr.id} (${p.name}) has no active payment link — skipping`); continue; }
        prices.push({ price: pr.id, interval: pr.recurring?.interval || "one_time", amount: (pr.unit_amount || 0) / 100, currency: pr.currency, payment_link: link });
      }
      if (prices.length) collected.push({ product: p.id, name: p.name, image: p.images?.[0] || null, description: p.description || null, prices });
    }
    if (!collected.length) die("no usable (price + payment link) found — create links with launch or sell");

    const isProduct = collected.length === 1 && collected[0].prices.length === 1 && collected[0].prices[0].interval === "one_time";
    const mode = isProduct ? "product" : "pricing";
    let html;

    if (mode === "product") {
      const c = collected[0];
      const pr = c.prices[0];
      html = buildProductPage({
        lang, name: c.name, headline, description: c.description, image: c.image, features,
        priceLabel: fmtMoney(pr.amount, pr.currency), cta, href: pr.payment_link,
      });
    } else {
      const label = (n) => (namePrefix && n.startsWith(namePrefix) ? n.slice(namePrefix.length).trim() || n : n);
      const cards = collected.map((c) => {
        const monthly = c.prices.find((x) => x.interval === "month");
        const yearly = c.prices.find((x) => x.interval === "year");
        const other = c.prices.find((x) => x.interval === "one_time") || c.prices[0];
        const mBase = monthly || other, yBase = yearly || other;
        const mSuf = monthly ? t.month : (mBase.interval === "year" ? t.year : ""), ySuf = yearly ? t.year : (yBase.interval === "month" ? t.month : "");
        return {
          label: label(c.name), hasYearly: Boolean(yearly),
          mLabel: fmtMoney(mBase.amount, mBase.currency) + mSuf, mHref: mBase.payment_link,
          yLabel: fmtMoney(yBase.amount, yBase.currency) + ySuf, yHref: yBase.payment_link,
        };
      });
      const featIdx = cards.length >= 3 ? Math.floor(cards.length / 2) : cards.length - 1;
      cards.forEach((c, i) => { c.featured = i === featIdx; });
      const hasToggle = collected.some((c) => c.prices.some((x) => x.interval === "month") && c.prices.some((x) => x.interval === "year"));
      html = buildPricingPage({
        lang, t, title: namePrefix || collected[0].name, headline, description: collected[0].description,
        image: collected.find((c) => c.image)?.image || null, cta, cards, hasToggle,
      });
    }

    const outPath = path.resolve(str(flags.out) || "./page.html");
    fs.writeFileSync(outPath, html);
    say(`🖼️  Page written to ${outPath}`);
    out({
      file: outPath,
      mode,
      products: collected.map((c) => ({ product: c.product, name: c.name, prices: c.prices })),
      deploy_hint: "Static file — deploy anywhere (GitHub Pages, Cloudflare Pages, Netlify) or open locally.",
    });
  },

  // ----- promos -----
  // coupons:create --percent 20 [--code LAUNCH20] [--duration once|forever|repeating] [--months 3]
  "coupons:create": async () => {
    if (!flags.percent && !flags.amount) die("usage: shipfast promo --percent 20 [--code LAUNCH20] [--duration once]");
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
    if (!flags.url) die("usage: shipfast hook --url https://yourapp.com/api/stripe [--events a,b,c]");
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
    if (!flags.forward) die("usage: shipfast listen --forward localhost:3000/api/stripe");
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

  // ----- distribution registry (local, no network) -----
  // target --name "MyApp" --url https://… [--keywords "a|b|c"] [--audience "…"]  |  no flags → show profile
  target: async () => {
    const anyFlag = flags.name || flags.url || flags.keywords || flags.audience;
    if (!anyFlag) {
      const d = loadDist();
      const done = (d.launch || []).filter((l) => l.status === "done").length;
      out({ product: d.product || null, opportunities: (d.opportunities || []).length, launch_done: done, launch_total: (d.launch || []).length });
      return;
    }
    if (!flags.name || flags.name === true || !flags.url || flags.url === true) {
      die('usage: shipfast target --name "MyApp" --url https://myapp.com [--keywords "a|b|c"] [--audience "…"]');
    }
    let d = null;
    if (fs.existsSync(DIST_PATH)) { try { d = JSON.parse(fs.readFileSync(DIST_PATH, "utf8")); } catch { d = null; } }
    if (!d || typeof d !== "object") d = {};
    d.product = d.product && typeof d.product === "object" ? d.product : {};
    d.product.name = str(flags.name);
    d.product.url = str(flags.url);
    if (flags.keywords && flags.keywords !== true) d.product.keywords = str(flags.keywords).split("|").map((s) => s.trim()).filter(Boolean);
    else d.product.keywords = d.product.keywords || [];
    if (flags.audience && flags.audience !== true) d.product.audience = str(flags.audience);
    else d.product.audience = d.product.audience || null;
    d.opportunities = d.opportunities || [];
    d.links = d.links || [];
    if (!Array.isArray(d.launch) || !d.launch.length) {
      d.launch = DIRECTORIES.map((x) => ({ slug: x.slug, name: x.name, submit: x.submit, pricing: x.pricing, dofollow: x.dofollow, status: "todo", submission_url: null }));
    }
    saveDist(d);
    const done = d.launch.filter((l) => l.status === "done").length;
    out({ product: d.product, opportunities: d.opportunities.length, launch_done: done, launch_total: d.launch.length });
  },

  // found --url https://… --title "…" --channel reddit [--note "…"]
  found: async () => {
    if (!flags.url || flags.url === true || !flags.title || flags.title === true || !flags.channel || flags.channel === true) {
      die('usage: shipfast found --url https://… --title "…" --channel reddit [--note "…"]');
    }
    const d = loadDist();
    d.opportunities = d.opportunities || [];
    const key = normUrl(flags.url);
    const dupe = d.opportunities.find((o) => normUrl(o.url) === key);
    if (dupe) { out({ duplicate: true, id: dupe.id, status: dupe.status }); return; }
    const id = d.opportunities.reduce((m, o) => Math.max(m, o.id || 0), 0) + 1;
    d.opportunities.push({
      id, url: str(flags.url), title: str(flags.title), channel: str(flags.channel),
      status: "new", found_at: new Date().toISOString(), reply_link: null,
      note: flags.note && flags.note !== true ? str(flags.note) : null, skip_reason: null,
    });
    saveDist(d);
    out({ id, status: "new", total_new: d.opportunities.filter((o) => o.status === "new").length });
  },

  // opps [--status new|replied|skipped]
  opps: async () => {
    const d = loadDist();
    let items = d.opportunities || [];
    if (flags.status && flags.status !== true) items = items.filter((o) => o.status === flags.status);
    out(items.map((o) => ({ id: o.id, status: o.status, channel: o.channel, title: o.title, url: o.url, found_at: o.found_at, reply_link: o.reply_link })));
  },

  // replied <id> --link <permalink>
  replied: async () => {
    const id = Number(positional[0]);
    if (positional[0] === undefined || !Number.isFinite(id)) die("usage: shipfast replied <id> --link <permalink>");
    if (!flags.link || flags.link === true) die("usage: shipfast replied <id> --link <permalink>");
    const d = loadDist();
    const o = (d.opportunities || []).find((x) => x.id === id);
    if (!o) die(`no opportunity with id ${id} — see \`shipfast opps\``);
    o.status = "replied";
    o.reply_link = str(flags.link);
    saveDist(d);
    out({ id, status: "replied", reply_link: o.reply_link });
  },

  // skip <id> [--reason "…"]
  skip: async () => {
    const id = Number(positional[0]);
    if (positional[0] === undefined || !Number.isFinite(id)) die('usage: shipfast skip <id> [--reason "…"]');
    const d = loadDist();
    const o = (d.opportunities || []).find((x) => x.id === id);
    if (!o) die(`no opportunity with id ${id} — see \`shipfast opps\``);
    o.status = "skipped";
    o.skip_reason = flags.reason && flags.reason !== true ? str(flags.reason) : null;
    saveDist(d);
    out({ id, status: "skipped", skip_reason: o.skip_reason });
  },

  // plan [--done <slug> --url <submission>]
  plan: async () => {
    const d = loadDist();
    d.launch = d.launch || [];
    if (flags.done && flags.done !== true) {
      const entry = d.launch.find((l) => l.slug === flags.done);
      if (!entry) die(`unknown directory slug "${flags.done}" — see \`shipfast plan\``);
      entry.status = "done";
      if (flags.url && flags.url !== true) entry.submission_url = str(flags.url);
      saveDist(d);
      out({ slug: entry.slug, status: "done", submission_url: entry.submission_url });
      return;
    }
    const done = d.launch.filter((l) => l.status === "done").length;
    const todo = d.launch.length - done;
    say(`Launch directories — ${done} done / ${todo} todo`);
    for (const l of d.launch) say(`  ${l.status === "done" ? "✓" : "○"} ${l.name}${l.submission_url ? ` → ${l.submission_url}` : ""}`);
    out({ done, todo, directories: d.launch.map((l) => ({ slug: l.slug, name: l.name, submit: l.submit, pricing: l.pricing, dofollow: l.dofollow, status: l.status, submission_url: l.submission_url })) });
  },

  // link --channel <slug> [--to <url>]  (defaults to product.url; idempotent per channel)
  link: async () => {
    if (!flags.channel || flags.channel === true) die("usage: shipfast link --channel <slug> [--to <url>]");
    const d = loadDist();
    d.links = d.links || [];
    const channel = str(flags.channel);
    const existing = d.links.find((l) => l.channel === channel);
    if (existing) { out({ channel, url: existing.url, existing: true }); return; }
    const base = flags.to && flags.to !== true ? str(flags.to) : (d.product && d.product.url);
    if (!base) die("no --to url and no product.url set — run `shipfast target --url …` first");
    let url;
    try {
      const u = new URL(base);
      u.searchParams.set("utm_source", channel);
      u.searchParams.set("utm_medium", "agent-scout");
      u.searchParams.set("utm_campaign", slugify(d.product && d.product.name));
      url = u.toString();
    } catch { die(`invalid url "${base}"`); }
    d.links.push({ channel, url });
    saveDist(d);
    out({ channel, url });
  },

  // report — full distribution snapshot
  report: async () => {
    const d = loadDist();
    const opps = d.opportunities || [];
    const count = (s) => opps.filter((o) => o.status === s).length;
    const byChannel = {};
    for (const o of opps) byChannel[o.channel] = (byChannel[o.channel] || 0) + 1;
    const launch = d.launch || [];
    const launchDone = launch.filter((l) => l.status === "done").length;
    const times = opps.map((o) => o.found_at).filter(Boolean).sort();
    const r = {
      product: (d.product && d.product.name) || null,
      opportunities: { new: count("new"), replied: count("replied"), skipped: count("skipped"), by_channel: byChannel },
      launch: { done: launchDone, todo: launch.length - launchDone },
      links: (d.links || []).length,
      last_activity: times.length ? times[times.length - 1] : null,
    };
    say(`📊 ${r.product || "(no product)"} — opps ${r.opportunities.new} new / ${r.opportunities.replied} replied / ${r.opportunities.skipped} skipped · launch ${r.launch.done}/${launch.length} · ${r.links} links`);
    out(r);
  },

  help: async () => { banner(); say(HELP_TEXT); },
};
delete commands.DEFAULT_EVENTS;

const HELP_TEXT = `Get started:
  init                             Diagnose setup (stripe CLI, auth, mode) + next steps
  login                            Connect via browser (stripe login pairing)
  status                           Check connection (live API round-trip)

Sell:
  sell --name "Mon Ebook" --price 29   [--interval month|year] [--trial 14] [--image https://…]
  launch --name "MyApp" --plan "Starter:9" --plan "Pro:29"   [--yearly] [--trial 14]
  page [--name "MyApp" | --product prod_…]   [--out page.html] [--features "A|B|C"] [--lang en|fr]

Grow:
  promo --percent 20 [--code LAUNCH20] [--duration once|forever|repeating]
  portal [--headline "…"]          Self-serve customer portal (cancel, card, invoices)
  hook --url https://yourapp.com/api/stripe [--events a,b,c]
  listen --forward localhost:3000/api/stripe

Distribute:
  target --name "MyApp" --url https://myapp.com   [--keywords "a|b|c"] [--audience "…"]  (no flags → show profile)
  found --url https://… --title "…" --channel reddit   [--note "…"]
  opps [--status new|replied|skipped]
  replied <id> --link <permalink>
  skip <id> [--reason "…"]
  plan [--done <slug> --url <submission>]
  link --channel <slug> [--to <url>]
  report                           Distribution snapshot (opps, launch, links)

Inspect:
  list products|prices|links|customers|subscriptions
  balance                          Available + pending funds
  cards                            Test card numbers

Long forms still work (auth:login, saas:init, page:generate, …). JSON on stdout, human messages on stderr.`;

// ---- short verbs → canonical command keys (resolved before lookup) ----
const ALIASES = {
  login: "auth:login", status: "auth:status", logout: "auth:logout",
  launch: "saas:init", page: "page:generate", promo: "coupons:create",
  portal: "portal:setup", hook: "webhooks:create", listen: "webhooks:listen",
};

let cmd = command || "help";
if (cmd === "list") {
  const what = positional[0];
  const known = { products: 1, prices: 1, links: 1, customers: 1, subscriptions: 1 };
  if (!what || !known[what]) die("usage: shipfast list products|prices|links|customers|subscriptions");
  cmd = `${what}:list`;
} else if (ALIASES[cmd]) {
  cmd = ALIASES[cmd];
}

const fn = commands[cmd];
if (!fn) { banner(); say(`✗ unknown command: ${command}`); say(HELP_TEXT); process.exit(1); }
try {
  await fn();
} catch (err) {
  die(err.message);
}
