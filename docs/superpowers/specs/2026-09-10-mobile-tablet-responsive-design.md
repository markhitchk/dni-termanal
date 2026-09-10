# DNI Mobile + Tablet Responsive Redesign

Date: 2026-09-10
Status: Approved design checkpoint
Scope: Phone and tablet layouts only (320px through 1100px). Desktop styling at 1101px and above remains existing behavior unless a shared primitive requires a non-visual compatibility fix.

## Goal

Replace the current overlapping mobile/tablet CSS stack with one canonical responsive system that preserves the existing DNI military-terminal visual language while making every major workspace usable from compact phones through large tablets.

The responsive redesign must prioritize available viewport width instead of device names, use pointer capability only for interaction ergonomics, and avoid adding another corrective stylesheet on top of the existing stack.

## Current problem

The repository currently has multiple responsive layers that can all affect the same components and breakpoints, including:

- `public/src/css/core/responsive.css`
- `public/src/css/core/mobile-large.css`
- `public/src/css/core/mobile-fit.css`
- `public/src/css/core/mobile-readable.css`
- `public/src/css/mobile-universal.css`
- mobile/landscape adjustments in `public/src/css/core/polish.css`

These layers overlap on navigation height, shell width, form sizing, card grids, terminal sizing, Admin layouts, and phone-specific corrections. Several rely on broad `!important` overrides. This makes the cascade difficult to reason about and causes regressions when one mobile fix overrides another.

## Chosen approach

Use a single canonical responsive layout layer for widths up to 1100px.

Recommended canonical file:

`public/src/css/core/mobile-tablet.css`

This file owns structural layout behavior for phones and tablets. Existing desktop CSS remains authoritative above 1100px.

Touch-specific ergonomics should remain logically separate from layout. Existing useful touch rules from `mobile-large.css` may be retained or migrated into a small touch-only layer, but pointer type must not determine whether the app receives a phone/tablet layout.

## Viewport model

The responsive system has three structural states and one compact refinement:

### Desktop

- Width: 1101px and above
- Existing desktop appearance remains unchanged
- Existing horizontal section navigation remains unchanged

### Tablet

- Width: 701px through 1100px
- Horizontal DNI navigation tabs remain
- Two-column or three-column layouts are allowed where content supports them
- Master/detail layouts remain for Documents, Mail, Operations, and Admin where enough room exists
- Touch targets remain comfortable on coarse-pointer tablets

### Phone

- Width: 431px through 700px
- Horizontal DNI tab strip is replaced by a hamburger-triggered left navigation drawer
- Most content becomes single column
- Small metric cards may remain two columns
- Split panes become drill-down views
- Forms become single column

### Compact phone

- Width: 320px through 430px
- Same phone architecture as 431-700px
- Tighter fluid spacing and type scale
- No additional separate mobile navigation mode
- No miniature controls or ultra-small text introduced solely to make content fit

## Fluid sizing

Use fluid design tokens rather than many exact breakpoints.

Suggested primitives:

- page gutters via `clamp()`
- section gaps via `clamp()`
- headings via `clamp()`
- component padding via `clamp()`
- content widths via `min()`, `max()`, and `minmax()`
- viewport-height-sensitive workspaces via `dvh`

Avoid fixed heights except where necessary for controls. Do not use arbitrary per-device widths.

## Global responsive rules

The canonical mobile/tablet layer must guarantee:

- no horizontal page overflow
- safe-area support for left, right, top, and bottom where appropriate
- all grid/flex children that may shrink use `min-width: 0`
- media, SVG, iframe, canvas, and image content never exceed their container
- form controls do not force a wider viewport
- phone text inputs use at least 16px font size to avoid browser zoom behavior
- long IDs, usernames, sector names, labels, and callsigns wrap safely
- horizontal scrolling is only allowed on components explicitly designed for it
- dialogs fit inside the visible dynamic viewport height
- reduced-motion behavior remains supported

## Navigation

### Tablet and desktop

Keep the current `.nav-scroll`, `.nav-tabs`, and `.nav-tab` structure for widths 701px and above.

Tablet navigation may remain sticky and horizontally scrollable when all tabs do not fit, but it must not compress labels into unreadable text.

### Phone

Replace the visible horizontal tab strip with a compact top bar containing:

- hamburger button
- DNI / Dreadnought Imperium identity
- current section title

The hamburger opens a left-side overlay drawer. The drawer does not push the page sideways.

The drawer contains the existing section destinations:

- DNI Terminal
- DNI Dashboard
- DNI Ranks
- DNI Documents
- DNI Services
- DNI Communication
- DNI Sectors
- DNI Operations
- DNI Mail
- DNI Admin when authorized

The active section must be visually marked.

The drawer must close when:

- a destination is selected
- the backdrop is tapped/clicked
- Escape is pressed
- browser/back-navigation behavior requires the current overlay to close before leaving the page, if compatible with the existing router

The phone drawer should reuse the existing section routing logic rather than duplicate page-selection state.

## Touch ergonomics

Pointer capability controls interaction details only.

For `(pointer: coarse)`:

- actionable controls should generally target at least 44px block size
- tap feedback remains enabled
- hover-only affordances must not be required
- scrolling containers use touch-friendly momentum behavior where supported

For `(hover: hover) and (pointer: fine)`:

- existing hover feedback remains available

Do not use `(pointer: coarse)` as the primary selector for phone/tablet layout.

## Screen transformations

### DNI Terminal

Tablet:

- preserve the current title, terminal selector, action controls, and full terminal window
- keep horizontal section tabs
- terminal remains the visual focus

Phone:

- use the compact top navigation bar and drawer
- stack title/identity, terminal selector, and actions cleanly
- terminal window spans available width
- use a dynamic-height terminal workspace around 50-60dvh where practical
- command input remains readable at 16px minimum
- terminal output wraps safely without causing page overflow

### Dashboard

Tablet:

- retain dashboard grid layout
- allow two to four compact metric cards per row depending on available width

Phone:

- text-heavy cards become single-column
- compact metrics may use a two-column grid
- recent activity becomes full width

### Ranks

Tablet:

- retain compact rank card grids where readable

Phone:

- rank entries become full-width stacked cards
- hierarchy metadata stays visible without shrinking text
- detail expansion/navigation may use a drill-down pattern

### Documents

Tablet:

- preserve master/detail layout with document index and reader

Phone:

- show searchable document list as the main view
- selecting a document opens a full-width reader view
- reader includes a clear back-to-documents action
- no side-by-side list/reader on phone

### Services

Tablet:

- retain two-column management/request layouts where practical

Phone:

- service requests become stacked cards
- forms become single column
- primary actions span full width when needed

### Communication / Star Comms

Tablet:

- retain multi-column status and communication cards

Phone:

- compact metrics may remain two columns
- larger communication panels become single-column stacked cards
- status text and shard identifiers wrap safely

### Sectors

Tablet:

- retain strategic map/directory combinations where space supports them

Phone:

- sector directory becomes card-based
- selecting a sector opens full-width sector detail
- detail may expose Personnel, Assets, and Activity as internal tabs/sections
- strategic map must resize responsively and must not force horizontal page overflow

### Operations

Tablet:

- preserve master/detail layout for operation list and operation details where space permits

Phone:

- operation list becomes full-width cards
- selecting an operation opens a full-width detail workspace
- desktop split-pane behavior is disabled on phone

### Mail

Tablet:

- preserve inbox/message master-detail layout

Phone:

- inbox is the primary list view
- selecting a message opens a full-width reader
- compose uses a dedicated full-height or full-width phone view rather than a cramped desktop modal

### Admin

Tablet:

- preserve useful split management layouts where they remain readable
- personnel list/editor and similar manager/editor patterns may remain side-by-side

Phone:

- Admin landing becomes a category/menu view
- categories include Personnel, Clearances, Sectors, Services, Documents, System, and Audit Log where available
- selecting a category opens its list/workspace
- selecting a record opens a dedicated full-width editor
- no desktop split-management UI is squeezed into phone width

## Tables and dense data

Desktop/tablet tables may remain when they are genuinely readable.

On phones, wide tables should become one of:

- stacked record cards
- label/value rows
- a list followed by a dedicated detail view

Do not solve wide-table problems by reducing font size to unreadable values.

## Dialogs, overlays, and drawers

All overlays must:

- honor safe areas
- fit within `100dvh`
- allow internal scrolling when content exceeds available height
- avoid page-level horizontal overflow
- maintain existing DNI visual styling

The navigation drawer must trap focus while open if the current JavaScript architecture can support it without regressions. Escape must close it on keyboard-capable devices.

## CSS ownership and cleanup

The implementation should establish one source of truth for mobile/tablet structural layout.

Target ownership:

- `mobile-tablet.css` — all structural layout behavior up to 1100px
- `mobile-large.css` or replacement touch layer — touch ergonomics only
- existing desktop CSS — desktop behavior above 1100px
- component-specific CSS — visual styling and optional container-query refinements, but not conflicting global phone breakpoints

After migration and verification, overlapping structural rules should be removed or disabled from:

- `core/responsive.css`
- `core/mobile-fit.css`
- `core/mobile-readable.css`
- `mobile-universal.css`
- mobile-specific structural rules in `core/polish.css`

Do not delete compatibility files until the build pipeline and runtime stylesheet references are updated and tests confirm they are no longer required.

## Container queries

Where practical, component-level workspaces should use container queries for local layout changes, especially:

- Operations
- Admin
- Documents
- Mail
- Services
- Sectors

This lets a component adapt to its actual available width instead of assuming that the entire viewport width equals its usable width.

Container queries must supplement the canonical viewport modes, not create a second conflicting breakpoint system.

## HTML/JS changes

The redesign should minimize markup changes, but the phone drawer requires a small navigation structure and behavior layer.

Preferred implementation strategy:

1. Reuse the existing `nav-tab` destination buttons or their routing metadata.
2. Add a phone-only top-bar trigger and drawer container.
3. Synchronize the active drawer item with the existing `aria-selected` navigation state.
4. Reuse existing routing functions/events rather than introducing duplicate routing code.
5. Keep tablet/desktop navigation markup behavior unchanged.

No backend/API changes are required for the responsive redesign.

## Accessibility

The implementation must preserve or improve:

- keyboard access to navigation
- visible `:focus-visible` states
- semantic button behavior
- ARIA state for the drawer trigger (`aria-expanded` and `aria-controls`)
- active-section state
- reduced-motion preferences
- readable text sizes
- minimum touch-target sizes

The drawer backdrop must not become keyboard focusable unless required for its implementation.

## Error handling and fallback behavior

If drawer JavaScript fails to initialize:

- the existing navigation must remain reachable rather than leaving users stranded
- a progressive-enhancement approach is preferred: CSS/JS should only hide the phone tab strip after the drawer controller initializes successfully

If container queries are unsupported in an older browser:

- the viewport-based phone/tablet layout must remain fully usable

No responsive rule may hide critical functionality solely because the viewport is narrow.

## Migration strategy

Implement in stages to reduce regression risk:

1. Add canonical `mobile-tablet.css` and load it after base desktop/component styles.
2. Add phone drawer markup/controller while retaining the old mobile tab strip as a fallback.
3. Port shared shell, terminal, forms, grids, and navigation behavior.
4. Port each major screen transformation one subsystem at a time.
5. Remove conflicting structural rules from legacy responsive layers only after the replacement is verified.
6. Keep desktop snapshots/tests stable above 1100px.
7. Run build and verification suite before deployment.

## Verification matrix

Minimum viewport checks:

- 320x568 compact phone portrait
- 360x800 Android phone portrait
- 390x844 modern phone portrait
- 430x932 large phone portrait
- 667x375 short landscape phone
- 800x1280 small tablet portrait
- 1024x768 tablet landscape
- 1100x800 upper tablet boundary
- 1101x800 desktop boundary check
- 1440x900 desktop regression check

For each relevant viewport verify:

- no page-level horizontal overflow
- navigation remains reachable
- active section is clear
- forms are usable
- terminal prompt remains visible and editable
- dialogs fit the viewport
- Admin remains operable
- Documents/Mail/Operations master-detail changes correctly between tablet and phone
- Sectors content remains readable
- no control requires hover on touch devices

## Automated checks

Add or extend tests where practical for:

- stylesheet build inclusion/order
- required navigation drawer elements
- required ARIA attributes
- presence of canonical breakpoints
- absence of forbidden broad mobile layout rules in retired files after migration
- desktop stylesheet behavior remaining available above 1100px

Run the existing repository verification commands after implementation:

- `npm run build`
- `npm run build:lamp`
- `npm run audit:repo`
- `npm run verify`

## Success criteria

The redesign is complete when:

1. One canonical stylesheet owns phone/tablet structural layout through 1100px.
2. Phones use the approved left-side navigation drawer.
3. Tablets keep horizontal DNI section tabs.
4. Desktop above 1100px remains visually and functionally stable.
5. Major DNI workspaces adapt according to this spec rather than being squeezed desktop layouts.
6. No critical page causes horizontal viewport overflow at the verification widths.
7. Existing touch ergonomics and reduced-motion support remain intact.
8. Legacy overlapping responsive rules are retired or reduced to non-conflicting compatibility behavior.
9. The full repository verification suite passes before deployment.

## Non-goals

This redesign does not include:

- a desktop visual redesign
- a backend/API rewrite
- changes to authentication or clearance logic
- replacing the DNI visual identity
- adding a new JavaScript framework
- creating device-specific themes
- introducing separate phone and tablet applications
