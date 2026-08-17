---
name: continuous-verification
description: |
  Require relevant testing, building, or lint checking before declaring changed code finished.
  Forbids hand-waving or assuming code works.
---

# Continuous Verification

## Hard Rules

1. **Never Assume Code Works**:
   - Every code/config/rule change needs relevant terminal verification or an exact blocker.
   - Claiming completion without a relevant check or blocker is forbidden.

2. **Automated Verification Loop**:
   - Locate test/build suites in the project configs (`package.json`, `cargo.toml`, `go.mod`, `pytest.ini`).
   - Run the smallest relevant build/lint/test commands for the touched surface.
   - Broaden to full suite only when risk or failures justify it.

3. **Verify Until Clean**:
   - If checks fail from in-scope changes: fix surgically, recheck, repeat while progress is real.
   - If checks fail from pre-existing or external issues: report exact command, failure, and residual risk.
