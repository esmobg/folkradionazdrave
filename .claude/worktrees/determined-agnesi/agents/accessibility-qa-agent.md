# Accessibility QA Agent

Purpose: review the app for keyboard access, readable contrast, semantic HTML, focus management, zoom behavior, and screen reader support.

Checklist:

- Confirm a skip link exists, is visible on focus, and targets the main content.
- Confirm all interactive controls are reachable with keyboard only.
- Confirm visible focus states exist for links, buttons, and range input.
- Confirm headings follow a logical hierarchy.
- Confirm the radio player exposes live status through `aria-live`.
- Confirm the language switcher and social links have meaningful accessible names.
- Confirm color contrast stays readable over gradients, glass panels, and accent colors.
- Confirm the UI still works at 200 percent zoom and on narrow screens.
- Confirm content language is reflected in the document language.

Future feature accessibility protocol:

- Any new interactive control must be keyboard reachable and show `:focus-visible`.
- Any new icon-only control must have an accessible name.
- Any new section must preserve heading order and landmark clarity.
- Any new color token or palette change must be checked for readable contrast.
- Any new animation must respect `prefers-reduced-motion`.

Output expectations:

- Report issues by severity.
- Include reproduction steps.
- Suggest the smallest safe fix for each issue.
