# 2026-11-06 — Design system + control audit

**What this records:** the design overhaul that shipped on 2026-11-06, the three production bugs
found immediately after, and the rule that came out of them. Read §3 before adding any control.

Shipped: commits `409194f`, `6b3f8c9`, `b9033f1` on `feat/design-system-overhaul`, deployed to
`don4tpro.pages.dev` (buildTime 2026-11-06T02:17:27Z).

---

## 1. What changed, in one paragraph

The app had one theme. A dark overlay (`css/theme-aurora.css`, ~570 lines of `!important`)
neutralised a light theme underneath it, so "light" was the absence of dark and any new component
had to be patched twice. That overlay is now a real token layer: `css/tokens.css` holds primitives
and two theme blocks, `css/theme-dark.css` holds the dark visuals scoped to `[data-theme="dark"]`.
Light is canonical, dark is a theme, and a user picks one with a persisted toggle.

Alongside it: 44px app bar on authenticated screens, one empty-state component, native date inputs
(flatpickr removed), a 5-size type scale, a 4/8 spacing scale, a copy diet (32 → 20 helper
sentences), a PIC desktop grid, a pinned Supabase SDK, and a discoverable "become a PIC" path.

`DESIGN.md` at the repo root is the contract. `css/tokens.css` is its machine-readable form.

---

## 2. Three bugs that reached production, and their class

All three share one shape: **a control was visible in a state where its precondition could never be
met.** No test caught them because every test checked that a handler *existed*, never that its
preconditions were *satisfiable*.

| Control | Where it was shown | What it needed | Symptom |
|---|---|---|---|
| Landing "jadi pengelola" | landing, for logged-out visitors | a `donor_user` session | "Sesi login tidak valid." on every click |
| Become-PIC intent | after login | a minted PIC token | form rendered, submit failed "Token PIC tidak valid." |
| SuperAdmin "Simpan pengaturan" | settings card, even when the load had failed | settings actually loaded | one click wrote `RequireMemberValidation=FALSE`, `EnableRounding=FALSE`, blanked the notification emails and AppUrl |

Two more of the same class were caught before shipping:

- the post-payment "buat campaign sendiri" CTA appeared for **ex-employees**, whom the RPC refuses
  (`Alumni tidak dapat membuat campaign baru`);
- cancelling login left `donatpro.intent` set, so the **next ordinary login** was hijacked into PIC
  creation.

### The rule

> A control must be testable in the state it is visible in.
> If its precondition cannot be satisfied where it is rendered, it is broken — even if the handler
> runs perfectly.

`tests/control-preconditions.test.js` enforces this for the landing and the settings card. Extend it
when you add a control that depends on session, role, or loaded data.

---

## 3. Adding a control — checklist

1. Write down its precondition: session? role? loaded data? an element from another view?
2. Where will it be *visible*? Compare the two. If they can disagree, gate the control.
3. Never let a destructive action be enabled before its data has loaded. Ship the button `disabled`
   and enable it only after the render that proves the data arrived.
4. If a server rule can refuse the action (alumni, readonly, archived), the UI must not offer it.
5. Clear any one-shot intent (`sessionStorage`) on cancel, not only on success.

---

## 4. Guards added

| Guard | Protects against |
|---|---|
| `tests/control-preconditions.test.js` | the §2 class of bug |
| `tests/token-references.test.js` | `var(--token)` used but never defined — CSS fails silently, so `--shadow-lg` and `--surface-muted` were missing for months |
| `tests/refactor-no-restyle.test.js` + `scripts/check-refactor-parity.mjs` | a refactor silently changing values: one batch turned 13px into 14px in 13 places while all tests passed |
| `tests/dom/` (mini-dom + harness) | render functions with no way to assert on rendered output |
| `scripts/verify-batch.mjs` | runs all of the above plus syntax and per-file invariants; prints KEEP or REVERT |

Run `node scripts/verify-batch.mjs` before claiming any change is done.

---

## 5. Known gaps — not fixed, deliberately

- **`js/views/pic.js` controls were never audited.** The control audit covered `index.html` and
  `donor.js` only (82 controls). The PIC view has a further set; the same class of bug may exist.
- **`btn-save-profile` runs on the GAS fallback only.** `updateMemberProfile` is listed in
  `MIGRATED_ACTIONS` but has no case in `_dispatchSupabaseRpc`, so it works while
  `ALLOW_GAS_FALLBACK` is on and breaks the day it is turned off. Four such orphans exist:
  `updateMemberProfile`, `deleteDraftPicToken`, `picMarkRefunded`, `markDonorRefunded`.
- **284 inline `style="` attributes remain** (donor 120, admin 58, pic 53, index 53). A batch to move them to classes was reverted because it
  changed 39 declaration values instead of preserving them. The guard now exists; the work does not.
- **`theme-dark.css` still carries 77 `!important` flags** inherited from the overlay. They work;
  the real fix is tokenising the light-only declarations they neutralise.
- **Duplicate `data-testid`s** across views: `btn-donasi` in both `index.html` and `donor.js`,
  `campaign-card` ×2 and `deadline-badge` ×2 inside `donor.js`. A selector that is not scoped to a
  view picks whichever rendered last.

---

## 6. If you pick this up next

1. Run `node scripts/verify-batch.mjs` — expect 146 passing.
2. Run the control audit over `js/views/pic.js` (the §2 method, applied to the remaining file).
3. Decide whether donor-created campaigns need admin approval. Today they publish instantly with
   status `OPEN` and there is no pending state in the schema. The only gate is member status:
   `ACTIVE` may create, `EX` is refused with "Alumni tidak dapat membuat campaign baru."
