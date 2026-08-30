## Honest benchmark: can pure GDScript run the 2.9M-param transformer?
## Measures matvec throughput and extrapolates tokens/second.
extends RefCounted

static func run() -> Dictionary:
	var n := 192
	var m := 768
	var w := PackedFloat32Array()
	w.resize(n * m)
	var x := PackedFloat32Array()
	x.resize(n)
	var y := PackedFloat32Array()
	y.resize(m)
	for i in n * m:
		w[i] = 0.01
	for i in n:
		x[i] = 0.5
	var iters := 20
	var t0 := Time.get_ticks_usec()
	for it in iters:
		for r in m:
			var acc := 0.0
			var base := r * n
			for c in n:
				acc += w[base + c] * x[c]
			y[r] = acc
	var dt := (Time.get_ticks_usec() - t0) / 1e6
	var flops := 2.0 * n * m * iters
	var mflops := flops / dt / 1e6
	# forward pass of the shipped model ~ 5.83 MFLOP per token
	var tok_per_s := mflops / 5.83
	return {"mflops": mflops, "est_tokens_per_s": tok_per_s}
