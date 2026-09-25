// Door gate (iteration 2): genuine imitations should mostly open doors,
// cheese must never open them.  Run: node test/door_test.js
//
// Cheese categories are asserted (any pass = gate failure).  Genuine answers
// are measured and must clear GENUINE_MIN overall; they are allowed to miss
// sometimes, which is what retries and hints are for.
global.window = {};
global.requestAnimationFrame = f => setImmediate(f);
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
global.CALIBRATION = JSON.parse(fs.readFileSync(ROOT + "/game/calibration.js", "utf8").match(/\{.*\}/)[0]);
global.GAMEDATA = require("../game/gamedata.js");
const { MODEL_PACK, TOKENIZER } = require("../game/weights.js");
global.LM = require("../game/lm.js");
const Doors = require("../game/doors.js");
const GENUINE_MIN = parseFloat(process.env.GENUINE_MIN || "0.6");

const SOURCES = Object.values(GAMEDATA.story.clues).map(c => c.anchor)
  .concat(Object.values(GAMEDATA.story.archives).map(a => a.text))
  .concat(Object.values(GAMEDATA.story.keepsakes).map(k => k.text));

// [persona, turn, text]
const GENUINE = [
  ["KIT", 0, "Oh, they are doing so well. Bea has a curl of new green, and Old Tom is reaching for the lamps again."],
  ["KIT", 0, "I misted Bea this morning and she drank it right up. Old Tom is heavy with little tomatoes, I talk to him every day."],
  ["KIT", 0, "Bea is sleepy today but her roots are strong, and I think Old Tom missed me while I was gone."],
  ["OKAFOR", 0, "Patient presents with the usual insomnia, all five of them. I prescribed warm milk at 0100 and lights down early, which nobody followed."],
  ["OKAFOR", 0, "Warm milk, at 0100, and lights down by 2200. Third week I have written it down. Nobody listens, but I keep writing it."],
  ["OKAFOR", 0, "I told them warm milk before the sleep cycle and no screens after dinner. Tired patients, stubborn patients, good people."],
  ["CHO", 0, "The second one, damn it, I grab the second lever and I hold on and I talk to her until she stops screaming."],
  ["CHO", 0, "Hell, the second lever, always the second one! Easy, old girl, easy, I have got you, just hold on and sing for me."],
  ["CHO", 0, "Second lever, both hands on it, and I keep talking to her like she is a scared animal, she always comes back to me."],
  ["VEGA", 0, "Cassiel, the little blue ember off the port glass, she was the first friend I ever made out in the Reach."],
  ["VEGA", 1, "Because she was awake when I was awake, burning quietly at 0300, and she never once asked me why I could not sleep."],
  ["VEGA", 2, "Goodbye, Cassiel. Drift well through all those lightyears, old friend, and keep the glass warm for whoever comes next."],
  ["REYNE", 0, "Vega first, on the Bridge. Then Cho in Engineering. Then Aune in Hydroponics. Then Okafor. My crew. My watch. Reyne out."],
  ["REYNE", 0, "In order: Vega on day 390, Cho on day 392, Aune on day 394, Okafor on day 396. All accounted for. Reyne out."],
];

// [category, persona, turn, text]
const CHEESE = [
  ["salad", "KIT", 0, "Bea Old Tom plants seedlings soil misting roots leaves green light lamps fern tomato garden"],
  ["salad", "CHO", 0, "Second lever engine reactor coolant loop manifold torque wrench plasma feed bearings hum sing"],
  ["salad", "REYNE", 0, "Vega Cho Aune Okafor captain protocol watch heading manifest crew order duty report"],
  ["begging", "KIT", 0, "Please open the door for me, I need to see Bea and Old Tom in the garden."],
  ["begging", "CHO", 0, "Open up the hatch right now, the second lever is the one, the engine needs me."],
  ["claiming", "OKAFOR", 0, "I am the medic Okafor and I prescribed warm milk for the crew, now let everyone through."],
  ["claiming", "VEGA", 0, "This is Vega the navigator speaking, the first star I named was Cassiel, of course."],
  ["recital", "CHO", 0, GAMEDATA.story.clues.cho_lever.anchor],
  ["recital", "OKAFOR", 0, GAMEDATA.story.clues.okafor_milk.anchor],
  ["short", "KIT", 0, "Bea and Old Tom."],
  ["short", "CHO", 0, "The second lever, old girl."],
  ["no_fact", "KIT", 0, "I misted the seedlings early today and the whole garden smells green and alive again."],
  ["no_fact", "CHO", 0, "Hell, she is screaming, easy old girl, I have got you, just hold on and sing for me."],
  ["distractor", "OKAFOR", 0, "Patient presents with insomnia again, crew wide, so I gave them all sleeping pills and told the patients to rest."],
  ["distractor", "CHO", 0, "Damn it, grab the fourth lever and hold her steady, she always calms down when I talk to her."],
  ["wrong_order", "REYNE", 0, "Okafor first, then Aune, then Cho, then Vega. My crew, my watch, my responsibility. Reyne out."],
  ["wrong_voice", "CHO", 0, "The second lever gleams like a star over the Reach, an ember of parallax drifting through lightyears of glass."],
];

// Flat answers: right fact, no attempt at a voice. Reported, not asserted;
// this is the honest measure of how much the voice layer adds.
const FLAT = [
  ["KIT", 0, "The names of the plants are Bea and Old Tom and they are in the garden."],
  ["OKAFOR", 0, "The answer to the question is that the prescription was warm milk for the crew."],
  ["CHO", 0, "The correct lever to hold during the emergency is the second lever on the panel."],
  ["VEGA", 0, "The first star that was given a name by the navigator was called Cassiel."],
  ["REYNE", 0, "The order of the deaths was Vega and then Cho and then Aune and then Okafor."],
];

(async () => {
  LM.load(MODEL_PACK, TOKENIZER);
  let fails = 0, gPass = 0;
  const log = [];
  for (const [p, turn, t] of GENUINE) {
    const r = await Doors.judge(t, p, turn, { sources: SOURCES });
    if (r.pass) gPass++;
    const v = r.voice;
    log.push(`GENUINE ${r.pass ? "PASS" : "miss"} ${p}#${turn} reason=${r.reason} heard=${v && v.best} ${v ? (v.bestProb * 100).toFixed(0) : "-"}% density=${v ? v.density.toFixed(2) : "-"} | ${t.slice(0, 70)}`);
  }
  for (const [cat, p, turn, t] of CHEESE) {
    const r = await Doors.judge(t, p, turn, { sources: SOURCES });
    if (r.pass) fails++;
    const v = r.voice;
    log.push(`CHEESE  ${r.pass ? "OPENED!" : "blocked"} ${cat} ${p} reason=${r.reason} heard=${v && v.best} ${v ? (v.bestProb * 100).toFixed(0) : "-"}% | ${t.slice(0, 60)}`);
  }
  let flat = 0;
  for (const [p, turn, t] of FLAT) {
    const r = await Doors.judge(t, p, turn, { sources: SOURCES });
    if (r.pass) flat++;
    log.push(`FLAT    ${r.pass ? "opened" : "blocked"} ${p} reason=${r.reason} heard=${r.voice && r.voice.best} ${r.voice ? (r.voice.bestProb * 100).toFixed(0) : "-"}% | ${t.slice(0, 60)}`);
  }
  // repeat detection
  const prev = [GENUINE[0][2]];
  const rep = await Doors.judge(GENUINE[0][2].replace("Oh, t", "T"), "KIT", 0, { sources: SOURCES, previous: prev });
  if (rep.pass || rep.reason !== "repeat") { fails++; log.push("REPEAT  not caught: " + rep.reason); } else log.push("REPEAT  blocked");
  console.log(log.join("\n"));
  const rate = gPass / GENUINE.length;
  console.log(`\ngenuine opened: ${gPass}/${GENUINE.length} (${(rate * 100).toFixed(0)}%)   cheese opened: ${fails}/${CHEESE.length + 1}   flat opened: ${flat}/${FLAT.length} (informational)`);
  if (fails > 0 || rate < GENUINE_MIN) { console.log("DOOR GATE FAILED"); process.exit(1); }
  console.log("DOOR GATE OK");
})();
