---
name: low-context-default
description: |
  Enforce low-context reading and querying. Avoid loading whole files over 500 lines
  into context unless the exact full artifact is required; prefer grep, targeted chunks,
  and context-mode SQLite.
---

# Low-Context Default (Token Efficiency)

## Default Rules

1. **Avoid reading large files (>500 lines) fully**:
   - Use `grep_search` or `ctx-search` to locate exact functions/constants first.
   - Use `view_file` specifying exact `StartLine` and `EndLine` (maximum 100 lines at once) to inspect code.
   - Full read is allowed when the user requested the full artifact, exact whole-file edit context is required, or a structured processor summarizes it first.

2. **Index First, Read Later**:
   - For unknown filebases or large third-party logs/source code, run `ctx_index(path: ...)` or use `ctx_execute_file` instead of reading the files directly.

3. **Limit Directory Listing**:
   - Do not list massive directories. Target the exact folder you need or use `grep_search` to find files.

4. **Preserve Context History**:
   - Never request redundant operations. Re-use files already loaded in memory or saved in scratch directories.
