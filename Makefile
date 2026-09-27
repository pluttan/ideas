# Каталог идей — статический сайт, собирается из data/catalog.jsonl

PY   := python3.12
PORT ?= 8777

.PHONY: all build serve check deploy clean posters icons

all: build check

build:
	$(PY) tools/build.py

check:
	$(PY) tools/check.py data/ideas.json

# stills for the local clips; channel clips get theirs in the ideas-clips repo
posters:
	mkdir -p assets/poster
	for f in assets/video/*.mp4; do \
	  ffmpeg -v error -y -ss 1 -i "$$f" -frames:v 1 -vf "scale=min(640\\,iw):-2" -q:v 4 \
	    "assets/poster/$$(basename "$$f" .mp4).jpg"; \
	done

icons:
	$(PY) tools/icons.py

serve:
	@echo "http://localhost:$(PORT)"
	$(PY) -m http.server $(PORT)

deploy:
	git add -A && git commit -m "update catalog" || true
	git push origin main

clean:
	rm -f data/ideas.json
