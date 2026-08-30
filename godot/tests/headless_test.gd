## Headless verification of the Godot slice:
##  1. data files load and every deck parses
##  2. reachability: spawn reaches every interactable on every deck
##  3. GDScript inference benchmark (the go/no-go number for a native backend)
## Run: godot --headless --path . -s res://tests/headless_test.gd
extends SceneTree

func _init() -> void:
	var ship: Node = load("res://scripts/ShipData.gd").new()
	ship._ready()
	var fails := 0

	for i in ship.decks.size():
		var d: Dictionary = ship.parse_deck(i)
		# flood fill from spawn over non-solid tiles; interactables count as
		# reachable when adjacent to a reached tile
		var reached := {}
		var q: Array = [d["spawn"]]
		reached[d["spawn"]] = true
		while not q.is_empty():
			var p: Vector2i = q.pop_back()
			for off in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				var n: Vector2i = p + off
				if reached.has(n):
					continue
				if not ship.solid_at(d, n.x, n.y, {}, true):
					reached[n] = true
					q.append(n)
		var unreachable := 0
		for e in d["entities"]:
			var pos := Vector2i(int(e["x"]), int(e["y"]))
			var ok := false
			for off in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				if reached.has(pos + off):
					ok = true
			if not ok:
				unreachable += 1
				print("  UNREACHABLE on %s: %s at %s" % [d["src"]["id"], e["type"], pos])
		if unreachable > 0:
			fails += 1
		print("deck %s: %d tiles reached, %d entities, %d unreachable" % [d["src"]["id"], reached.size(), d["entities"].size(), unreachable])

	print("story archives: ", ship.story["archives"].keys())
	print("tuning o2_tank_seconds: ", ship.tuning["economy"]["o2_tank_seconds"])

	var bench: Dictionary = load("res://scripts/LMBench.gd").run()
	print("GDScript matvec: %.1f MFLOPS -> est %.2f tokens/s (need ~15+ for play; JS engine does ~100)" % [bench["mflops"], bench["est_tokens_per_s"]])

	print("HEADLESS TEST " + ("FAILED" if fails > 0 else "PASSED"))
	quit(1 if fails > 0 else 0)
