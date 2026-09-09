# Ghost in the Wreck — local gates.
#
# Every target here is the *same command* the factory harness (The Wreck Works)
# runs for the matching pipeline step, so a green `make gate-<step>` locally and
# a green dot in the panel mean identical things. Source of truth: pipeline.json.
#
# Run these under bash (WSL Ubuntu or Linux). Toolchain: node 20+, godot on
# PATH, and `make setup` for the rest — it builds .venv (torch, numpy) and
# installs playwright into test/.

SHELL := /bin/bash

# Python deps live in a venv: Ubuntu 24.04 refuses a system-wide pip install
# (PEP 668). Fall back to the system interpreter when the venv is not built,
# so the gates that need no third-party packages still run.
VENV := .venv
PY   := $(shell [ -x .venv/bin/python3 ] && echo .venv/bin/python3 || echo python3)
.PHONY: help setup data build clean \
        gate-format_spec gate-corpus gate-maps gate-story_data gate-tuning \
        gate-dataset gate-train gate-export gate-calibrate gate-engine gate-build \
        gates

help:
	@echo "setup    install node + python deps"
	@echo "data     regenerate game/maps.js + game/gamedata.js from data/"
	@echo "build    data + single-file pages into dist/"
	@echo "gates    run every automated gate in dependency order"
	@python3 -c "import json;print('gate-<step>  run one gate; steps: '+' '.join(s['id'] for s in json.load(open('pipeline.json'))['steps'] if s['gate'].get('cmd')))"

setup:
	cd test && npm install
	python3 -m venv $(VENV)
	$(PY) -m pip install -r requirements.txt --index-url https://download.pytorch.org/whl/cpu

data:
	node tools/build_data.js

build: data
	$(PY) build_artifact.py --all

clean:
	rm -rf dist

# --- pipeline gates (mirrors pipeline.json) ---

gate-format_spec:
	$(PY) model/prepare.py 2>&1 | grep -q "rejected: {}" && echo PARSER OK

gate-corpus gate-dataset:
	$(PY) model/prepare.py

gate-maps:
	node test/maplint.js && godot --headless --path godot -s res://tests/headless_test.gd

gate-story_data gate-tuning:
	node tools/build_data.js

gate-train:
	grep VAL model/train.log

gate-export:
	$(PY) model/export.py && node test/parity.js

gate-calibrate:
	node test/calibrate.js

gate-engine:
	for f in game/*.js; do node --check $$f || exit 1; done && node test/maplint.js && (cd test && node smoke.js)

gate-build:
	node tools/build_data.js && $(PY) build_artifact.py

# Everything that does not need a fresh training run.
gates: gate-format_spec gate-maps gate-story_data gate-engine gate-calibrate gate-build
	@echo "ALL GATES PASSED"
