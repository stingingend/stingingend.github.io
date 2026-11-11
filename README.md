# Talon Brady — portfolio

A lightweight personal portfolio for GitHub Pages. Plain HTML, CSS, and JavaScript; no package installation, API keys, backend, or paid services.

## Preview

From this folder:

```powershell
python -m http.server 3100 --bind 127.0.0.1
```

Open http://127.0.0.1:3100.

## Publish

The intended repository is `stingingend/stingingend.github.io`. In **Settings → Pages**, select **GitHub Actions** as the source. Pushing `main` runs the included workflow and publishes only the five public site files, not this README or workflow source. The intended URL is https://stingingend.github.io/.

## Personalize

- Edit text, project links, and technology lists in `index.html`.
- The name comes from the public GitHub profile. The page links to CodeAtlas and the Roblox experience provided by its owner.
- The selected work section features CodeAtlas, CommonTime, CoachZilla, and the existing Roblox experience. Project descriptions and tools come from their public source and documentation.
- The resume section explicitly says coming soon. Add an actual PDF and a download link when ready; no credentials, education, or work history have been invented.
- CodeAtlas links to its source until a public live demo is deployed. No localhost link is published.
- System fonts only; no font downloads or runtime dependencies.
- CodeAtlas links to its current `stingingend/CodeAtlas` repository. The diagram shows selected real imports from `backend/app/main.py`; the file nodes link to GitHub source.
- The Roblox graphic is an illustration, not a game screenshot.
- The CommonTime calendar and CoachZilla route are interactive illustrations with sample data, not live project data or screenshots. Both are labelled "sample data" on the page.
- The CodeAtlas graph shows six real files from `backend/app` and the real imports between them. Update `FILES` and `IMPORTS` in `script.js` if the source changes.
- The entry screen (`#gate`) is a WebGL shader in `script.js` (`GATE_SHADER`): a marble Atlantis under water that ripples under the pointer. It is a small world you can drag, zoom (wheel, pinch, +/-), and explore with the arrow keys; five canals lead from the city to engraved landmarks, and zooming in on one reveals a button that enters that project directly. Landmark positions live in `SITES` in `gate()` and their shapes in `siteMask` in the shader. It is skipped when the URL has a `#section` link, shows a still frame with reduced motion, and falls back to a plain CSS pattern without WebGL. To remove it, delete the `gate-on` script in the `<head>` of `index.html`.
- The atlas map is an invented world: each project is an island, and the coordinates are derived from the map positions, not real places. Add or move a place in `PLACES` in `script.js` and add a matching link in the `atlas-places` list in `index.html`.
- Without JavaScript the map falls back to a plain list of links and the three demos fall back to static illustrations.
- Layouts adapt to mobile screens; links support visible keyboard focus and smooth scrolling respects reduced motion preferences.
