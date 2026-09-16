#!/usr/bin/env python3.12
"""Собрать data/ideas.json для сайта из data/catalog.jsonl.

    python3.12 tools/build.py

catalog.jsonl — источник каталога, по одной идее на строку:
поля title, desc, diff, section, tags, link, video. Его можно править руками.
"""
import argparse
import json
import pathlib
import re
import sys

FIELDS = ("title", "desc", "diff", "section", "tags", "link", "video")

# порядок разделов на сайте: от самых массовых тем к нишевым задаётся вручную,
# чтобы каталог открывался на понятном, а не на случайном разделе
SECTION_ORDER = [
    "Свет и подсветка",
    "Часы и дисплеи",
    "Звук и музыка",
    "Роботы и механика",
    "Умный дом",
    "Мастерская и инструменты",
    "Мебель и интерьер",
    "Игры и игрушки",
    "Гаджеты и носимое",
    "Транспорт",
    "Кухня и быт",
    "Опыты и наука",
    "Печать и станки",
    "Сад и улица",
    "Прочее",
]


def load(path: pathlib.Path) -> list[dict]:
    if not path.exists():
        sys.exit(f"нет файла {path}")
    items = []
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            items.append(json.loads(line))
        except json.JSONDecodeError as e:
            sys.exit(f"{path}:{n}: {e}")
    return items


YT = re.compile(r"(?:youtu\.be/|youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/))([\w-]{6,})")


def youtube_id(link: str) -> str:
    """id ролика — лента крутит его прямо в слайде, а не только ссылкой."""
    m = YT.search(link or "")
    return m.group(1) if m else ""


def clean(raw: list[dict]) -> list[dict]:
    out = []
    for it in raw:
        title = (it.get("title") or "").strip()
        if not title:
            continue
        diff = it.get("diff")
        link = (it.get("link") or "").strip()
        out.append({
            "title": title,
            "desc": (it.get("desc") or "").strip(),
            "diff": diff if isinstance(diff, int) else None,
            "section": (it.get("section") or "Прочее").strip(),
            "tags": [t.strip() for t in (it.get("tags") or []) if t.strip()][:3],
            "link": link,
            "video": (it.get("video") or "").strip(),
            "yt": youtube_id(link),
        })
    return out


def order_sections(items: list[dict]) -> list[str]:
    present = {it["section"] for it in items}
    known = [s for s in SECTION_ORDER if s in present]
    extra = sorted(present - set(SECTION_ORDER))
    return known + extra


def main() -> None:
    root = pathlib.Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=pathlib.Path, default=root / "data" / "catalog.jsonl")
    ap.add_argument("--out", type=pathlib.Path, default=root / "data" / "ideas.json")
    args = ap.parse_args()

    items = clean(load(args.src))
    sections = order_sections(items)
    rank = {s: i for i, s in enumerate(sections)}
    # внутри раздела сначала то, что описано подробнее — карточки-заглушки не должны открывать список
    items.sort(key=lambda it: (rank[it["section"]], -len(it["desc"]), it["title"]))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps({"sections": sections, "ideas": items}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    described = sum(1 for it in items if it["desc"])
    print(f"идей {len(items)}, с описанием {described}, разделов {len(sections)} -> {args.out}")


if __name__ == "__main__":
    main()
