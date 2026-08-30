## Suit-and-lamp player, mirrored from the HTML build's movement feel.
extends CharacterBody2D

func _ready() -> void:
	var shape := CollisionShape2D.new()
	var circ := CircleShape2D.new()
	circ.radius = 9.0
	shape.shape = circ
	add_child(shape)
	var light := PointLight2D.new()
	light.texture = _make_light_texture()
	light.energy = 1.2
	light.texture_scale = 3.0
	add_child(light)

func _physics_process(_delta: float) -> void:
	var speed: float = float(ShipData.tuning["economy"]["player_speed"])
	var dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	velocity = dir * speed
	move_and_slide()

func _draw() -> void:
	draw_circle(Vector2.ZERO, 9.0, Color(0.78, 0.81, 0.87))
	draw_circle(Vector2(0, -2), 5.0, Color(0.11, 0.14, 0.25))
	draw_circle(Vector2(1.4, -3.2), 1.8, Color(0.55, 0.86, 1.0, 0.75))

func _make_light_texture() -> GradientTexture2D:
	var g := Gradient.new()
	g.set_color(0, Color(1, 0.98, 0.9, 1))
	g.set_color(1, Color(0, 0, 0, 0))
	var tex := GradientTexture2D.new()
	tex.gradient = g
	tex.fill = GradientTexture2D.FILL_RADIAL
	tex.fill_from = Vector2(0.5, 0.5)
	tex.fill_to = Vector2(0.5, 0.0)
	tex.width = 256
	tex.height = 256
	return tex
