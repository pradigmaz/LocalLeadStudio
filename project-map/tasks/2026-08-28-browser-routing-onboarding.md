---
title: Browser routing onboarding
status: complete
created: 2026-08-28
---

# Browser routing onboarding

## Objective

Let a desktop user optionally open the existing special-link group in a separately chosen browser; keep all other links in the Windows default browser.

## Scope

- Preserve the current special-link group: Yandex Maps, VK, MAX, lead-card websites, and booking links.
- Ask once on the first launch whether to use a separate browser.
- Scan common installed Windows browsers, allow an explicit `.exe` choice, and remember the choice locally.
- If the chosen browser disappears, show an explicit choice: Windows default, another browser, or cancel. Do not silently fall back.

## Out of scope

- Changing the Windows default browser.
- A user-editable domain-rule editor, VPN control, or browser-profile management.

The user later explicitly requested the portable rebuild and a clean-profile launch check.

## Project and feature decision

- Status quo: reject — it hard-codes the current machine's Yandex Browser and fails for a recipient without it.
- Always use the Windows default browser: reject — it removes the requested no-VPN route.
- Build minimum: accepted — one opt-in separate-browser setting for the already-defined group, with no new dependency and no backend schema change.

## Architecture hypothesis

- Electron main process owns the browser executable and the local routing JSON because it launches external URLs.
- A narrow preload bridge exposes only settings read/write, browser discovery, and native `.exe` selection to the local renderer.
- The JSON lives in Electron user data so a recipient gets a first-launch choice instead of inheriting the sender's executable path; paths are revalidated immediately before launch.

## Acceptance checks

1. A missing routing choice opens an onboarding dialog once.
2. Declining stores the Windows-default mode; every URL uses the system browser.
3. Selecting an existing browser sends only the special group to that browser.
4. Telegram, WhatsApp, and other ordinary links still use the system browser.
5. A missing selected executable shows the requested three choices and does not silently open the URL.
6. Unit/self-check, TypeScript build, lint, changed-surface review, and a clean-profile Electron smoke pass.

## Evidence and constraints

- Current routing is in `electron/main.js` and `electron/external-links.js`.
- Current settings UI has separate tabs and follows `SettingsDialog` + lazy tab components.
- Electron current documentation supports a narrow `contextBridge` wrapper over specific `ipcRenderer.invoke` channels; handlers must validate the local sender origin.
- Worktree was already dirty before this task; preserve unrelated changes.

## Progress log

- 2026-08-28: user approved implementation and confirmed the unavailable-browser warning contract.
- 2026-08-28: implemented Electron user-data routing settings, browser discovery/manual `.exe` selection, first-run onboarding, the Settings → Browser entry, and the unavailable-browser three-choice warning.
- VERIFIED: Electron `npm run check`; JavaScript syntax checks for the changed Electron files; frontend source tests 16/16; `npm run lint`; `npm run build`; `git diff --check` (line-ending warnings only).
- NOT_EVALUATED: launching the Electron app, displaying native Windows dialogs, and opening a real external browser were intentionally not run in this task.
- 2026-08-28: user reported two runtime regressions from the portable build: onboarding was not shown on first launch, and selecting Settings → Sources left the renderer white. Investigating the concrete renderer and stored-settings paths before repair.
- 2026-08-28: user confirmed renderer and onboarding now open. Polished the onboarding dialog: desktop width is sufficient for both actions, and the initial focus ring uses the dialog's indigo accent instead of the global black ring.
- 2026-08-28: during an isolated smoke attempt, a separate Electron user profile intentionally bypassed the normal single-instance lock and occupied port 8765. No user data was changed; the port was released. The fallback page now declares UTF-8, so any real port-conflict explanation remains readable in Russian.
- VERIFIED: focused onboarding source test; frontend lint/build; Electron self-check and JavaScript syntax check; Electron portable package. An unpacked Electron build with a clean profile rendered the root and onboarding dialog, with two equal-height actions fully inside a 547 px dialog; it then closed and released ports 8765 and 9233. The packaged `app.asar` contains the UTF-8 fallback marker.
- NOT_EVALUATED: native file-picker selection and actual external-browser launch remain manual scenarios.
