#!/usr/bin/env python3.12
"""Проверить каталог перед публикацией.

    python3.12 tools/check.py data/ideas.json

Валит сборку, если в каталоге пустые названия, ломаные ссылки,
сложность вне шкалы или раздел, которого нет в списке разделов.
"""
import json
import pathlib
import re
import sys

MAX_TITLE = 90


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("укажи путь к ideas.json")
    path = pathlib.Path(sys.argv[1])
    if not path.exists():
        sys.exit(f"нет файла {path} — сначала make build")

    root = pathlib.Path(__file__).resolve().parent.parent
    data = json.loads(path.read_text(encoding="utf-8"))
    ideas = data.get("ideas") or []
    sections = set(data.get("sections") or [])
    problems = []

    for n, it in enumerate(ideas, 1):
        title = it.get("title", "")
        if not title:
            problems.append(f"#{n}: пустое название")
        elif len(title) > MAX_TITLE:
            problems.append(f"#{n}: название длиннее {MAX_TITLE} символов — {title[:40]}…")
        if it.get("section") not in sections:
            problems.append(f"#{n}: раздел вне списка — {it.get('section')!r}")
        diff = it.get("diff")
        if diff is not None and not (isinstance(diff, int) and 0 <= diff <= 10):
            problems.append(f"#{n}: сложность вне шкалы — {diff!r}")
        link = it.get("link") or ""
        if link and not re.match(r"^https?://", link):
            problems.append(f"#{n}: link не похоже на ссылку — {link[:40]}")
        # видео лежит либо в репозитории рядом с сайтом, либо на стороннем хосте
        video = it.get("video") or ""
        if video and not re.match(r"^(https?://\S+\.(mp4|webm)|assets/video/[\w.\-]+\.(mp4|webm))$", video):
            problems.append(f"#{n}: video не похоже на путь к ролику — {video[:40]}")
        if video and video.startswith("assets/") and not (root / video).exists():
            problems.append(f"#{n}: файла нет — {video}")

        image = it.get("image") or ""
        if image and not re.match(r"^(https?://\S+\.(jpg|jpeg|png|webp)|assets/img/[\w.\-]+)$", image):
            problems.append(f"#{n}: image не похоже на путь к картинке — {image[:40]}")

    described = sum(1 for it in ideas if it.get("desc"))
    rated = sum(1 for it in ideas if it.get("diff") is not None)
    print(f"идей {len(ideas)}, с описанием {described}, с оценкой {rated}, разделов {len(sections)}")

    if problems:
        for p in problems[:20]:
            print("  !", p)
        if len(problems) > 20:
            print(f"  … и ещё {len(problems) - 20}")
        sys.exit(f"проблем: {len(problems)}")
    print("каталог в порядке")


if __name__ == "__main__":
    main()
