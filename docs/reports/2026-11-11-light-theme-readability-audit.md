# 2026-11-11 — Light-theme readability audit (all POVs)

**What this records:** every light-theme ink/surface pair that fails WCAG AA across Donatur, PIC, Admin
and Superadmin. Triggered by a user report: the nomor rekening and total amount in the donor dashboard
were unreadable after switching to light theme.

**Method.** Computed WCAG 2.1 contrast from the actual declarations in `js/views/*.js`, `index.html`,
`css/components.css`, `css/views.css`, `css/tokens.css`. Alpha layers are composited as CSS composites
them (`over(fg, a, bg)`). **Not** verified in a browser: headless Chrome could not start in this
sandbox (crashpad/mojo IPC denied), so every number below is arithmetic, not a screenshot.

`tests/theme-migration-contrast.test.js` was scanned for unsupported colour syntax (`rgb()`, `hsl()`,
`color-mix()`) because the harness fails closed on unparseable values — **0 occurrences**, so the
arithmetic below reflects the real computed value, not a fallback.

---

## 1. Root cause (one sentence)

Dark-mode ink was hardcoded into the light-canonical runtime, and the only thing that made it readable
in dark was the `[data-theme="dark"]` block in `css/theme-dark.css` — which by design does not apply in
light. Every failing item is a dark-theme colour literal sitting on a light surface.

`css/theme-dark.css` already carries the matching `!important` patch for exactly these surfaces
(lines 206-244). The bug is that the patch is scoped to dark only, so it never runs in light.

---

## 2. Failing matrix — light theme

| ID | Surface | POV | Location | Contrast | Verdict |
|---|---|---|---|---|---|
| **F-01** | **Nomor rekening** (white ink) | Donatur | `donor.js:825` — `color:#ffffff` | **2.16:1** | FAIL |
| **F-02** | **Nominal telah dibayar** | Donatur | `donor.js:786` — `color:#eef6ed` on `#dbeafe` | **1.11:1** | FAIL — invisible |
| **F-03** | Status "Pembayaran Terverifikasi" | Donatur | `donor.js:783` — `color:#6ee7b7` | **1.25:1** | FAIL |
| **F-04** | "Lihat Bukti" link + button | Donatur | `donor.js:777-778` — `color:#6ee7b7` | **1.22:1** | FAIL |
| P-05 | Badge `Belum Bayar` / `Perlu Ditinjau` | PIC, Admin | `components.css:85-93` — `#b45309` on `#faeeda` | 4.38:1 | AA-large only |
| A-05 | Disabled WA input in Profil modal | All roles | `index.html:473` — `#64748b` on `#f1f5f9` | 4.34:1 | AA-large only |
| S-02 | Notify banner `#d97706` + white | Admin, SA | `index.html:200`, `:315` | 3.19:1 | AA-large only |
| C-01 | Input placeholder | All roles | `components.css:226` — `#94a3b8` | 2.56:1 | FAIL |

Controls proving the diagnosis — the same lines in **dark** theme: F-01 **17.87:1**, F-02 **16.96:1**.
The colours were written for the dark canvas and never tokenised.

### Why this was not caught

- `tests/theme-migration-contrast.test.js` `RUNTIME_FILES` asserts runtime markup has no *legacy light
  islands* (`background:#fff`, `color:#0369a1`, …). It never asserts there are no *dark* islands in the
  light theme. The guard only covers one direction.
- The dark override test asserts each named seam **exists in `theme-dark.css`** — which is satisfied by
  the very rule that makes light wrong (`.theme-blue-total { color: var(--text) !important }`).

---

## 3. Per-POV summary

| POV | Readability defects | Detail |
|---|---|---|
| **Donatur** | **4 FAIL** (F-01…F-04) | Payment form + paid-status card. Highest severity: F-01/F-02 are the two values users must copy. |
| **PIC** | 1 borderline (P-05) | `pic.js:425` refund callout uses `var(--amber)` → `#7a6108`, **5.93:1 — correct**. PIC needs no fix for the refund line. |
| **Admin** | 1 borderline (P-05), 1 AA-large (S-02) | `admin.js:763` refund callout same as PIC, **5.93:1 — correct**. Detail modal ink is `var(--text)`, correct. |
| **Superadmin** | 1 AA-large (S-02) | Settings card uses `var(--text)`, correct. Shares the notify banner with Admin. |

The image people have of "the whole app is broken in light" is not supported: the damage is
concentrated in **donor.js's payment surfaces**, plus three shared components that are all-role.

---

## 4. Fix plan (ranked by user impact)

All fixes use existing tokens only. `DESIGN.md` §1 forbids new raw hex in views.

### 4.0 Applied — the "Rekening Tujuan PIC" panel (`donor.js:822-825`)

Reported second time as "I barely can see the text". The ink was only half the problem; the
**container** was a dark-theme scrim:

| | Before | After |
|---|---|---|
| background | `rgba(0,0,0,0.28)` → composites to `#9ea8b7` | `var(--surface)` → `#ffffff` |
| label + "a.n." (`var(--muted)`) | **1.98:1** | **4.76:1** |
| rekening (`color`) | `#ffffff` → **2.40:1** | `var(--text)` → **17.85:1** |

Fixing the background alone would have made it *worse* — white ink on a light panel is 1.05:1 — so
both were changed together. `var(--surface)` resolves to `#ffffff` in light and
`rgba(255,255,255,.045)` in dark, so no `theme-dark.css` override is needed.

Before/after page: `.scratch/audit/before-after.html` (Before = `git show HEAD:js/views/donor.js`,
After = working tree; both run the real render function).

**Still open, same class:** `donor.js:799` and `:807` use `border-top:1px solid rgba(255,255,255,0.08)`
on the paid-status card — that border is invisible in light. Not changed here.

1. **`donor.js:825`** — `color:#ffffff` → `color:var(--text)`. *(F-01, the reported bug)*
2. **`donor.js:786`** — `color:#eef6ed` → `color:var(--text)`. *(F-02, the reported bug)*
3. **`donor.js:783`** — `color:#6ee7b7` → `color:var(--success)`.
4. **`donor.js:777-778`** — `color:#6ee7b7` → `color:var(--success)`; background `rgba(52,211,153,.08)` →
   `var(--accent-soft)` is wrong (gold); use `.badge.success`-equivalent or leave the tint and swap ink
   only. Minimum viable: swap the ink.
5. **`components.css:226`** — placeholder `#94a3b8` → `var(--ink-muted)` (4.76:1).
6. **`components.css:91`** `.theme-status-unpaid` — `#b45309` → `#92400e` (= `--warning`, ≥4.7:1).
7. **`index.html:200,315`** — banner `background:#d97706` → `var(--warning)`; keep white ink (4.7:1+).
8. **`components.css:113`** `.profile-disabled-input` — `#64748b` → `#475569`.
9. **`donor.js:720`** — drop the `#f5d347` fallback: `var(--amber,#f5d347)` → `var(--accent-soft-ink)`.
   The literal is 1.47:1 on white and only works because the token happens to be defined.

### Guard to add (so this cannot recur)

Extend `tests/theme-migration-contrast.test.js` with the **inverse** direction that is missing today:
scan `RUNTIME_FILES` for dark-only ink literals (`#ffffff`, `white`, `#eef6ed`, `#6ee7b7`, `#fcd34d`,
`#f5d347`, `#93c5fd`, `#34d399`, `rgba(255,255,255,…)` used as `color:`) and fail. That is exactly the
six declarations in §2. `tests/token-references.test.js` already catches a *missing* token; this catches
a *hardcoded* one.

### Known gap this audit did not close

`js/views/pic.js` controls were never audited (report §5). This audit covers **colour**, not control
preconditions; PIC control audit is still open.

---

## 5. Reproduction

```
node .scratch/audit/final.mjs
```

Part 1 prints the screen matrix, part 2 sweeps every hardcoded dark-ink declaration in the runtime
sources (12 hits, 6 of them in `donor.js`).
