## Draws a deck from the shared JSON data, matching the HTML build's palette.
extends Node2D

var deck: Dictionary
var hue: float = 0.54

func setup(d: Dictionary) -> void:
	deck = d
	hue = float(d["src"].get("hue", 195)) / 360.0
	queue_redraw()

func _draw() -> void:
	if deck.is_empty():
		return
	var TS := ShipData.TILE
	for y in int(deck["h"]):
		for x in int(deck["w"]):
			var t: int = deck["grid"][y][x]
			var r := Rect2(x * TS, y * TS, TS, TS)
			match t:
				ShipData.T.WALL:
					draw_rect(r, Color.from_hsv(hue, 0.15, 0.20))
					draw_rect(Rect2(r.position, Vector2(TS, 3)), Color.from_hsv(hue, 0.24, 0.30))
				ShipData.T.WINDOW:
					draw_rect(r, Color(0.02, 0.03, 0.07))
					draw_rect(r.grow(-2), Color.from_hsv(hue, 0.25, 0.30), false, 2.0)
				ShipData.T.FLOOR, ShipData.T.DEBRIS:
					draw_rect(r, Color.from_hsv(hue, 0.11, 0.10))
					draw_rect(r, Color(1, 1, 1, 0.03), false, 1.0)
				ShipData.T.GARDEN:
					draw_rect(r, Color.from_hsv(hue, 0.11, 0.12))
					draw_rect(r, Color(0.24, 0.63, 0.31, 0.18))
				ShipData.T.HAZARD:
					draw_rect(r, Color.from_hsv(hue, 0.11, 0.10))
					draw_rect(r, Color(1.0, 0.43, 0.16, 0.25))
	# entities as simple glyphs (slice-level art)
	for e in deck["entities"]:
		var c := Vector2(int(e["x"]) * TS + TS / 2.0, int(e["y"]) * TS + TS / 2.0)
		match String(e["type"]):
			"o2":
				draw_rect(Rect2(c - Vector2(4, 8), Vector2(8, 16)), Color(0.62, 0.85, 0.91))
			"cell":
				draw_rect(Rect2(c - Vector2(6, 5), Vector2(12, 10)), Color(1.0, 0.84, 0.42))
			"terminal", "archive", "intercom":
				draw_rect(Rect2(c - Vector2(11, 13), Vector2(22, 26)), Color(0.06, 0.08, 0.09))
				draw_rect(Rect2(c - Vector2(8, 10), Vector2(16, 11)), Color(0.43, 0.92, 0.75, 0.8))
			"echodoor":
				draw_rect(Rect2(c - Vector2(15, 15), Vector2(30, 30)), Color.from_hsv(hue, 0.22, 0.22))
				draw_arc(c, 9.0, 0.0, TAU, 24, Color(0.73, 0.54, 1.0), 2.0)
			"lift":
				draw_rect(Rect2(c - Vector2(14, 14), Vector2(28, 28)), Color(0.05, 0.06, 0.08))
				draw_rect(Rect2(c - Vector2(13, 13), Vector2(26, 26)), Color(0.49, 1.0, 0.75, 0.7), false, 2.0)
			"socket":
				draw_rect(Rect2(c - Vector2(10, 10), Vector2(20, 20)), Color(0.08, 0.09, 0.11))
				draw_rect(Rect2(c - Vector2(4, 4), Vector2(8, 8)), Color(1.0, 0.84, 0.42, 0.6))
			"body":
				draw_circle(c, 15.0, Color(0.78, 0.82, 0.92, 0.10))
				draw_circle(c + Vector2(0, -6), 5.0, Color(0.35, 0.38, 0.49))
