---
trigger: model_decision
---

# Quota Preservation & Execution Rules

## 1. Terminal Command Policy
- **No Infinite Loops:** If a command fails (e.g., a test or build error), you are allowed **one (1) attempt** to fix the code and retry. If it fails a second time, STOP and ask the user for manual intervention.
- **Non-Interactive Only:** Always use flags like `-y`, `--force`, or `--yes`. Never run a command that waits for user input (e.g., `npm init` without `-y`).
- **Short-Lived Processes:** Do not run long-running servers (like `npm start`) in the background unless specifically asked. Use `curl` or unit tests to verify logic instead.

## 2. Browser & Visual Policy
- **Minimal Browser Usage:** Do not launch the Integrated Browser or take screenshots for backend, logic, or API changes.
- **Confirmation Required:** For UI changes, describe the intended change first. Only launch the browser for final verification.

## 3. Planning & Token Weight
- **Summarize Large Files:** Do not read entire 1000+ line files if you only need to see the exports. Use `grep` or specific line-range reading to save context window (and quota).
- **Batch Changes:** If multiple files need similar small edits, perform them in a single "Plan" rather than starting five separate missions.