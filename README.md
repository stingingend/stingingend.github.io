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
- The name comes from the public GitHub profile. Project descriptions are based on their repositories; Music Timer and CoachZilla are labeled as team projects.
- The introductory copy is an editable portfolio draft, not a verified professional biography. Replace it as desired.
- The resume section explicitly says coming soon. Add an actual PDF and a download link when ready; no credentials, education, or work history have been invented.
- CodeAtlas links to its source until a public live demo is deployed. No localhost link is published.
- Google Fonts are optional; system serif/sans fonts provide fallbacks.
