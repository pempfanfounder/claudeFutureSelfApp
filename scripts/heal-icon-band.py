#!/usr/bin/env python3
"""Heal the darker vertical band baked into the left margin of the icon assets.

Diagnosis (feedback: "the left side of the logo has a vertical line that is a
different color"): `assets/images/splash-icon.png` (512 px) and `icon.png`
(1024 px) carry a darker column band a few px inside the left edge — a
resampling artefact of the source export (mean RGB ≈ 230/219/206 against
≈ 242/231/219 for the rest of the linen; right/top/bottom edges are clean).
Rendered at 96 pt on the welcome screen it reads as a 2–4 pt darker line, and
it ships in the App Store icon and the splash. This script removes it in a
reproducible, seam-free way and verifies the result:

  1. measure per-column mean RGB over the middle rows (h/4 .. 3h/4);
  2. detect the contiguous run of left-margin columns whose luminance is more
     than BAND_THRESHOLD below the median of the clean columns w/8 .. w/4,
     plus the brighter overshoot ring right of it (same resampling artefact,
     +3..4 over a few columns) so the whole disturbance is treated at once;
  3. replace the run (+ MARGIN px either side) with linen taken from the SAME
     rows of the horizontally mirrored right-edge strip (column w-1-x), so the
     texture statistics match; the strip is shifted inward only as far as
     needed to clear any foreground mark it would otherwise copy (the diamond
     in the bottom-right corner) and to keep its column means within
     TOLERANCE of the reference; the patch is blended with a feathered alpha
     ramp over FEATHER px at both seams so no new seam appears;
  4. re-measure and assert every touched column's mean is within TOLERANCE of
     the reference median, that nothing outside the touched columns changed,
     and that the "fs" glyph / dot / diamond were never inside the patch;
  5. save in place (same size, same mode, PNG optimize=True).

The four corners and the top/bottom rows are measured too, because the
splash image is shown unmasked (iOS only masks the app icon).

Usage:
  python3 scripts/heal-icon-band.py                 # heal both default assets
  python3 scripts/heal-icon-band.py --check [PATH…] # measure and report only
  python3 scripts/heal-icon-band.py PATH…           # heal the given PNGs

Requires Pillow and numpy (python3 -m pip install pillow numpy).
"""

from __future__ import annotations

import argparse
import os
import sys

import numpy as np
from PIL import Image

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_ASSETS = [
    os.path.join(REPO_ROOT, "assets", "images", "splash-icon.png"),
    os.path.join(REPO_ROOT, "assets", "images", "icon.png"),
]

# Detection / patching parameters (px, luminance units on a 0–255 scale).
BAND_THRESHOLD = 4.0  # a column is "dark" when lum < ref - BAND_THRESHOLD
MAX_BAND_FRACTION = 0.08  # the band must live entirely in the left 8 % margin
MARGIN = 2  # extra columns replaced either side of the detected run
FEATHER = 4  # alpha ramp length at each seam
TOLERANCE = 2.5  # every touched column must end within ±TOLERANCE of ref
RING_THRESHOLD = 2.0  # 3-col smoothed lum > ref + this = overshoot ring column
RING_PEAK = 2.5  # ... and the ring run must peak above this to count
RING_LOOKAHEAD = 8  # the ring must begin within this many px of the band's end
FEATURE_THRESHOLD = 8.0  # blurred two-way luminance deviation above this = a drawn mark
REPORT_COLUMNS = 48  # print before/after means for the left N columns

LUMA = np.array([0.299, 0.587, 0.114])


# --------------------------------------------------------------------------- #
# measurement helpers
# --------------------------------------------------------------------------- #
def content_box(arr: np.ndarray) -> tuple[int, int, int, int]:
    """(x0, y0, x1, y1) inclusive bbox of the opaque content (whole image if
    the image is fully opaque, e.g. splash-icon/icon; the opaque square of an
    adaptive-icon foreground layer otherwise)."""
    h, w = arr.shape[:2]
    if arr.shape[2] == 4 and (arr[..., 3] < 255).any():
        ys, xs = np.where(arr[..., 3] > 0)
        return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
    return 0, 0, w - 1, h - 1


def luminance(rgb: np.ndarray) -> np.ndarray:
    return rgb @ LUMA


def column_profile(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-column mean RGB and luminance over the middle rows h/4 .. 3h/4.
    Every row is used: it is cheap at these sizes and the middle half avoids
    the top/bottom margins where the linen is a touch brighter."""
    h = rgb.shape[0]
    mid = rgb[h // 4 : 3 * h // 4]
    means = mid.mean(axis=0)
    return means, luminance(means)


def row_profile(rgb: np.ndarray) -> np.ndarray:
    """Per-row mean luminance over the middle columns w/4 .. 3w/4."""
    w = rgb.shape[1]
    return luminance(rgb[:, w // 4 : 3 * w // 4].mean(axis=1))


def reference(lum: np.ndarray) -> float:
    w = lum.shape[0]
    return float(np.median(lum[w // 8 : w // 4]))


def dark_runs(lum: np.ndarray, ref: float, limit: int) -> list[tuple[int, int]]:
    """Contiguous runs of columns x < limit with lum < ref - BAND_THRESHOLD."""
    dark = lum[:limit] < ref - BAND_THRESHOLD
    runs: list[tuple[int, int]] = []
    start = None
    for x, is_dark in enumerate(dark):
        if is_dark and start is None:
            start = x
        elif not is_dark and start is not None:
            runs.append((start, x - 1))
            start = None
    if start is not None:
        runs.append((start, limit - 1))
    return runs


def detect_band(lum: np.ndarray, ref: float) -> tuple[int, int] | None:
    """The darker band = the left-margin run with the largest total deficit."""
    limit = int(lum.shape[0] * MAX_BAND_FRACTION)
    runs = dark_runs(lum, ref, limit)
    if not runs:
        return None
    return max(runs, key=lambda r: float((ref - lum[r[0] : r[1] + 1]).sum()))


def detect_ring(lum: np.ndarray, ref: float, band_end: int) -> tuple[int, int] | None:
    """The brighter overshoot right of the dark band (the first side-lobe of
    the same resampling filter: +3..4 over 5..9 columns in these assets). It is
    part of the same artefact and would otherwise bleed into the feathered
    seam, so the patch is extended over it. Detected on a 3-column moving
    average (single linen threads reach ±3 on their own, the ring is wider):
    a run above RING_THRESHOLD that begins within RING_LOOKAHEAD columns of
    the band and peaks above RING_PEAK."""
    limit = int(lum.shape[0] * MAX_BAND_FRACTION)
    smooth = np.convolve(lum - ref, np.ones(3) / 3, mode="same")
    last_start = min(band_end + RING_LOOKAHEAD, limit - 1)
    x = band_end + 1
    while x <= last_start and smooth[x] <= RING_THRESHOLD:
        x += 1
    if x > last_start:
        return None
    start = x
    while x + 1 < limit and smooth[x + 1] > RING_THRESHOLD:
        x += 1
    if smooth[start : x + 1].max() < RING_PEAK:
        return None
    return start, x


def box_blur(a: np.ndarray, r: int) -> np.ndarray:
    """(2r+1)² mean filter via summed-area table (edge-padded)."""
    k = 2 * r + 1
    p = np.pad(a, r, mode="edge")
    c = np.pad(np.cumsum(np.cumsum(p, axis=0), axis=1), ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def feature_mask(rgb: np.ndarray) -> np.ndarray:
    """True where something other than plain linen is drawn (glyph, dot,
    diamond): a box-blurred luminance that deviates from its row AND column
    medians (so a full-height column band, i.e. the defect itself, and the
    gentle top/bottom brightening are not marks) by more than
    FEATURE_THRESHOLD, dilated by three times the blur radius. The radius scales
    with the image so one threshold works at 512 and 1024 px."""
    w = rgb.shape[1]
    r = max(4, round(w / 128))
    blurred = box_blur(luminance(rgb), r)
    row_med = np.median(blurred[:, w // 2 :], axis=1)  # right half: no band
    col_med = np.median(blurred, axis=0)
    two_way = blurred - row_med[:, None] - col_med[None, :] + np.median(blurred)
    mask = np.abs(two_way) > FEATURE_THRESHOLD
    grown = box_blur(mask.astype(float), 3 * r) > 0
    return grown


def corner_report(lum2d: np.ndarray, ref: float) -> dict[str, float]:
    h, w = lum2d.shape
    b = max(16, round(w * 0.047))  # 24 px at 512, 48 px at 1024
    return {
        "top-left": float(lum2d[:b, :b].mean() - ref),
        "top-right": float(lum2d[:b, -b:].mean() - ref),
        "bottom-left": float(lum2d[-b:, :b].mean() - ref),
        "bottom-right": float(lum2d[-b:, -b:].mean() - ref),
        "_block": b,
    }


# --------------------------------------------------------------------------- #
# patching
# --------------------------------------------------------------------------- #
def patch_alpha(w: int, start: int, end: int) -> tuple[np.ndarray, int, int]:
    """Per-column blend weight: 1 over the run ± MARGIN, then a linear ramp
    down to 0 over FEATHER columns on each side. Returns (alpha, x0, x1) with
    x0..x1 the fully replaced core."""
    x0 = max(0, start - MARGIN)
    x1 = min(w - 1, end + MARGIN)
    alpha = np.zeros(w)
    alpha[x0 : x1 + 1] = 1.0
    for i in range(1, FEATHER + 1):
        a = 1.0 - i / (FEATHER + 1)
        if x0 - i >= 0:
            alpha[x0 - i] = a
        if x1 + i < w:
            alpha[x1 + i] = a
    return alpha, x0, x1


def choose_shift(
    rgb: np.ndarray, alpha: np.ndarray, lum_cols: np.ndarray, ref: float
) -> tuple[int, list[str]]:
    """Source column for touched column x is w-1-x-shift (mirror of the right
    edge, shifted inward). Use the smallest shift whose strip (a) stays clear
    of any drawn mark for every row, (b) leaves a gap of FEATHER columns to
    the patch, and (c) has column means within TOLERANCE of ref, so the
    healed columns pass the same check the caller runs afterwards. (c) matters
    because the linen has vertical threads: single clean columns naturally sit
    up to ~±3 from the reference, so the nearest mark-free strip is not
    always the most uniform one."""
    w = rgb.shape[1]
    touched = np.where(alpha > 0)[0]
    marks = feature_mask(rgb)
    notes: list[str] = []
    rejected: list[tuple[int, float]] = []
    for shift in range(0, w // 2):
        src = w - 1 - touched - shift
        if src.min() <= touched.max() + FEATHER:
            break
        if marks[:, src].any():
            if not notes:
                ys, xs = np.where(marks[:, src.min() : src.max() + 1])
                notes.append(
                    "mirrored strip x=%d..%d overlaps a drawn mark at rows %d..%d "
                    "(cols %d..%d) - shifting the source inward"
                    % (
                        src.min(),
                        src.max(),
                        ys.min(),
                        ys.max(),
                        src.min() + xs.min(),
                        src.min() + xs.max(),
                    )
                )
            continue
        predicted = (1 - alpha[touched]) * lum_cols[touched] + alpha[touched] * lum_cols[src]
        worst = float(np.abs(predicted - ref).max())
        if worst > TOLERANCE:
            rejected.append((shift, worst))
            continue
        if rejected:
            notes.append(
                "shifts %d..%d rejected: a source column mean would be up to %.2f "
                "from ref (tolerance %.1f)"
                % (rejected[0][0], rejected[-1][0], max(r[1] for r in rejected), TOLERANCE)
            )
        return shift, notes
    raise SystemExit("no clean source strip found for the patch")


def heal(rgb: np.ndarray, alpha: np.ndarray, shift: int) -> np.ndarray:
    w = rgb.shape[1]
    out = rgb.copy()
    for x in np.where(alpha > 0)[0]:
        src = w - 1 - x - shift
        out[:, x] = (1 - alpha[x]) * rgb[:, x] + alpha[x] * rgb[:, src]
    return out


# --------------------------------------------------------------------------- #
# per-file driver
# --------------------------------------------------------------------------- #
def fmt_row(x: int, before: np.ndarray, after: np.ndarray | None, ref: float) -> str:
    b = "%5.1f %5.1f %5.1f  (%+5.1f)" % (
        before[0],
        before[1],
        before[2],
        luminance(before) - ref,
    )
    if after is None:
        return "  %3d  %s" % (x, b)
    a = "%5.1f %5.1f %5.1f  (%+5.1f)" % (
        after[0],
        after[1],
        after[2],
        luminance(after) - ref,
    )
    return "  %3d  %s   ->   %s" % (x, b, a)


def process(path: str, check_only: bool) -> bool:
    im = Image.open(path)
    im.load()
    if im.mode not in ("RGB", "RGBA"):
        raise SystemExit("%s: unsupported mode %s" % (path, im.mode))
    full = np.asarray(im).astype(np.float64)
    bx0, by0, bx1, by1 = content_box(full)
    canvas = full[by0 : by1 + 1, bx0 : bx1 + 1]
    rgb = canvas[..., :3]
    h, w = rgb.shape[:2]

    print("=" * 78)
    print("%s  %dx%d %s  content box x=%d..%d y=%d..%d" % (
        os.path.relpath(path, REPO_ROOT), im.width, im.height, im.mode, bx0, bx1, by0, by1))

    means, lum = column_profile(rgb)
    ref = reference(lum)
    limit = int(w * MAX_BAND_FRACTION)
    band = detect_band(lum, ref)
    print("reference median luminance (cols %d..%d): %.2f" % (w // 8, w // 4, ref))

    # right edge, top/bottom rows and corners — the splash is shown unmasked
    right_runs = dark_runs(lum[::-1], ref, limit)
    rows = row_profile(rgb)
    row_ref = float(np.median(rows[h // 8 : h // 4]))
    top_runs = dark_runs(rows, row_ref, int(h * MAX_BAND_FRACTION))
    bottom_runs = dark_runs(rows[::-1], row_ref, int(h * MAX_BAND_FRACTION))
    lum2d = luminance(rgb)
    corners = corner_report(lum2d, ref)
    print("right edge: %s" % (
        "clean (no column > %.0f below ref)" % BAND_THRESHOLD if not right_runs
        else "dark runs (from the right edge) %s" % right_runs))
    print("top rows: %s; bottom rows: %s  (row ref %.2f, first/last row %+.1f/%+.1f)" % (
        "clean" if not top_runs else "dark runs %s" % top_runs,
        "clean" if not bottom_runs else "dark runs %s" % bottom_runs,
        row_ref, rows[0] - row_ref, rows[-1] - row_ref))
    print("corners (%dx%d block mean minus ref): TL %+.1f  TR %+.1f  BL %+.1f  BR %+.1f" % (
        corners["_block"], corners["_block"], corners["top-left"], corners["top-right"],
        corners["bottom-left"], corners["bottom-right"]))

    if band is None:
        print("no darker band in the left %d columns - nothing to do" % limit)
        print("left %d column means (R G B, lum-ref):" % REPORT_COLUMNS)
        for x in range(min(REPORT_COLUMNS, w)):
            print(fmt_row(x, means[x], None, ref))
        return False

    start, end = band
    deficit = ref - lum[start : end + 1]
    print("detected band: columns %d..%d (%d px), lum %.1f..%.1f below ref (mean %.1f)" % (
        start, end, end - start + 1, deficit.min(), deficit.max(), deficit.mean()))
    assert end < limit, "band right edge %d is not < %d (w*%.2f)" % (end, limit, MAX_BAND_FRACTION)

    ring = detect_ring(lum, ref, end)
    patch_end = end
    if ring is not None:
        excess = lum[ring[0] : ring[1] + 1] - ref
        print("detected overshoot ring: columns %d..%d (%d px), lum up to %.1f above ref "
              "- patch extended over it" % (ring[0], ring[1], ring[1] - ring[0] + 1, excess.max()))
        patch_end = ring[1]

    alpha, x0, x1 = patch_alpha(w, start, patch_end)
    touched = np.where(alpha > 0)[0]
    assert touched.max() < limit, "patch reaches column %d, beyond the left margin" % touched.max()
    marks = feature_mask(rgb)
    assert not marks[:, touched].any(), "a drawn mark intersects the patch columns"

    shift, notes = choose_shift(rgb, alpha, lum, ref)
    for note in notes:
        print("note: " + note)
    print("patch: replace columns %d..%d fully, feather %d px each side (touching %d..%d); "
          "source = mirrored right edge shifted %d px inward (columns %d..%d)" % (
              x0, x1, FEATHER, touched.min(), touched.max(), shift,
              w - 1 - touched.max() - shift, w - 1 - touched.min() - shift))

    healed = heal(rgb, alpha, shift)
    means_after, lum_after = column_profile(healed)
    dev_after = lum_after - ref
    print("left %d column means (R G B, lum-ref)  before  ->  after:" % REPORT_COLUMNS)
    for x in range(min(REPORT_COLUMNS, w)):
        print(fmt_row(x, means[x], means_after[x], ref))

    worst = np.abs(dev_after[touched]).max()
    smooth_after = np.convolve(dev_after, np.ones(3) / 3, mode="same")
    clean_cols = np.r_[w // 8 : w // 4, w - w // 4 : w - w // 8]
    print("touched columns after: max |lum-ref| = %.2f (tolerance %.1f), mean %+.2f, "
          "3-col smoothed max %.2f; clean columns of this image span up to %.2f" % (
              worst, TOLERANCE, dev_after[touched].mean(),
              np.abs(smooth_after[touched]).max(), np.abs(lum[clean_cols] - ref).max()))
    assert worst <= TOLERANCE, "a healed column is %.2f from the reference" % worst
    assert detect_band(lum_after, ref) is None, "a darker band is still detected"
    assert detect_ring(lum_after, ref, end) is None, "an overshoot ring is still detected"
    untouched = np.setdiff1d(np.arange(w), touched)
    assert np.array_equal(healed[:, untouched], rgb[:, untouched]), "untouched columns changed"

    corners_after = corner_report(luminance(healed), ref)
    print("corners after: TL %+.1f  TR %+.1f  BL %+.1f  BR %+.1f" % (
        corners_after["top-left"], corners_after["top-right"],
        corners_after["bottom-left"], corners_after["bottom-right"]))

    if check_only:
        print("--check: not writing %s" % path)
        return True

    out = full.copy()
    out[by0 : by1 + 1, bx0 : bx1 + 1, :3] = healed
    result = Image.fromarray(np.rint(out).clip(0, 255).astype(np.uint8), im.mode)
    save_kwargs = {"optimize": True}
    if im.info.get("icc_profile"):
        save_kwargs["icc_profile"] = im.info["icc_profile"]
    result.save(path, format="PNG", **save_kwargs)

    # round-trip check on the saved file
    saved = np.asarray(Image.open(path)).astype(np.float64)
    assert saved.shape == full.shape, "size/mode changed on save"
    if saved.shape[2] == 4:
        assert np.array_equal(saved[..., 3], full[..., 3]), "alpha channel changed"
    _, lum_saved = column_profile(saved[by0 : by1 + 1, bx0 : bx1 + 1, :3])
    assert np.abs(lum_saved[touched] - ref).max() <= TOLERANCE + 0.05
    print("saved %s (%d bytes)" % (os.path.relpath(path, REPO_ROOT), os.path.getsize(path)))
    return True


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="*", default=DEFAULT_ASSETS, help="PNG files (default: splash-icon.png, icon.png)")
    ap.add_argument("--check", action="store_true", help="measure and report only; do not write")
    args = ap.parse_args(argv)
    for path in args.paths:
        process(path, args.check)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
