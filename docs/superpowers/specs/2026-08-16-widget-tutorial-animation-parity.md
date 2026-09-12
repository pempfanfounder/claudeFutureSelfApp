# Widget Tutorial Animation — Parity Spec (Lock Screen)

Source of truth: `ScreenRecording_08-15-2026 15-49-53_1.MP4`, Lock-Screen-widgets
screen, sampled at 10 fps (frames t=2 s → 30 s). This is simply what adding a
Lock Screen widget looks like on iOS 16+; the choreography below is the OS's,
not any app's.

## Root cause of the mismatch (frame-level diff vs `WidgetTutorialMock.tsx` v1)

| # | Reference (real iOS sequence) | v1 component | Verdict |
|---|---|---|---|
| 1 | Idle lock screen (date, 9:41, **no** "Add widgets" pill, bottom flashlight/camera circles) | idle shows an "Add widgets" outline pill from t=0 | **Wrong** — pill only exists in edit mode |
| 2 | Long-press: dark dot **grows** at center over ~0.6 s and **holds ~1.5 s** | dot at 0.07–0.16 (~1 s), quick pulse | **Too fast**, no hold |
| 3 | Screen **zooms out** to gallery: lock screen scales to ~0.6 and slides LEFT; a **Home-Screen pair card** appears at right (two-up "Lock Screen · Home Screen" gallery, labels beneath, "Customize" pill under the pair) | scale to 0.82 in place, single card | **Wrong phase** — the two-card gallery is missing entirely |
| 4 | Gallery holds ~1.6 s, then finger dot **presses the Lock Screen card**, dot **grows large** (~1 s) | — | **Missing** |
| 5 | Zoom **back in** to full lock screen, now in **edit mode**: date/clock/"Add widgets" all get **outlined frames** (dashed rounded rects), "Add widgets" pill visible, bottom circles remain | edit-mode chrome = "Customize" pill at bottom + Cancel/Done immediately | **Wrong**: Cancel/Done appear only later (step 12); frames missing |
| 6 | Hold ~2 s. Finger taps the **"Add widgets" pill** (dot ~0.5 s) | dot taps at bottom | **Wrong target** |
| 7 | Widget **picker sheet slides up from bottom** ~0.4 s: gray sheet, one row = app glyph + "Motivation" + circular ✕ at right | sheet slides up ✓ | ✓ (timing ok) |
| 8 | Sheet holds ~2 s; finger taps the app row (dot on the row) | dot bottom-center | Slightly off target |
| 9 | Sheet **expands upward** (~0.5 s) to a taller **detail sheet**: title "Motivation", subtitle "Read quotes on your Lock Screen", a preview chip ("Attitude is a little thing that makes…") in the middle | never happens | **Missing** |
| 10 | Detail sheet holds ~1.6 s. **First** quote chip **slides into the "Add widgets" area from the left with a small "–" remove badge** on its top-left (chips are gray/glassy, not the app palette) — ~0.5 s ease-out; **~1.4 s later the second chip** slides in beside it | both chips pop-scale from 0.4 in place, app-sand-colored, no badges | **Wrong motion, wrong look, wrong stagger** |
| 11 | Hold ~1.2 s, finger taps the sheet's ✕ → detail sheet **slides down** (~0.4 s) | sheet fades | Missing dismissal beat |
| 12 | Now Cancel (left) / Done (right) chips appear at top; whole screen shows the "–" badges on chips; hold ~1.5 s; finger presses **Done** (dot grows on Done, ~0.6 s) | Done pulse at 0.57 | Order wrong (Done was visible from step 5) |
| 13 | Edit chrome (frames, badges, Cancel/Done) **fades out** → clean lock screen **with the two chips** under the clock — hold ~2.5 s | ✓ concept | ✓ but chips look wrong |
| 14 | Loop restart: dot grows at center **again on the finished screen** (this is the long-press of the next cycle) → zoom-out to gallery … i.e. the loop is **seamless with no fade-to-start**: the end state IS the next start state (chips present) | seam crossfade to a chip-less start | **Wrong seam** — reference doesn't reset to "no widgets" visibly; it long-presses on the finished screen and the gallery/edit-mode reset happens while zoomed out |

Loop length measured: ≈ **27.5 s** (t≈2.0 s first idle → t≈29.5 s next idle-with-chips), not 12 s. My 12 s loop compressed every beat by >2×, which is the single biggest reason it "feels wrong": iOS's own edit-mode transitions are ~0.4–0.6 s and the *holds* are long (1.5–2.5 s) so a viewer can read each state.

Home Screen tab: no reference exists for it in this recording (Motivation opens a separate Home Screen widgets page). Keep our own version but retime it to the same rhythm (long holds, 0.4–0.6 s transitions, ~20 s loop).

## Target timeline (Lock variant, master progress p over LOOP_MS = 27 500)

All transitions ease-in-out unless noted; dot = 34pt translucent dark circle.

| p start | ms | beat |
|---|---|---|
| 0.000 | 0 | idle lock screen (state carries chips only after first loop — implement as: chips visible iff `loopIndex>0`; simpler: chips fade out during the gallery phase (step 3) where the reference's tiny card hides them anyway) |
| 0.055 | 1500 | dot fades in center, grows 0.6→1 over 600 ms, holds |
| 0.130 | 3600 | zoom out: screen → scale 0.60, translateX −44; gallery card fades in at right (scale 0.6 tile, "Home Screen"), labels + Customize pill fade in; dot fades |
| 0.200 | 5500 | hold gallery |
| 0.255 | 7000 | dot on left card, grows large 800 ms |
| 0.290 | 8000 | zoom in: screen → scale 1, translateX 0; edit frames fade in (date, clock, add-widgets pill), gallery/customize fade out |
| 0.320 | 8800 | hold edit mode |
| 0.390 | 10700 | dot taps "Add widgets" pill (500 ms) |
| 0.410 | 11300 | picker sheet slides up (translateY 150→0, 420 ms), dim to 0.18 |
| 0.430 | 11800 | hold sheet |
| 0.500 | 13750 | dot on app row (500 ms) |
| 0.520 | 14300 | sheet expands to detail (height 150→235, title/sub/preview fade in, 500 ms) |
| 0.545 | 15000 | hold detail |
| 0.600 | 16500 | chip 1 slides in from left (translateX −60→0, opacity 0→1, 480 ms ease-out) with "–" badge |
| 0.650 | 17900 | chip 2 slides in beside it (same motion) |
| 0.700 | 19250 | hold |
| 0.740 | 20350 | dot on sheet ✕ (400 ms); sheet slides down (400 ms), dim to 0 |
| 0.775 | 21300 | Cancel/Done fade in at top; hold |
| 0.830 | 22800 | dot on Done grows (600 ms) |
| 0.860 | 23650 | edit chrome (frames, badges, Cancel/Done, add-pill) fades out 400 ms → clean screen with chips |
| 0.880 | 24200 | hold finished state |
| 0.960 | 26400 | chips fade out 300 ms (reset for seamless restart — the reference resets while zoomed out; fading here reads as "loop") — OR keep chips and let the next long-press proceed with them (truer). **Choose: keep chips through the seam, fade them out during the gallery zoom-out of the next cycle** (they're invisible at scale 0.6 tile size anyway). |
| 1.000 | 27500 | → 0 |

Visual spec (from frames): mock lock screen is near-white `#F4F5F9` on gray bezel; date 9pt gray, clock 46pt `#6C7291`-ish gray, edit frames = 1pt rounded-rect outlines `#C9CDDB`; picker sheet `#E4E6EE` gray with rounded top corners; chips in edit mode = **light glassy gray** (`rgba(255,255,255,.75)` over the screen) with 7pt gray text and a 10pt "–" badge circle top-left; finished chips = plain text (no chip background) two columns under the clock (see frame at t≈24 s: text-only quotes without pill background). Dot `#3A3F52` @ 0.85 with soft outer ring.
