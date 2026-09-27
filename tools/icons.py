#!/usr/bin/env python3.12
"""Build assets/icons.svg: a sprite of the few Phosphor icons the site uses.

    python3.12 tools/icons.py

Pulling the whole icon font would cost hundreds of kilobytes for a dozen
glyphs, so only the listed icons are fetched and stitched into <symbol>s.
"""
import pathlib
import re
import urllib.request

VERSION = "2.1.1"
BASE = f"https://unpkg.com/@phosphor-icons/core@{VERSION}/assets"
ICONS = {
    # sprite id: (weight, file name)
    "search": ("regular", "magnifying-glass"),
    "close": ("regular", "x"),
    "shuffle": ("regular", "shuffle"),
    "play": ("regular", "play"),
    "grid": ("regular", "squares-four"),
    "star": ("regular", "star"),
    "star-fill": ("fill", "star-fill"),
    "mute": ("regular", "speaker-slash"),
    "sound": ("regular", "speaker-high"),
    "out": ("regular", "arrow-up-right"),
    "caret": ("regular", "caret-down"),
    "filters": ("regular", "sliders-horizontal"),
    "image": ("regular", "image"),
}


def fetch(weight: str, name: str) -> str:
    with urllib.request.urlopen(f"{BASE}/{weight}/{name}.svg", timeout=30) as r:
        return r.read().decode()


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent
    symbols = []
    for sid, (weight, name) in ICONS.items():
        svg = fetch(weight, name)
        inner = re.search(r"<svg[^>]*>(.*)</svg>", svg, re.S).group(1).strip()
        symbols.append(f'<symbol id="{sid}" viewBox="0 0 256 256">{inner}</symbol>')
    out = root / "assets" / "icons.svg"
    out.write_text('<svg xmlns="http://www.w3.org/2000/svg" fill="currentColor">\n'
                   + "\n".join(symbols) + "\n</svg>\n", encoding="utf-8")
    print(f"{len(symbols)} icons -> {out}")


if __name__ == "__main__":
    main()
