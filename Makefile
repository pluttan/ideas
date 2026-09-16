# Каталог идей — статический сайт, собирается из data/catalog.jsonl

PY   := python3.12
PORT ?= 8777

.PHONY: all build serve check deploy clean

all: build check

build:
	$(PY) tools/build.py

check:
	$(PY) tools/check.py data/ideas.json

serve:
	@echo "http://localhost:$(PORT)"
	$(PY) -m http.server $(PORT)

deploy:
	git add -A && git commit -m "update catalog" || true
	git push origin main

clean:
	rm -f data/ideas.json
