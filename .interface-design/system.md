# Gemra Interface Design System

## Intent

**User:** Developer. Focused. Probably at a workstation in a dim room.
**Primary action:** Talk to an AI agent while running terminal commands.
**Feel:** Precision developer tool. Cool-dark. Exact. Like a screen in a dark room — not warm, not aggressively retro, just clean and focused.

---

## Palette

Neutral dark. No temperature cast — pure gray backgrounds, original VS Code-adjacent values preferred.

| Token | Value | Use |
|---|---|---|
| `--bg-primary` | `#1e1e1e` | App base, tab bar |
| `--bg-secondary` | `#2d2d2d` | Elevated surfaces, input box, header |
| `--bg-user-message` | `#2a2a2a` | User message backgrounds |
| `--bg-hover` | `#252525` | Hover states |
| `--bg-active` | `#3a3a3a` | Active/pressed states |
| `--button-primary` | `#569cd6` | Accent |
| `--button-primary-hover` | `#6aadee` | Accent hover |

## Text

| Token | Value | Use |
|---|---|---|
| `--text-primary` | `#d4d4d4` | Default text |
| `--text-secondary` | `#b0b0b0` | Supporting text |
| `--text-muted` | `#888` | Metadata, hints |
| `--text-tertiary` | `#666` | Timestamps, disabled |

## Borders

All standard borders use rgba — adapts to surface, looks refined.

| Token | Value | Use |
|---|---|---|
| `--border-color` | `rgba(255,255,255,0.08)` | All structural borders |
| `--border-color-focus` | `#4a8cf0` | Focus rings, hover accent |
| `--border-separator` | `rgba(255,255,255,0.08)` | Vertical separators |

---

## Depth Strategy: Borders-only

**Commit to borders.** No mixed shadows + borders on the same surface type.

- Dropdowns: `1px solid var(--border-color)` with slight background elevation (`--bg-secondary`)
- Cards/inputs: `1px solid var(--border-color)`
- Focus: `border-color: var(--border-color-focus)` + `box-shadow: 0 0 0 2px rgba(74,140,240,0.2)`
- Sidebar/tab bar: same background as canvas (`--bg-primary`), border separation only

---

## Radius Scale

Differentiated — each step is visually distinct.

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `3px` | Badges, code inline, tiny elements |
| `--radius-md` | `5px` | Buttons, chips, dropdowns |
| `--radius-lg` | `8px` | Cards, action cards, recent items |
| `--radius-xl` | `12px` | Input box, modals |

---

## Spacing

Base unit: 4px. Scale: 4 / 8 / 12 / 16 / 24 / 32.

---

## Component Patterns

### ActionCard
- Use CSS classes `.action-card`, `.action-card__icon`, `.action-card__body`
- No inline styles, no JS hover handlers
- `:hover` → `border-color: var(--border-color-focus)` + `background: var(--bg-active)`
- `:focus-visible` → `border-color` + focus shadow ring

### RecentItem
- Use CSS classes `.recent-item`, `.recent-item__info`, `.recent-item__branch`
- Git branch badge: `--git-branch-bg: rgba(74,140,240,0.15)` / `--git-branch-text: #7ab3f5`
- No hardcoded hex values outside tokens

### Status Chips
- Segmented connected design: `border: 1px solid var(--bg-active)`, `border-radius: var(--radius-lg)`
- This is a signature pattern — preserve it

### Input Box
- Border radius: `var(--radius-xl)` (12px)
- Background: `--bg-secondary`, border: `var(--border-color)`

---

## What to Avoid

- Solid hex borders (`#3e3e3e`) — use rgba
- Inline JS hover handlers (onMouseEnter style swaps) — use CSS :hover
- Hardcoded colors outside the token system
- Mixed depth: don't add box-shadow to surfaces that use border-only elevation
- `outline: none` without a :focus-visible replacement
