# Ghost in the Wreck — local gates.
#
# Every target here is the *same command* the factory harness (The Wreck Works)
# runs for the matching pipeline step, so a green `make gate-<step>` locally and
# a green dot in the panel mean identical things. Source of truth: pipeline.json.
#
# Run these under bash (WSL Ubuntu or Linux). Toolchain: node 20+, python3+torch,
# godot on PATH, playwright installed in test/.

SHELL := /bin/bash
.PHONY: help setup data build clean \
        gate-format_spec gate-corpus gate-maps gate-story_data gate-tuning \
        gate-dataset gate-train gate-export gate-calibrate gate-engine gate-build \
        gates

help:
	@echo "setup    install node + python deps"
	@echo "data     regenerate game/maps.js + game/gamedata.js from data/"
	@echo "build    data + single-file pages into dist/"
	@echo "gates    run every automated gate in dependency order"
	@echo "gate-<step>  run one gate; steps: $$(python3 -c \"import json;print(' '.join(s['id'] for s in json.load(open('pipeline.json'))['steps'] if s['gate'].get('cmd')))\")"

setup:
	cd test && npm install
	python3 -m pip install -r requirements.txt

data:
	node tools/build_data.js

build: data
	python3 build_artifact.py --all

clean:
	rm -rf dist

# --- pipeline gates (mirrors pipeline.json) ---

gate-format_spec:
	python3 model/prepare.py 2>&1 | grep -q "rejected: {}" && echo PARSER OK

gate-corpus gate-dataset:
	python3 model/prepare.py

gate-maps:
	node test/maplint.js && godot --headless --path godot -s res://tests/headless_test.gd

gate-story_data gate-tuning:
	node tools/build_data.js

gate-train:
	grep VAL model/train.log

gate-export:
	python3 model/export.py && node test/parity.js

gate-calibrate:
	node test/calibrate.js

gate-engine:
	for f in game/*.js; do node --check $$f || exit 1; done && node test/maplint.js && (cd test && node smoke.js)

gate-build:
	node tools/build_data.js && python3 build_artifact.py

# Everything that does not need a fresh training run.
gates: gate-format_spec gate-maps gate-story_data gate-engine gate-calibrate gate-build
	@echo "ALL GATES PASSED"
