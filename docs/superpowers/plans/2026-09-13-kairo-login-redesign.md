# KAIRO Login Redesign Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the KAIRO login as a centered, responsive and accessible boutique entry experience without inheriting the authenticated application grid.

**Architecture:** Introduce a dedicated authentication shell and keep authentication behavior inside `LoginPage`. Replace login-specific `:has()` layout coupling with explicit classes, then validate layout geometry in Playwright across five viewports.

**Tech Stack:** React 19, React Router, Motion, Lucide React, Vitest, Testing Library, Playwright, Axe.

---

### Task 1: Lock the intended behavior with failing tests

- [x] Update the login component test for the new copy, dedicated main landmark, password toggle and submit label.
- [x] Add a responsive Playwright test covering viewport bounds, horizontal overflow, centering and desktop column separation.
- [x] Add Axe and reduced-motion coverage.
- [x] Run the focused tests and record the expected RED result.

### Task 2: Build the dedicated authentication shell

- [x] Add `AuthShell.tsx` with a single main landmark and centered stage.
- [x] Move `LoginPage` away from `AppShell`.
- [x] Update semantic labels and approved copy.
- [x] Preserve redirect, credential, Caps Lock and password behavior.

### Task 3: Implement the premium responsive composition

- [x] Replace old login selectors and `:has()` rules with explicit auth layout styles.
- [x] Add the centered surface, brand atmosphere, form hierarchy and robust field states.
- [x] Add tablet and mobile compositions without horizontal overflow.
- [x] Add reduced-motion overrides.

### Task 4: Verify behavior and visuals

- [x] Run focused unit tests.
- [x] Run the responsive login E2E test.
- [x] Inspect the page visually at all required widths.
- [x] Correct any clipping, imbalance, accessibility or interaction issue.

### Task 5: Close and integrate

- [x] Run formatting, lint, typecheck, complete unit, integration and E2E suites, build and production audit.
- [x] Run `git diff --check` and review the final diff.
- [x] Commit the isolated branch.
- [x] Merge into `main`, rerun critical verification and push to GitHub.
