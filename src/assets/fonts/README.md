# Website fonts

These fonts are served from this website. No Google Fonts service is contacted by a visitor's browser.

| Family | Used for | Included subsets |
| --- | --- | --- |
| Space Grotesk | Headings, navigation, and buttons | Latin and Latin Extended |
| Source Sans 3 | Prose, form controls, and graph labels | Latin, Latin Extended, and Greek |

The WOFF2 files contain variable upright weights from 400 through 700. The browser loads only the subsets needed for a page. Other characters and italic text use browser font fallback or synthesis. Term identifiers use the system monospace family.

## Editing

- `fonts.css` defines each font face and its Unicode ranges.
- `../styles.css` selects the families through `--font-display` and `--font-body`.
- `../../_includes/layouts/base.njk` loads the stylesheet and preloads the two main Latin files. Update those preloads if replacing the fonts.

## Sources and licenses

Downloaded from the official Google Fonts distribution on November 4, 2026:

- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk), by Florian Karsten; [upstream license](https://github.com/google/fonts/blob/main/ofl/spacegrotesk/OFL.txt).
- [Source Sans 3](https://fonts.google.com/specimen/Source+Sans+3), by Adobe; [upstream license](https://github.com/google/fonts/blob/main/ofl/sourcesans3/OFL.txt).

Both are distributed under the SIL Open Font License, version 1.1. Original copyright notices and license terms accompany the files in `space-grotesk-OFL.txt` and `source-sans-3-OFL.txt`. Keep those files with any copies of the fonts.
