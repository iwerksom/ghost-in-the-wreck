"""Assemble the single-file build from game/ sources.

Two outputs:
  dist/artifact.html      body-only (the Artifact tool wraps it in its own
                          skeleton: <title>, <style>, markup, inline scripts)
  dist/ghost-in-the-wreck.html
                          standalone page, runs from file:// or any static host

Usage:  python3 build_artifact.py [--standalone] [--all]
"""
import os, re, sys, subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.join(ROOT, "game")
DIST = os.path.join(ROOT, "dist")

SCRIPTS = ["weights.js", "calibration.js", "gamedata.js", "lm.js", "audio.js",
           "maps.js", "engine.js", "story.js", "ui.js", "main.js"]

HEAD = (
    '<title>Ghost in the Wreck</title>\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, '
    'maximum-scale=1, user-scalable=no">\n'
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700'
    '&display=swap" rel="stylesheet">\n'
)


def build_body():
    subprocess.run(["node", os.path.join(ROOT, "tools", "build_data.js")], check=True)
    html = open(os.path.join(GAME, "index.html"), encoding="utf-8").read()
    body = html.split("<!-- GAME_BODY_START -->")[1].split("<!-- GAME_BODY_END -->")[0]
    css = open(os.path.join(GAME, "style.css"), encoding="utf-8").read()

    parts = [HEAD, "<style>\n" + css + "\n</style>\n", body]
    for s in SCRIPTS:
        src = open(os.path.join(GAME, s), encoding="utf-8").read()
        src = re.sub(r"if \(typeof module[\s\S]*?;\n?$", "", src.strip())  # strip node export shims
        parts.append("<script>\n%s\n</script>\n" % src)
    return "".join(parts)


def write(path, text):
    os.makedirs(DIST, exist_ok=True)
    open(path, "w", encoding="utf-8").write(text)
    print("%s: %.2f MB" % (os.path.relpath(path, ROOT), len(text.encode("utf-8")) / 1e6))


def main():
    args = sys.argv[1:]
    both = "--all" in args
    body = build_body()
    if both or "--standalone" not in args:
        write(os.path.join(DIST, "artifact.html"), body)
    if both or "--standalone" in args:
        page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
                + body.replace("<title>", "<title>", 1))
        # split head-ish tags from the rest: everything before the first <style> close stays in head
        head_end = page.index("</style>") + len("</style>")
        page = page[:head_end] + "\n</head>\n<body>\n" + page[head_end:] + "\n</body>\n</html>\n"
        write(os.path.join(DIST, "ghost-in-the-wreck.html"), page)


if __name__ == "__main__":
    main()
