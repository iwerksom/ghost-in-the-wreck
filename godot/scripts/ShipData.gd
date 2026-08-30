## Loads the engine-neutral data files shared with the HTML build.
extends Node

const TILE := 32

var decks: Array = []
var story: Dictionary = {}
var tuning: Dictionary = {}

# tile kinds mirrored from the HTML engine
enum T { VOID, FLOOR, WALL, WINDOW, GARDEN, HAZARD, DEBRIS }

func _ready() -> void:
	decks = _load_json("res://data/maps.json")["decks"]
	story = _load_json("res://data/story.json")
	tuning = _load_json("res://data/tuning.json")

func _load_json(path: String) -> Variant:
	var txt := FileAccess.get_file_as_string(path)
	var parsed = JSON.parse_string(txt)
	assert(parsed != null, "failed to parse " + path)
	return parsed

## Parse one deck into {grid: Array[Array[int]], w, h, spawn, entities: Array[Dictionary]}
func parse_deck(idx: int) -> Dictionary:
	var src: Dictionary = decks[idx]
	var rows: Array = src["map"]
	var h := rows.size()
	var w := 0
	for r in rows:
		w = max(w, String(r).length())
	var grid: Array = []
	var entities: Array = []
	var spawn := Vector2i(2, 2)
	for y in h:
		var row: Array = []
		var line := String(rows[y])
		for x in w:
			var ch := line[x] if x < line.length() else " "
			var t := T.VOID
			match ch:
				" ": t = T.VOID
				"#", "%", "*": t = T.WALL
				"W": t = T.WINDOW
				"G": t = T.GARDEN
				"H": t = T.HAZARD
				"~": t = T.DEBRIS
				_: t = T.FLOOR
			row.append(t)
			if ch == "S":
				spawn = Vector2i(x, y)
			elif ch == "O":
				entities.append({"type": "o2", "x": x, "y": y})
			elif ch == "P":
				entities.append({"type": "cell", "x": x, "y": y})
			elif ch == "B":
				entities.append({"type": "body", "x": x, "y": y})
			elif ch == "D":
				entities.append({"type": "door", "x": x, "y": y})
			elif ch >= "1" and ch <= "9":
				var meta: Dictionary = src.get("entities", {}).get(ch, {})
				if not meta.is_empty():
					var e := meta.duplicate()
					e["x"] = x
					e["y"] = y
					entities.append(e)
		grid.append(row)
	return {"src": src, "grid": grid, "w": w, "h": h, "spawn": spawn, "entities": entities}

## Solid check mirroring the HTML engine (interactables block their tile).
func solid_at(deck: Dictionary, tx: int, ty: int, opened: Dictionary = {}, doors_pass: bool = false) -> bool:
	if tx < 0 or ty < 0 or tx >= int(deck["w"]) or ty >= int(deck["h"]):
		return true
	var t: int = deck["grid"][ty][tx]
	if t == T.VOID or t == T.WALL or t == T.WINDOW:
		return true
	for e in deck["entities"]:
		if int(e["x"]) == tx and int(e["y"]) == ty:
			var typ := String(e["type"])
			if typ == "echodoor" and not doors_pass and not opened.get(_ent_key(deck, e), false):
				return true
			if typ in ["lift", "terminal", "archive", "socket", "intercom", "corealtar", "hangar"]:
				return true
	return false

func _ent_key(deck: Dictionary, e: Dictionary) -> String:
	return String(deck["src"]["id"]) + ":" + String(e.get("type", "?")) + ":" + str(e["x"]) + "," + str(e["y"])
