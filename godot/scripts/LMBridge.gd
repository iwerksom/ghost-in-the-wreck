## The ship-mind interface. One API, two backends:
##  - "js": web exports reuse the proven lm.js engine verbatim through
##    JavaScriptBridge (the exported page includes weights.js + lm.js).
##  - "gdscript": placeholder + benchmark. Pure GDScript is too slow for real
##    inference (see LMBench results in FINDINGS.md); a desktop build needs a
##    GDExtension (C/Rust) backend implementing this same interface.
extends Node

var backend := "none"

func _ready() -> void:
	if OS.has_feature("web"):
		backend = "js"
	else:
		backend = "gdscript_stub"

func is_loaded() -> bool:
	if backend == "js":
		return bool(JavaScriptBridge.eval("typeof LM !== 'undefined' && LM.isLoaded"))
	return false

## Generate text from a prompt. Web: synchronous bridge call into lm.js with
## budgetMsPerFrame disabled and a token cap keeps it under ~1.5 s; a polished
## port would use a callback per token (JavaScriptBridge.create_callback).
func generate(prompt: String, max_tokens: int = 120) -> String:
	if backend == "js":
		var js := "window.__gd_out = null; LM.generate(%s, {maxTokens: %d, budgetMsPerFrame: 1e9}).then(t => window.__gd_out = t);" % [JSON.stringify(prompt), max_tokens]
		JavaScriptBridge.eval(js)
		# poll for the promise (slice-level simplicity)
		for i in 600:
			OS.delay_msec(10)
			var out = JavaScriptBridge.eval("window.__gd_out")
			if out != null:
				return String(out)
		return ""
	return ShipData.story["fallback"]["log"]

## Judge whose voice a line carries. Web backend mirrors Story.judgeVoice.
func judge_voice(text: String) -> Dictionary:
	if backend == "js":
		var js := """
window.__gd_judge = null;
(async () => {
  const CREW = %s;
  const prefixes = CREW.map(c => ({ key: c, prefix: `[VOICE:${c}]` }));
  const res = await LM.scorePrefixes(prefixes, " " + %s + " [END]", {budgetMsPerFrame: 1e9});
  window.__gd_judge = JSON.stringify(res);
})();""" % [JSON.stringify(ShipData.story["crew"].filter(func(c): return c != "ECHO")), JSON.stringify(text)]
		JavaScriptBridge.eval(js)
		for i in 1200:
			OS.delay_msec(10)
			var out = JavaScriptBridge.eval("window.__gd_judge")
			if out != null:
				return {"scores": JSON.parse_string(String(out))}
		return {}
	return {}
