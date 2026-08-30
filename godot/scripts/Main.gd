## Vertical slice: deck 1 (Hydroponics) walkable, one voice door, interact prompt.
extends Node2D

var deck: Dictionary
var opened: Dictionary = {}
var near_entity: Dictionary = {}
var player: CharacterBody2D
var prompt_label: Label

func _ready() -> void:
	deck = ShipData.parse_deck(1)
	var renderer := Node2D.new()
	renderer.set_script(load("res://scripts/DeckRenderer.gd"))
	add_child(renderer)
	renderer.setup(deck)
	_build_collision()
	_spawn_player()
	_build_ui()
	# darkness + player light
	var modulate_layer := CanvasModulate.new()
	modulate_layer.color = Color(0.28, 0.30, 0.40)
	add_child(modulate_layer)

func _build_collision() -> void:
	var body := StaticBody2D.new()
	add_child(body)
	var TS := ShipData.TILE
	for y in int(deck["h"]):
		for x in int(deck["w"]):
			if ShipData.solid_at(deck, x, y, opened):
				var cs := CollisionShape2D.new()
				var rect := RectangleShape2D.new()
				rect.size = Vector2(TS, TS)
				cs.shape = rect
				cs.position = Vector2(x * TS + TS / 2.0, y * TS + TS / 2.0)
				body.add_child(cs)

func _spawn_player() -> void:
	player = CharacterBody2D.new()
	player.set_script(load("res://scripts/Player.gd"))
	var sp: Vector2i = deck["spawn"]
	player.position = Vector2(sp.x * ShipData.TILE + 16, sp.y * ShipData.TILE + 16)
	add_child(player)
	var cam := Camera2D.new()
	cam.zoom = Vector2(1.3, 1.3)
	cam.position_smoothing_enabled = true
	player.add_child(cam)

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	prompt_label = Label.new()
	prompt_label.position = Vector2(480, 730)
	prompt_label.add_theme_color_override("font_color", Color(0.85, 0.90, 1.0))
	layer.add_child(prompt_label)

func _process(_delta: float) -> void:
	near_entity = {}
	var best := 46.0 * 46.0
	for e in deck["entities"]:
		if not String(e["type"]) in ["terminal", "echodoor", "lift", "intercom", "archive", "socket", "body"]:
			continue
		var c := Vector2(int(e["x"]) * 32 + 16, int(e["y"]) * 32 + 16)
		var d2 := player.position.distance_squared_to(c)
		if d2 < best:
			best = d2
			near_entity = e
	prompt_label.text = ("[E] " + String(near_entity.get("label", near_entity.get("type", "")))) if not near_entity.is_empty() else ""
	if Input.is_action_just_pressed("ui_accept") and not near_entity.is_empty():
		_interact(near_entity)

func _interact(e: Dictionary) -> void:
	match String(e["type"]):
		"echodoor":
			# slice: judge via LMBridge on web, otherwise report backend status
			if LMBridge.is_loaded():
				var res := LMBridge.judge_voice("The seedlings need misting today.")
				print("voice judgment: ", res)
			else:
				prompt_label.text = "voice door: ship-mind backend '%s' not loaded (see FINDINGS.md)" % LMBridge.backend
		"terminal":
			prompt_label.text = "terminal: would call LMBridge.generate('[LOG:%s:D123]\\n')" % String(e.get("author", "?"))
		_:
			prompt_label.text = "interacted: " + String(e["type"])
