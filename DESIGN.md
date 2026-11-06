# DESIGN.md — the single design contract

This is the only design source of truth. If a value here disagrees with a stylesheet, the
stylesheet is wrong. If you need a value that is not here, add it here first.

`css/tokens.css` is the machine-readable form of §1 and §2. Do not duplicate this document into
another token file — one contract, not three. (Q14: `docs/design/design-tokens.{css,json}` were
deleted; they were never linked from `index.html` and had already drifted from the shipped palette.)

---

## 1. Colour

Forest `#4a653b` is the brand green in **both** themes, used as a **ramp**. Gold inverts role
between themes: it is **ink** on dark, a **surface** on light. Never gold ink on a light surface.

| Role | Light | Dark | Notes |
|---|---|---|---|
| canvas | `#f8fafc` | `#060a07` | painted on `<html>` |
| surface | `#ffffff` | `rgba(255,255,255,.045)` | cards, panels |
| surface-2 | `#f1f5f9` | `rgba(255,255,255,.07)` | nested panels |
| surface-muted | `#f8f9fa` | `rgba(255,255,255,.04)` | inline info strips |
| border | `#e2e8f0` | `rgba(255,255,255,.08)` | |
| border-strong | `#cbd5e1` | `rgba(255,255,255,.16)` | |
| ink | `#0f172a` | `#eef6ee` | body text |
| ink-muted | `#64748b` | `#a3b59d` | secondary text |
| primary | `var(--forest-500)` `#4a653b` | same | **FILL ONLY — see §1.1** |
| primary-hover | `#38502d` | `#587947` | |
| accent-fill | `#f5d347` (gold) | `transparent` | gold as a surface |
| accent-ink-on-fill | `#26200a` | `#f5d347` | text ON gold |
| accent-soft | `#fef3c7` | `rgba(245,211,71,.14)` | |
| accent-soft-ink | `#7a6108` | `#f5d347` | the only gold usable as ink on light |
| danger | `#b91c1c` | `#f87171` | |
| warning | `#92400e` | `#fcd34d` | |
| info | `#1d4ed8` | `#93c5fd` | |
| success | `#047857` | `#6ee7b7` | |

### 1.1 The one colour rule that has already caused a bug

`--primary` is **forest `#4a653b` in both themes**. On the light canvas that is 6.24:1 (AAA-safe).
On the dark canvas `#060a07` it is **3.05:1 — below AA**.

**`--primary` is a fill colour. Never use it as `color:`.**
Use `var(--success)` for confirming text, `var(--ink)` for body, `var(--accent-soft-ink)` for gold
text on light. This was found live in `.success` and in a JS-injected span; both are fixed and
`tests/token-references.test.js` pins the general case.

### 1.2 Shadows

`--shadow-sm` / `--shadow` / `--shadow-md` / `--shadow-lg`, defined per theme. An undefined
`var(--x)` fails silently in CSS — the property just reverts — so every token is checked by
`tests/token-references.test.js`.

---

## 2. Type

Five sizes. Anything else is a bug.

| Token | Size | Line-height | Use |
|---|---|---|---|
| `--text-xs` | 12px | 1.4 | labels, badges, table meta |
| `--text-sm` | 14px | 1.45 | secondary text, helper |
| `--text-md` | 16px | 1.5 | body, inputs (prevents iOS zoom) |
| `--text-xl` | 20px | 1.3 | section headings |
| `--text-2xl` | 28px | 1.2 | page titles |

**Exempt:** the wordmark uses `clamp(30px,5vw,44px)` because it is a logotype, not text.

Off-grid sizes exist in older inline styles (11, 13, 15, 24px). They are **not** to be "fixed"
during an refactor — `tests/refactor-no-restyle.test.js` pins them. Change them deliberately, in a
styling batch, with before/after evidence.

---

## 3. Spacing

4/8 grid: `--space-0..7` = 0, 4, 8, 12, 16, 24, 32, 48.

**One named exception: `--space-dense: 10px`, tables only** (`th,td` and `td .btn`).

Off-grid values (2, 3, 5, 6, 10, 14px) survive in the codebase. They are off-grid **by
judgement**, not by oversight — e.g. `.app-header-brand` keeps a 6px gap because 8px grew the
landing header from 133px to 135px, and 4px shrank it to 131px. Do not snap them onto the scale
inside a refactor.

---

## 4. Layout

- `.wrap` max-widths: 480 (forms), 720 (content), 1200 (admin).
- Landing header is **133px**; authenticated screens use a **44px** compact app bar. These are
  measured values and are asserted by tests. Do not change them without updating the test.
- Desktop ≥1024px: donor and PIC use a two-column split. Admin tables switch on at ≥1024px.

---

## 5. Copy rules

1. **No helper text unless deleting it would let the user do something wrong.** The four legitimate
   kinds: (a) alias/name confusion at registration, (b) a malformed-token example, (c) a rejection
   reason, (d) refund/money semantics. Everything else goes.
2. Donor-facing screens may use everyday language. PIC / Admin / SuperAdmin keep `CONTEXT.md`
   vocabulary: *campaign, donatur, PIC, token, patungan, arsip*.
3. No emoji in UI copy. No "Silakan", "Mohon", "pastikan Anda". No exclamation marks.
4. If a screen needs a sentence to make sense, **the layout is wrong** — fix the layout rather than
   adding the sentence back.
5. A label the user clicks must never be renamed to make a layout work.

---

## 6. Components

| Component | Anatomy | Notes |
|---|---|---|
| Button `.btn` | 44px min height, radius 999px, primary = forest fill + white ink | secondary = transparent + border |
| Card `.card` | `--surface`, 1px `--border`, radius 12px, `--card-pad` 16px | |
| Empty state `.empty-state` | icon + title + one note line + **one** action | `emptyState()` in `js/utils.js` |
| Badge `.badge` | 12px uppercase, radius 999px, semantic pair | never reuse a status colour for decoration |
| Theme toggle | 44×44, inline SVG, `aria-label` names the ACTION | absolute on landing, static in compact bar |
| Modal | scrim `rgba(0,0,0,.5)` — **a scrim is not a surface**, never `--canvas`; shell padding 20px, radius 12px, `--shadow-lg` | |

---

## 7. Themes

- Order: stored choice → OS preference → **dark**.
- Stored in `localStorage` key `donatpro.theme`.
- The `<head>` sets `data-theme` **before** any stylesheet paints. No flash.
- `css/tokens.css` holds primitives + both theme blocks. `css/theme-dark.css` loads **last** and is
  entirely scoped to `[data-theme="dark"]`; it neutralises light-only declarations in the component
  sheets. A rule there that is not scoped will leak the dark look into light.

---

## 8. Testing your design change

    node scripts/verify-batch.mjs

Runs syntax, the token-reference guard, the no-restyle guard, the full suite, and the invariants
(inline-style / testid counts per file). If it says REVERT, the change is not ready.
