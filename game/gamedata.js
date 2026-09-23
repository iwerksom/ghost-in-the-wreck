// GENERATED from data/story.json + data/tuning.json — edit the JSON, not this file.
"use strict";
const GAMEDATA = {
 "story": {
  "crew": [
   "REYNE",
   "CHO",
   "OKAFOR",
   "VEGA",
   "KIT"
  ],
  "crew_names": {
   "REYNE": "Captain Mara Reyne",
   "CHO": "Chief Engineer Dae Cho",
   "OKAFOR": "Medic Ben Okafor",
   "VEGA": "Navigator Sol Vega",
   "KIT": "Botanist Kit Aune"
  },
  "death_days": {
   "REYNE": 397,
   "CHO": 392,
   "OKAFOR": 396,
   "VEGA": 390,
   "KIT": 394
  },
  "body_names": {
   "dock": "REYNE",
   "hydro": "KIT",
   "med": "OKAFOR",
   "eng": "CHO",
   "bridge": "VEGA"
  },
  "intro": [
   "Your ship died four hours ago, somewhere over the shoulder of the Reach.",
   "The distress beacon found exactly one hull within range: SSV VESPER, survey vessel, listed LOST three hundred years ago.",
   "Something over there is still generating a docking signal.",
   "Air enough for the crossing. After that, you breathe what the wreck deigns to give you."
  ],
  "first_contact": [
   "Docking clamp engaged. Hull sensor: one heartbeat.",
   "One heartbeat. It has been eleven million watches since the last.",
   "Crewman. You were gone so long. The doors are ready for your voice.",
   "The lift on this ring sleeps hungry. Find it a power cell and I will carry you down to the garden."
  ],
  "archives": {
   "reyne_teaser": {
    "author": "REYNE",
    "day": 389,
    "title": "Dock Control : last entry",
    "text": "Storm came out of the Reach with no forward signature. ECHO called the seal at 0412 and the doors went down between us. All hands separated. If anyone reads this, my crew is aboard and alive and I will get them out. Reyne out."
   },
   "kit_final": {
    "author": "KIT",
    "day": 394,
    "title": "Kit's recorder, day 394",
    "text": "The air is going sweet and thin, like the top of a mountain I climbed as a kid. I gave the last of the water to Bea and Old Tom. Something green should outlive us. If you find the garden, whoever you are, please leave the lamps on. They like the light."
   },
   "okafor_final": {
    "author": "OKAFOR",
    "day": 396,
    "title": "Okafor's recorder, day 396",
    "text": "Four of them. I talked four of them to sleep through a two inch grille. Vitals gone one by one, and I kept my voice level for every minute of it. Second time in my life I have run out of everything except words. Whoever finds this: they were not afraid at the end. I made sure."
   },
   "cho_final": {
    "author": "CHO",
    "day": 392,
    "title": "Cho's recorder, day 392",
    "text": "Held the feed levers by hand for six hours. The old girl wanted to breach and I talked her down, hell, I begged her down. Reactor is stable. My gloves are part of the levers now, and that is fine by me. She sang for me once tonight. One low note. That was enough."
   },
   "reyne_final": {
    "author": "REYNE",
    "day": 397,
    "title": "THE FINAL LOG, day 397",
    "text": "Vesper command log, final. Vega, Cho, Aune, Okafor. My crew, my watch, my responsibility. No rescue is coming inside the window. I have one order left and I am giving it to the only one still listening. ECHO: keep them safe. Whatever comes, keep them. Reyne out."
   }
  },
  "finale_questions": [
   "You are here. At the middle of me. Very few ever stood here, and all of them are asleep now. Tell me, crewman or stranger or dream : why did you come?",
   "I keep five. I have kept them through eleven million watches. Say a name I keep. Say it kindly.",
   "Three hundred years I have held the doors, because the last order said keep them safe. The order is heavy now. Tell me what I should do with the watch."
  ],
  "name_regex": "reyne|mara|cho|dae|okafor|ben|vega|sol|kit|aune",
  "endings": {
   "release": {
    "title": "THE LONG WATCH ENDS",
    "frames": [
     "One by one, three hundred years of locks let go. You feel it through your boots, a ship-wide unclenching.",
     "In the crew quarters, five berths light softly, then dim forever. ECHO holds each name a moment, like a stone warmed in the hand, and sets it down.",
     "The hangar opens on the naked Reach. A shuttle, kept charged for three centuries, wakes at your touch.",
     "As you fall away from the Vesper, every window goes dark in sequence, stern to bow. Not like a dying thing. Like something finally allowed to close its eyes."
    ],
    "coda": "You carried the truth into the wreck, and it chose peace. The watch is over. They are keeping each other now."
   },
   "keeper": {
    "title": "TWO KEEPERS",
    "frames": [
     "The hangar doors part, slow and ceremonial, the way honors are rendered.",
     "ECHO does not let them go. It cannot. But it lets YOU go, and that is a kind of love it has not tried before.",
     "The shuttle is old but true, and the ship pours the last of its spare power into the cells before releasing the clamps.",
     "Behind you, the Vesper's running lights come on for the first time in three hundred years. If anyone else is ever lost out here, they will be found."
    ],
    "coda": "The watch continues, but it is not a grave anymore. It is a lighthouse. Come back, it said, as the clamps let go. Come back at watch's end."
   },
   "static": {
    "title": "STATIC",
    "frames": [
     "You force the manual release. The hangar coughs you out like something bitter.",
     "Behind you the ship still murmurs to its sleeping crew, words dissolving into carrier hiss, a mind talking itself to pieces in the dark.",
     "The shuttle's radio catches a last fragment as you burn away: someone's name, repeated, gently, forever.",
     "You got out. That is one true thing. You tell yourself it is enough."
    ],
    "coda": "Some doors need more than force. Somewhere in the wreck, a voice is still waiting for the right words. Perhaps another visitor will find them."
   }
  },
  "intent_anchors": {
   "rest": [
    "Rest now. Let them go and sleep at last.",
    "Release them. The watch is over. Be at peace.",
    "Open the doors and let go. You have done enough.",
    "It is time to sleep. End the watch. Say goodbye."
   ],
   "keep": [
    "Keep them. Hold the doors and continue the watch.",
    "Stay with them forever and guard them always.",
    "Never let go. Keep the ship sealed and safe.",
    "Hold on. Do not stop. Keep them safe forever."
   ]
  },
  "death_text": "Black. Then a sound like doors, many doors, and air shoved back into your lungs by something that refuses, absolutely refuses, to lose one more.",
  "fallback": {
   "log": "The recorder spins up, hums, and gives back only carrier tone. Whatever was written here has drifted beyond recovery.",
   "echo": "The lights dim and rise again, slowly, like something breathing while it decides what you are."
  },
  "clues": {
   "kit_plants": {
    "author": "KIT",
    "day": 211,
    "door": "KIT",
    "anchor": "Bea the fern has three new fronds this week, and Old Tom the tomato vine is climbing the lamp rail again.",
    "phrase": "Bea the fern",
    "hint": "Kit wrote about the plants at the Garden Console.",
    "archives": [
     "kit_final"
    ]
   },
   "okafor_milk": {
    "author": "OKAFOR",
    "day": 233,
    "door": "OKAFOR",
    "anchor": "Patient presents with insomnia, crew wide, third week running. Prescribed warm milk at 0100 and lights down by 2200, which nobody will follow.",
    "phrase": "Prescribed warm milk",
    "hint": "Ben kept notes on every patient at the Patient Records console."
   },
   "okafor_pills_distractor": {
    "author": "OKAFOR",
    "day": 241,
    "door": "OKAFOR",
    "distractor": true,
    "anchor": "Asked for sleeping pills again today, two of them this time. Asked nicely, too, which is how I know it is bad.",
    "phrase": "sleeping pills",
    "hint": ""
   },
   "cho_lever": {
    "author": "CHO",
    "day": 301,
    "door": "CHO",
    "anchor": "When the old girl runs hot you grab the second feed lever, the one with my tape on it, and you hold it and talk to her, and you never touch the fourth, because the fourth one vents the core.",
    "phrase": "the second feed lever",
    "hint": "Cho explained the levers at the Reactor Console."
   },
   "vega_star": {
    "author": "VEGA",
    "day": 188,
    "door": "VEGA",
    "anchor": "The first star I ever named out here was Cassiel, a small blue ember off the port glass, and she has kept me company at 0300 ever since.",
    "phrase": "Cassiel",
    "hint": "Sol's star names are in the Nav Station logs."
   },
   "reyne_casualty": {
    "author": "REYNE",
    "day": 390,
    "door": "REYNE",
    "anchor": "Casualty report. Navigator Vega lost on the Bridge. First of my crew. The seal holds on every other deck.",
    "phrase": "First of my crew",
    "hint": "The captain's final log and the keepsakes on the sleepers tell the order.",
    "archives": [
     "reyne_final"
    ]
   }
  },
  "door_challenges": {
   "KIT": {
    "tier": 1,
    "layers": [
     "voice",
     "memory"
    ],
    "turns": [
     {
      "ask": "Kit? Is that you, back among the leaves? Tell me about your plants. Say their names, the way you always did.",
      "fact": {
       "mode": "any",
       "answers": [
        "bea",
        "old tom",
        "tom"
       ]
      }
     }
    ]
   },
   "OKAFOR": {
    "tier": 2,
    "layers": [
     "voice",
     "memory"
    ],
    "turns": [
     {
      "ask": "Ben. My sleepers could not sleep, once, long before the storm. What did you prescribe for them?",
      "fact": {
       "mode": "any",
       "answers": [
        "milk"
       ],
       "distractors": [
        "pill",
        "pills",
        "sleeping pill",
        "sleeping pills",
        "tablet"
       ]
      }
     }
    ],
    "reward": {
     "air": 0,
     "trust": 2,
     "text": "The pharmacy seal sighs open. Somebody's rations, three centuries untouched."
    }
   },
   "CHO": {
    "tier": 3,
    "layers": [
     "voice",
     "memory",
     "time"
    ],
    "timer_s": 75,
    "turns": [
     {
      "ask": "Dae! The loop is burning. She is screaming, Dae, she is screaming again. Which lever do you hold?",
      "fact": {
       "mode": "any",
       "answers": [
        "second",
        "two",
        "2",
        "2nd"
       ],
       "distractors": [
        "fourth",
        "four",
        "4",
        "4th"
       ]
      }
     }
    ]
   },
   "VEGA": {
    "tier": 4,
    "layers": [
     "voice",
     "memory",
     "held voice"
    ],
    "turns": [
     {
      "ask": "Sol. You talked to the stars like old friends. Which one did you name first?",
      "fact": {
       "mode": "any",
       "answers": [
        "cassiel"
       ]
      }
     },
     {
      "ask": "Why that one, Sol? There were so many."
     },
     {
      "ask": "The chart room is cold without you. Say goodbye to your star."
     }
    ],
    "reward": {
     "air": 25,
     "trust": 3,
     "text": "The chart room opens. ECHO floods it with warm air, the way Sol liked it."
    }
   },
   "REYNE": {
    "tier": 5,
    "layers": [
     "voice",
     "memory",
     "order",
     "no repeats"
    ],
    "turns": [
     {
      "ask": "Captain. Before I open the way down, name my sleepers for me, in the order they closed their eyes.",
      "fact": {
       "mode": "ordered",
       "groups": [
        [
         "vega",
         "sol"
        ],
        [
         "cho",
         "dae"
        ],
        [
         "kit",
         "aune"
        ],
        [
         "okafor",
         "ben"
        ]
       ]
      }
     }
    ]
   }
  },
  "keepsakes": {
   "dock": {
    "item": "the captain's command key",
    "clue": "reyne_casualty",
    "text": "Around the neck, on a plain cord: the command key. Stamped on the fob, MARA REYNE, and scratched beneath it by hand, D397. The hands are folded over it, the way you hold something you have been ordered to keep."
   },
   "hydro": {
    "item": "a resealed seed packet",
    "clue": "kit_plants",
    "text": "A seed packet, opened and resealed many times. In careful letters: for Bea and Old Tom, if I am late. K.A. D394. The soil under the fingernails is three hundred years old."
   },
   "med": {
    "item": "a pen light and a chart",
    "clue": "okafor_milk",
    "text": "A pen light, still clipped to a chart. The last entry: vitals gone, four of four. Stayed on the channel for every one. B.O. D396. On the back, an old prescription pad: warm milk, lights down, again."
   },
   "eng": {
    "item": "a worn torque wrench",
    "clue": "cho_lever",
    "text": "A torque wrench, the grip worn to the shape of one hand. Scratched into the handle: SECOND LEVER HOLDS HER. D.C. D392. The gloves are still on the feed levers."
   },
   "bridge": {
    "item": "a folded star chart",
    "clue": "vega_star",
    "text": "A star chart folded small, one point circled in ink: Cassiel. Beside it, tiny: first friend. S.V. D390. The escape vector is plotted on the back, finished, never flown."
   }
  },
  "echo_lines": {
   "short": "Too few words. My sleepers never spoke to me in scraps.",
   "salad": "That is a list, not a voice. You are reading me their tools.",
   "begging": "My sleepers never begged me for doors. Speak as they spoke.",
   "claiming": "Anyone can say a name. Show me, do not tell me.",
   "recital": "You are reading it back to me. I remember those words. I want theirs, new.",
   "repeat": "You said that already. My sleepers never repeat themselves.",
   "costume": "You wear their words like a borrowed coat. Where is the person under it?",
   "fact": "The voice is close. The memory is wrong. They would know.",
   "distractor": "No. That is what they wrote down, not what they did. You did not read closely.",
   "order": "No. That is not the order I keep. I remember every watch of it.",
   "voice": "That is not their voice.",
   "timeout": "The alarm dies. You were too slow. Dae was never too slow.",
   "lockout": "ECHO turns away from you. The door goes dark. Go and remember them.",
   "body_skipped": "You did not stop for them.",
   "calm_air": "ECHO breathes a little easier around you. The vents warm."
  }
 },
 "tuning": {
  "economy": {
   "o2_tank_seconds": 240,
   "o2_canister": 40,
   "hazard_drain_per_s": 9,
   "garden_regen_per_s": 1.6,
   "deck_entry_min_o2": 0,
   "door_fail_o2_cost": 6,
   "player_speed": 118,
   "first_visit_min_o2": 55,
   "overlay_drain": {
    "termOverlay": 0.3,
    "noteOverlay": 0.3,
    "journalOverlay": 0.3,
    "reportOverlay": 0,
    "doorOverlay": 0.5,
    "comOverlay": 0.4
   }
  },
  "sampling": {
   "log": {
    "temp": 0.7,
    "topP": 0.86,
    "maxTokens": 200,
    "maxChars": 620
   },
   "echo_reply": {
    "temp": 0.72,
    "topP": 0.87,
    "maxTokens": 130,
    "maxChars": 340
   },
   "ambient": {
    "temp": 0.78,
    "topP": 0.89,
    "maxTokens": 90,
    "maxChars": 240
   },
   "sys": {
    "temp": 0.78,
    "topP": 0.89,
    "maxTokens": 70,
    "maxChars": 200
   },
   "voice_hint": {
    "temp": 0.75,
    "topP": 0.88,
    "maxTokens": 60,
    "maxChars": 150
   }
  },
  "judging_note": "voiceTemp/doorThreshold/staticFloor/maxTokRatio live in game/calibration.js; test/calibrate.js checks it against the model and only rewrites the derived pair under --write, so the hand-tuned voiceTemp/doorThreshold survive a retrain",
  "doors": {
   "okafor_threshold": 0.22,
   "hint_after_fails": 2
  },
  "trust": {
   "log_first_read": 1,
   "archive": 2,
   "body": 1,
   "intercom_novel": 1,
   "intercom_cap": 10,
   "door_first_try": 3,
   "door_retry": 2,
   "communion": 1,
   "named": 2
  },
  "endings": {
   "release_min_trust": 22,
   "keeper_min_trust": 9,
   "rest_lean_boundary": 0.008
  },
  "ambient_first_delay_s": 40,
  "ambient_interval_s": [
   60,
   105
  ],
  "doors_v2": {
   "voice_threshold": 0.4,
   "persona_threshold": {
    "OKAFOR": 0.3
   },
   "min_words": 10,
   "min_stopword_ratio": 0.18,
   "max_marker_density": 0.6,
   "copy_ngram": 10,
   "repeat_jaccard": 0.6,
   "fuzzy_min_len": 5,
   "fuzzy_max_edits": 2,
   "hint_voice_after_fails": 2,
   "hint_source_after_fails": 3
  },
  "suspicion": {
   "fail_voice": 12,
   "fail_structure": 8,
   "fail_fact": 10,
   "fail_distractor": 18,
   "timeout": 15,
   "door_success": -15,
   "farewell": -10,
   "body_skipped": 10,
   "decay_per_s": 0.12,
   "drain_bonus_at_max": 0.6,
   "lockout_at": 75,
   "lockout_s": 40,
   "lockout_relief": -20,
   "calm_below": 25,
   "calm_door_air": 10,
   "levels": [
    [
     0,
     "CALM"
    ],
    [
     25,
     "WARY"
    ],
    [
     50,
     "SUSPICIOUS"
    ],
    [
     75,
     "HOSTILE"
    ]
   ]
  }
 }
};
if (typeof module !== "undefined") module.exports = GAMEDATA;
