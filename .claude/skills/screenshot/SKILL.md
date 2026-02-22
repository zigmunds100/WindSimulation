---
name: screenshot
description: Take a screenshot of the running WindSimulation app. Use this whenever you need to visually verify the scene, check rendering results, or compare before/after changes. Can be auto-invoked when visual verification is needed.
allowed-tools: Bash, Read
---

# Screenshot Skill

Takes a screenshot of the running WindSimulation Babylon.js app and displays it.

## Steps

1. **Ensure the dev server is running** on port 5173. Check with:
   ```
   curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
   ```
   If not running (non-200), start it in the background:
   ```
   cd C:/Users/admin/source/WindSimulation && npx vite --port 5173 2>&1
   ```
   Wait 3 seconds, then verify it returns 200.

2. **Determine the iteration number** from existing screenshots:
   ```
   ls C:/Users/admin/source/WindSimulation/out/iter_*.png 2>/dev/null | sort | tail -1
   ```
   Use the next number. If no files exist, start at 1.

3. **Take the screenshot** using the project's Playwright-based tool:
   ```
   cd C:/Users/admin/source/WindSimulation && npx tsx tools/screenshot.ts <ITER_NUM> 2>&1
   ```
   This launches a headed Chrome, navigates to localhost:5173, waits for the scene to render, hides UI elements, and saves a PNG.
   Timeout: 30 seconds.

4. **Display the screenshot** by reading the output file:
   ```
   out/iter_<NN>.png
   ```
   where `<NN>` is the zero-padded iteration number.

5. **Report** what you see in the screenshot — describe the scene state, any visible issues, and whether the rendering looks correct.

## Arguments

Optional: `$ARGUMENTS` can be a description of what to look for (e.g., "check if water mode renders correctly").

## Notes

- The screenshot tool uses `window.__simReady` to detect when the scene is loaded. If it times out (15s), it falls back to a 3-second delay.
- Screenshots are saved to `out/iter_XX.png` with zero-padded numbering.
- The tool hides the UI controls panel via `screenshot-mode` CSS class for clean captures.
- If you need to test a specific UI state (e.g., water mode, zones off), you'll need to use Playwright directly to interact with the controls before capturing.
