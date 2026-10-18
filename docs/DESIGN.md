# Observer interface rules

Observer's existing `minimalist-ui` skill is the visual source of truth.
The project-oriented expansion must retain the original application's character.

## Foundations

- Canvas: `#fafaf8`; ink: `#252724`; secondary text: `#777b75`.
- Dividers: `#e6e8e3`; hover: `#f3f4f0`; selected: `#eff1ed`.
- Semantic accents only: muted green `#39775a` and red `#9f5a51`.
- Sans: SF Pro Display / Helvetica Neue / system; editorial headings: Georgia.
- Content width: 1136px max, with approximately 22px to 54px side gutters.
- No gradients, drop shadows, decorative illustrations, icon libraries, or dark-only panels.

## Layout

- Preserve the original small `observer.` wordmark and 70px hairline header.
- Use serif page headings, quiet descriptions, and typographic hierarchy instead of cards.
- Show activity counts as unboxed inline numbers; avoid dashboard-style tiles.
- Group work by project using horizontal rules. Avoid nested bordered cards.
- Use a compact top-row navigation and underline-based search/filter controls.
- Use small textual source labels (`Codex`, `Shell`, `CI`) instead of an icon for every row.
- Color is reserved for running/completed/failed semantics and focus indicators.
- Keep a readable single-column view on mobile without horizontal scrolling.
- Open detail in a flat off-white side sheet, not a raised modal with a shadow.

## Content

- Put the project and activity first; don't surface implementation details unless needed.
- Prefer `Running`, `Completed`, and `Failed` to decorative progress meters.
- Avoid redundant labels, filler descriptions, and analytics not actionable to users.
- No emojis or placeholder companies. Demo data must be labeled illustrative.

## Implementation checks

`dashboard.html` is the hosted source (`data-demo="false"`).
`dashboard-demo.html` differs only by `data-demo="true"`.
Both must work with the existing Cloudflare Worker `/api/state` response.
The UI must construct all user-generated content through DOM `textContent`, not `innerHTML`.
Screenshots are tested at desktop and mobile widths with Chromium.