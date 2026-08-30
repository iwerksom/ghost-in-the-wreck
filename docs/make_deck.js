// Ghost in the Wreck — non-technical process presentation
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const Fi = require("react-icons/fi");

const ROOT = require("path").resolve(__dirname, "..");
const SHOTS = ROOT + "/test/shots/";

// palette — the game's own world
const BG = "0B0E1A";       // deep space
const PANEL = "151B30";    // raised panel
const PANEL2 = "101526";
const INK = "E8EEFF";      // ice white
const MUTED = "8FA3C8";    // dim blue
const PURPLE = "B98AFF";   // ECHO
const TEAL = "7CFFBE";     // terminal green
const GOLD = "FFD76A";

async function icon(name, color, px = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Fi[name], { color: "#" + color, size: px, strokeWidth: 1.6 }));
  const buf = await sharp(Buffer.from(svg)).resize(px, px).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

(async () => {
  const icons = {};
  for (const [k, n, c] of [
    ["ship", "FiCompass", PURPLE], ["book", "FiBookOpen", TEAL], ["mic", "FiMic", GOLD],
    ["cpu", "FiCpu", PURPLE], ["off", "FiWifiOff", TEAL], ["bug", "FiCrosshair", GOLD],
    ["users", "FiUsers", PURPLE], ["eye", "FiEye", TEAL], ["shuffle", "FiShuffle", GOLD],
    ["play", "FiPlay", BG], ["feather", "FiFeather", PURPLE], ["repeat", "FiRepeat", TEAL],
  ]) icons[k] = await icon(n, c);

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
  const W = 13.33, H = 7.5;

  const dark = s => { s.background = { color: BG }; };
  const tag = (s, text, x, y, color = PURPLE) => s.addText("[ " + text + " ]", {
    x, y, w: 4.6, h: 0.32, fontFace: "Courier New", fontSize: 12, color, charSpacing: 2, isTextBox: true, margin: 0,
  });
  const shot = (s, file, x, y, w, h) => {
    s.addShape("rect", { x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08, fill: { color: PANEL }, line: { color: "2A3556", width: 1 } });
    s.addImage({ path: SHOTS + file, x, y, w, h });
  };

  // ---------------------------------------------------------------- 1 TITLE
  let s = pres.addSlide(); dark(s);
  shot(s, "01_title.png", 7.0, 1.15, 5.7, 3.56);
  s.addText("how we sealed a living neural network inside a video game", {
    x: 0.7, y: 5.05, w: 11.9, h: 0.4, fontFace: "Courier New", fontSize: 13, color: TEAL, charSpacing: 1.5, isTextBox: true, margin: 0,
  });
  s.addText("GHOST IN\nTHE WRECK", {
    x: 0.62, y: 1.5, w: 6.3, h: 2.6, fontFace: "Courier New", fontSize: 54, bold: true, color: INK, isTextBox: true, margin: 0, lineSpacing: 60,
  });
  s.addText("The making of, told in plain language", {
    x: 0.7, y: 4.15, w: 6.0, h: 0.4, fontFace: "Calibri", fontSize: 16, color: MUTED, isTextBox: true, margin: 0,
  });
  s.addText("Raw Power Labs  ·  August 2026  ·  built end to end by Claude", {
    x: 0.7, y: 6.6, w: 11.9, h: 0.35, fontFace: "Calibri", fontSize: 12, color: MUTED, isTextBox: true, margin: 0,
  });

  // ---------------------------------------------------------------- 2 THE CHALLENGE
  s = pres.addSlide(); dark(s);
  tag(s, "THE CHALLENGE", 0.7, 0.55);
  s.addText("Make a game no script could fake", {
    x: 0.7, y: 0.95, w: 11.9, h: 0.75, fontFace: "Courier New", fontSize: 32, bold: true, color: INK, isTextBox: true, margin: 0,
  });
  const brief = [
    ["A full game, not a demo", "A complete story with a beginning, choices that matter, and three different endings."],
    ["Playable by anyone", "One link, any browser, any device. No downloads, no installs, no accounts."],
    ["Visibly impossible to script", "Players must be able to type anything at all and get an answer no writer could have prepared in advance."],
  ];
  brief.forEach(([h, b], i) => {
    const y = 2.1 + i * 1.5;
    s.addShape("roundRect", { x: 0.7, y, w: 7.3, h: 1.25, rectRadius: 0.08, fill: { color: PANEL } });
    s.addText(h, { x: 1.0, y: y + 0.14, w: 6.8, h: 0.4, fontFace: "Calibri", fontSize: 17, bold: true, color: TEAL, isTextBox: true, margin: 0 });
    s.addText(b, { x: 1.0, y: y + 0.55, w: 6.8, h: 0.6, fontFace: "Calibri", fontSize: 13.5, color: INK, isTextBox: true, margin: 0 });
  });
  s.addShape("roundRect", { x: 8.4, y: 2.1, w: 4.2, h: 4.4, rectRadius: 0.08, fill: { color: PANEL2 }, line: { color: PURPLE, width: 1 } });
  s.addText("THE ANSWER", { x: 8.75, y: 2.45, w: 3.5, h: 0.3, fontFace: "Courier New", fontSize: 11, color: PURPLE, charSpacing: 2, isTextBox: true, margin: 0 });
  s.addText("Don't write the ghost.\nGrow one.", { x: 8.75, y: 2.85, w: 3.6, h: 1.1, fontFace: "Calibri", fontSize: 21, bold: true, color: INK, isTextBox: true, margin: 0 });
  s.addText("We trained a small artificial mind from nothing, taught it to speak like a dead ship's crew, and sealed it whole inside the game's single web page.", {
    x: 8.75, y: 4.05, w: 3.6, h: 2.2, fontFace: "Calibri", fontSize: 13.5, color: MUTED, isTextBox: true, margin: 0, lineSpacing: 19,
  });

  // ---------------------------------------------------------------- 3 WHAT PLAYERS DO
  s = pres.addSlide(); dark(s);
  tag(s, "THE GAME", 0.7, 0.55);
  s.addText("Alone on a ship that remembers", {
    x: 0.7, y: 0.95, w: 11.9, h: 0.75, fontFace: "Courier New", fontSize: 32, bold: true, color: INK, isTextBox: true, margin: 0,
  });
  shot(s, "30_deck1.png", 0.7, 2.1, 6.4, 4.0);
  s.addText("Hydroponics deck. Something green survived three hundred years.", {
    x: 0.7, y: 6.25, w: 6.4, h: 0.35, fontFace: "Calibri", fontSize: 11, italic: true, color: MUTED, isTextBox: true, margin: 0, align: "center",
  });
  const loops = [
    ["ship", "Explore a derelict ship", "Six decks, thinning air, dead power. You breathe what the wreck gives you."],
    ["book", "Read the crew's last days", "Terminals reconstruct the lost diaries of five crew members, freshly written on every run."],
    ["mic", "Talk your way through doors", "The ship's grieving mind, ECHO, only opens doors for the family it lost. Learn their voices. Speak as them."],
  ];
  loops.forEach(([ic, h, b], i) => {
    const y = 2.1 + i * 1.5;
    s.addShape("ellipse", { x: 7.6, y: y + 0.05, w: 0.62, h: 0.62, fill: { color: PANEL } });
    s.addImage({ data: icons[ic], x: 7.74, y: y + 0.19, w: 0.34, h: 0.34 });
    s.addText(h, { x: 8.45, y, w: 4.2, h: 0.4, fontFace: "Calibri", fontSize: 16.5, bold: true, color: INK, isTextBox: true, margin: 0 });
    s.addText(b, { x: 8.45, y: y + 0.42, w: 4.2, h: 0.95, fontFace: "Calibri", fontSize: 12.5, color: MUTED, isTextBox: true, margin: 0, lineSpacing: 16 });
  });

  // ---------------------------------------------------------------- 4 THE MIND
  s = pres.addSlide(); dark(s);
  tag(s, "THE GHOST", 0.7, 0.55);
  s.addText("A mind small enough to carry", {
    x: 0.7, y: 0.95, w: 11.9, h: 0.75, fontFace: "Courier New", fontSize: 32, bold: true, color: INK, isTextBox: true, margin: 0,
  });
  s.addText("ECHO is a real neural network, the same kind of technology as the large AI assistants, just three hundred thousand times smaller. It was not programmed with answers. It learned to speak the way a person learns a language: by reading, and slowly getting less wrong.", {
    x: 0.7, y: 1.95, w: 11.9, h: 0.85, fontFace: "Calibri", fontSize: 15, color: MUTED, isTextBox: true, margin: 0, lineSpacing: 20,
  });
  const stats = [
    ["2.9 million", "connections in its artificial brain", "large assistants have trillions; this ghost fits in a webpage"],
    ["4 MB", "is the entire mind, packed", "smaller than a single phone photo"],
    ["0 servers", "everything runs on the player's device", "airplane mode cannot silence it"],
  ];
  stats.forEach(([n, l, sub], i) => {
    const x = 0.7 + i * 4.22;
    s.addShape("roundRect", { x, y: 3.1, w: 3.85, h: 2.9, rectRadius: 0.08, fill: { color: PANEL } });
    s.addText(n, { x: x + 0.3, y: 3.5, w: 3.25, h: 0.9, fontFace: "Courier New", fontSize: 38, bold: true, color: PURPLE, isTextBox: true, margin: 0 });
    s.addText(l, { x: x + 0.3, y: 4.45, w: 3.25, h: 0.7, fontFace: "Calibri", fontSize: 14.5, bold: true, color: INK, isTextBox: true, margin: 0, lineSpacing: 17 });
    s.addText(sub, { x: x + 0.3, y: 5.2, w: 3.25, h: 0.6, fontFace: "Calibri", fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0, lineSpacing: 14 });
  });
  s.addText("Because it dreams a little and sometimes stumbles mid-sentence, we made that the story: ECHO is a mind that has been alone in the dark for three hundred years.", {
    x: 0.7, y: 6.35, w: 11.9, h: 0.6, fontFace: "Calibri", fontSize: 13, italic: true, color: TEAL, isTextBox: true, margin: 0,
  });

  // ---------------------------------------------------------------- 5 TEACHING IT
  s = pres.addSlide(); dark(s);
  tag(s, "THE TRAINING", 0.7, 0.55);
  s.addText("First we wrote a library. Then it read.", {
    x: 0.7, y: 0.95, w: 11.9, h: 0.75, fontFace: "Courier New", fontSize: 32, bold: true, color: INK, isTextBox: true, margin: 0,
  });
  const steps = [
    ["1", "Invent a world", "A lost survey ship, five crew members with unmistakable voices, and the storm that silenced them. Every fact written down in a story bible."],
    ["2", "Write its books", "Twenty-six AI writers worked in parallel, producing the crew's diaries, the ship's announcements, and hundreds of conversations, roughly a 450-page archive."],
    ["3", "Let the mind read", "For two and a half hours the network read the archive over and over, tuning its 2.9 million connections until the five voices lived inside it."],
    ["4", "Shrink and seal", "The finished mind was compressed to 4 MB and embedded in the game page, weights and all, like a ship in a bottle."],
  ];
  steps.forEach(([n, h, b], i) => {
    const x = 0.7 + (i % 2) * 6.15, y = 2.15 + Math.floor(i / 2) * 2.35;
    s.addShape("roundRect", { x, y, w: 5.85, h: 2.1, rectRadius: 0.08, fill: { color: i === 3 ? PANEL2 : PANEL }, line: i === 3 ? { color: PURPLE, width: 1 } : { color: PANEL, width: 0 } });
    s.addText(n, { x: x + 0.28, y: y + 0.3, w: 0.7, h: 0.8, fontFace: "Courier New", fontSize: 40, bold: true, color: PURPLE, isTextBox: true, margin: 0 });
    s.addText(h, { x: x + 1.05, y: y + 0.28, w: 4.55, h: 0.4, fontFace: "Calibri", fontSize: 16.5, bold: true, color: TEAL, isTextBox: true, margin: 0 });
    s.addText(b, { x: x + 1.05, y: y + 0.72, w: 4.55, h: 1.25, fontFace: "Calibri", fontSize: 12.5, color: INK, isTextBox: true, margin: 0, lineSpacing: 16 });
  });

  // ---------------------------------------------------------------- 6 UNSCRIPTABLE
  s = pres.addSlide(); dark(s);
  tag(s, "THE UNSCRIPTABLE MOMENT", 0.7, 0.55);
  s.addText("The doors judge your voice", {
    x: 0.7, y: 0.95, w: 11.9, h: 0.75, fontFace: "Courier New", fontSize: 32, bold: true, color: INK, isTextBox: true, margin: 0,
  });
  shot(s, "14_door.png", 6.6, 2.0, 6.0, 3.75);
  s.addText("A real judgment, photographed live: the player imitates the ship's botanist, and the network weighs the words against all five crew voices.", {
    x: 6.6, y: 5.9, w: 6.0, h: 0.6, fontFace: "Calibri", fontSize: 11, italic: true, color: MUTED, isTextBox: true, margin: 0, align: "center",
  });
  s.addText([
    { text: "Certain doors only open for a crew member's voice. The player reads that person's diaries, then types an imitation, any words they like.\n\n", options: { color: INK } },
    { text: "The network computes, from probability alone, whose voice those words carry. The bars on screen are its actual reasoning, drawn live.\n\n", options: { color: INK } },
    { text: "No keyword lists. No prepared answers. Nonsense is heard as static, a captain's clipped orders are heard as the captain, and a line about misting the ferns opens the botanist's garden vault.", options: { color: MUTED } },
  ], { x: 0.7, y: 2.1, w: 5.5, h: 4.4, fontFace: "Calibri", fontSize: 14, isTextBox: true, margin: 0, lineSpacing: 19 });

  // ---------------------------------------------------------------- 7 ROBOT PLAYTESTERS
  s = pres.addSlide(); dark(s);
  tag(s, "QUALITY", 0.7, 0.55);
  s.addText("Nine robot playtesters tried to break it", {
    x: 0.7, y: 0.95, w: 11.9, h: 0.75, fontFace: "Courier New", fontSize: 32, bold: true, color: INK, isTextBox: true, margin: 0,
  });
  s.addText("Before release, nine independent AI testers each attacked one thing: a first-timer's opening minutes, the voice doors, hostile keyboard input, the air supply, a full honest playthrough, phones, saved games, the ghost's writing quality, and speed.", {
    x: 0.7, y: 1.95, w: 11.9, h: 0.8, fontFace: "Calibri", fontSize: 14.5, color: MUTED, isTextBox: true, margin: 0, lineSpacing: 19 });
  const found = [
    ["bug", "19 issues found", "from a door that gave empty hints to an ending button that died on replay"],
    ["eye", "Every one verified", "each report came with steps to reproduce it and a screenshot as evidence"],
    ["users", "All fixed, then re-tested", "including the subtlest bug in the project: a single invisible space that confused the mind's hearing"],
  ];
  found.forEach(([ic, h, b], i) => {
    const x = 0.7 + i * 4.22;
    s.addShape("roundRect", { x, y: 3.05, w: 3.85, h: 2.55, rectRadius: 0.08, fill: { color: PANEL } });
    s.addShape("ellipse", { x: x + 0.3, y: 3.35, w: 0.66, h: 0.66, fill: { color: PANEL2 } });
    s.addImage({ data: icons[ic], x: x + 0.46, y: 3.51, w: 0.34, h: 0.34 });
    s.addText(h, { x: x + 0.3, y: 4.2, w: 3.25, h: 0.4, fontFace: "Calibri", fontSize: 16.5, bold: true, color: GOLD, isTextBox: true, margin: 0 });
    s.addText(b, { x: x + 0.3, y: 4.62, w: 3.25, h: 0.85, fontFace: "Calibri", fontSize: 12, color: INK, isTextBox: true, margin: 0, lineSpacing: 15 });
  });
  s.addText("The strangest finding: the tester imitating the ship's medic kept being mistaken for the gardener. The cause was one stray space character in how we asked the mind to listen. Removing it made everyone's voice ten points clearer.", {
    x: 0.7, y: 6.0, w: 11.9, h: 0.7, fontFace: "Calibri", fontSize: 13, italic: true, color: TEAL, isTextBox: true, margin: 0, lineSpacing: 17,
  });

  // ---------------------------------------------------------------- 8 SEE FOR YOURSELF
  s = pres.addSlide(); dark(s);
  tag(s, "PROOF", 0.7, 0.55);
  s.addText("How a skeptic can check", {
    x: 0.7, y: 0.95, w: 11.9, h: 0.75, fontFace: "Courier New", fontSize: 32, bold: true, color: INK, isTextBox: true, margin: 0,
  });
  const proofs = [
    ["off", "Cut the internet", "Load the game, switch to airplane mode, keep playing. The ghost keeps generating. There is no server to call, because the whole mind travels inside the page."],
    ["shuffle", "Play twice", "Restart and read the same terminal. The diary is different, because it never existed until you asked. Nothing is retrieved; everything is composed."],
    ["cpu", "Open THE MIND panel", "Inside the game, type any beginning of a sentence and watch the network weigh what word should come next, with live percentages. That arithmetic is the ghost."],
  ];
  proofs.forEach(([ic, h, b], i) => {
    const y = 2.05 + i * 1.68;
    s.addShape("roundRect", { x: 0.7, y, w: 11.9, h: 1.45, rectRadius: 0.08, fill: { color: i === 2 ? PANEL2 : PANEL }, line: i === 2 ? { color: PURPLE, width: 1 } : { color: PANEL, width: 0 } });
    s.addShape("ellipse", { x: 1.0, y: y + 0.4, w: 0.66, h: 0.66, fill: { color: BG } });
    s.addImage({ data: icons[ic], x: 1.16, y: y + 0.56, w: 0.34, h: 0.34 });
    s.addText(h, { x: 1.95, y: y + 0.2, w: 10.3, h: 0.4, fontFace: "Calibri", fontSize: 16.5, bold: true, color: INK, isTextBox: true, margin: 0 });
    s.addText(b, { x: 1.95, y: y + 0.62, w: 10.3, h: 0.7, fontFace: "Calibri", fontSize: 13, color: MUTED, isTextBox: true, margin: 0, lineSpacing: 16 });
  });

  // ---------------------------------------------------------------- 9 BY THE NUMBERS
  s = pres.addSlide(); dark(s);
  tag(s, "SHIP'S MANIFEST", 0.7, 0.55);
  s.addText("The whole voyage, counted", {
    x: 0.7, y: 0.95, w: 11.9, h: 0.75, fontFace: "Courier New", fontSize: 32, bold: true, color: INK, isTextBox: true, margin: 0,
  });
  const nums = [
    ["1", "web page holds the entire game"],
    ["6", "decks to survive, each with its own keeper"],
    ["3", "endings, chosen by how you speak to the ghost"],
    ["5", "crew voices the mind learned to tell apart"],
    ["~450", "pages of fiction written as its schoolbooks"],
    ["35", "AI writers and testers worked in parallel"],
    ["2.5 hrs", "of reading taught the ghost to speak"],
    ["0", "prewritten lines in anything ECHO says"],
  ];
  nums.forEach(([n, l], i) => {
    const x = 0.7 + (i % 4) * 3.17, y = 2.15 + Math.floor(i / 4) * 2.35;
    s.addShape("roundRect", { x, y, w: 2.87, h: 2.1, rectRadius: 0.08, fill: { color: PANEL } });
    s.addText(n, { x: x + 0.25, y: y + 0.28, w: 2.4, h: 0.85, fontFace: "Courier New", fontSize: 36, bold: true, color: i === 7 ? TEAL : PURPLE, isTextBox: true, margin: 0 });
    s.addText(l, { x: x + 0.25, y: y + 1.15, w: 2.4, h: 0.85, fontFace: "Calibri", fontSize: 12, color: INK, isTextBox: true, margin: 0, lineSpacing: 15 });
  });

  // ---------------------------------------------------------------- 10 CLOSE
  s = pres.addSlide(); dark(s);
  shot(s, "17_ending.png", 7.0, 1.35, 5.7, 3.56);
  tag(s, "END OF WATCH", 0.7, 0.7);
  s.addText("Board the wreck.", {
    x: 0.62, y: 1.5, w: 6.2, h: 1.0, fontFace: "Courier New", fontSize: 42, bold: true, color: INK, isTextBox: true, margin: 0,
  });
  s.addText("The game is live, private until shared, and plays in any browser:", {
    x: 0.7, y: 2.7, w: 5.9, h: 0.4, fontFace: "Calibri", fontSize: 14, color: MUTED, isTextBox: true, margin: 0,
  });
  s.addShape("roundRect", { x: 0.7, y: 3.2, w: 5.9, h: 0.75, rectRadius: 0.08, fill: { color: PANEL2 }, line: { color: TEAL, width: 1 } });
  s.addText("claude.ai/code/artifact/2c7295e4-2a2a-4812-8a8c-e0ac845351ce", {
    x: 0.95, y: 3.38, w: 5.5, h: 0.4, fontFace: "Courier New", fontSize: 10.5, color: TEAL, isTextBox: true, margin: 0,
  });
  s.addText("Every playthrough is a conversation no one has ever had before, with a mind that fits in your pocket and grieves in the dark.\n\nSpeak kindly to it.", {
    x: 0.7, y: 4.35, w: 5.9, h: 1.9, fontFace: "Calibri", fontSize: 15, color: INK, isTextBox: true, margin: 0, lineSpacing: 21,
  });
  s.addText("Also available as a single downloadable file for self-hosting  ·  technical spec and agent playbook accompany this deck", {
    x: 0.7, y: 6.7, w: 11.9, h: 0.4, fontFace: "Calibri", fontSize: 11, color: MUTED, isTextBox: true, margin: 0,
  });

  await pres.writeFile({ fileName: ROOT + "/docs/Ghost-in-the-Wreck-The-Making-Of.pptx" });
  console.log("deck written");
})();
