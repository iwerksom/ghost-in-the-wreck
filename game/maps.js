// GENERATED from data/maps.json — edit the JSON, not this file. Run tools/build_data.js.
"use strict";
const DECKS = [
 {
  "id": "dock",
  "name": "Docking Ring",
  "hue": 195,
  "intro": "The clamps take hold with a sound like a breath drawn after long silence. Your ship is dead. This one is deader. Suit lamp on. Air meter live.",
  "map": [
   "                                    ",
   "   ####W###W####                    ",
   "   #..........1#    ####W#####      ",
   "   #.~......~..######.......O#      ",
   "   #.S.........D....D...~....#      ",
   "   #..~....%...######....%...#      ",
   "   ####.####.###    #.2......#      ",
   "      #.#  #.#      ##.#######      ",
   "   ####.####.#########.#            ",
   "   #.......~....%....#.####         ",
   "   #.P...............D...3#         ",
   "   #....%....~.......#....#         ",
   "   ######.################          ",
   "        #.#                         ",
   "   ######.########                  ",
   "   #..~....B..O..#                  ",
   "   #.....4.......#                  ",
   "   #..%......~..5#                  ",
   "   ###############                  "
  ],
  "entities": {
   "1": {
    "type": "terminal",
    "author": "REYNE",
    "label": "Dock Control"
   },
   "2": {
    "type": "intercom",
    "label": "Intercom Panel"
   },
   "3": {
    "type": "archive",
    "key": "reyne_teaser",
    "label": "Sealed Recorder"
   },
   "4": {
    "type": "socket",
    "opens": "lift",
    "label": "Lift Power Socket"
   },
   "5": {
    "type": "lift",
    "to": 1,
    "needs": "socket",
    "label": "Lift : Hydroponics"
   }
  }
 },
 {
  "id": "hydro",
  "name": "Hydroponics",
  "hue": 130,
  "intro": "Green, still. Three hundred years and something in here refused to die. The light-lamps burn at quarter strength over Kit Aune's garden.",
  "map": [
   "                                      ",
   "   ########W#########W########        ",
   "   #..GGG......~......GGG....#        ",
   "   #..GGG..%.......%..GGG..1.#        ",
   "   #.........................#        ",
   "   #.S...GG....B....GG......O#        ",
   "   #.....GG.........GG.......#        ",
   "   ##.#######.###.#######..###        ",
   "   #..#     #.....#     #..#          ",
   "   #..#######..2..#######..#####      ",
   "   #..........................3#      ",
   "   #..%..GG......~....GG..%....#      ",
   "   #.....GG..........GG......O.#      ",
   "   ###.####################.####      ",
   "   #...#                #.....#       ",
   "   #.4.#                #..5..#       ",
   "   #...#                #.....#       ",
   "   #####                #######       "
  ],
  "entities": {
   "1": {
    "type": "terminal",
    "author": "KIT",
    "label": "Garden Console"
   },
   "2": {
    "type": "terminal",
    "author": "KIT",
    "label": "Misting Station"
   },
   "3": {
    "type": "echodoor",
    "persona": "KIT",
    "opens": "lift",
    "label": "Seed Vault Door",
    "lore": "The vault door only ever answered Kit."
   },
   "4": {
    "type": "archive",
    "key": "kit_final",
    "label": "Kit's Recorder"
   },
   "5": {
    "type": "lift",
    "to": 2,
    "needs": "echodoor",
    "label": "Lift : Med Bay"
   }
  }
 },
 {
  "id": "med",
  "name": "Med Bay",
  "hue": 265,
  "intro": "White cabinets gone grey. An intercom hangs from its cord, worn smooth. Ben Okafor talked four people to sleep through that little grille.",
  "map": [
   "                                      ",
   "   ############W#####W########        ",
   "   #.S......#........~.......#        ",
   "   #........D....B...........#        ",
   "   #..%..1..#................#        ",
   "   ####.#####...%......2.....#        ",
   "      #.#   #................#        ",
   "   ####.#####.################        ",
   "   #.........~.#     ",
   "   #.O.........#####################  ",
   "   #......%........D......~....3.O#   ",
   "   ############.###################   ",
   "   #..........#.#                     ",
   "   #.4....O...#.######                ",
   "   #..........D.....5#                ",
   "   #......~...#......#                ",
   "   ############.######                ",
   "        #.......#                     ",
   "        #..6....#                     ",
   "        #########                     "
  ],
  "entities": {
   "1": {
    "type": "terminal",
    "author": "OKAFOR",
    "label": "Patient Records"
   },
   "2": {
    "type": "intercom",
    "label": "The Intercom"
   },
   "3": {
    "type": "echodoor",
    "persona": "OKAFOR",
    "opens": "supply",
    "label": "Pharmacy Door",
    "lore": "Okafor kept the pharmacy voice-sealed. Painkillers walk, he said."
   },
   "4": {
    "type": "archive",
    "key": "okafor_final",
    "label": "Okafor's Recorder"
   },
   "5": {
    "type": "terminal",
    "author": "OKAFOR",
    "label": "Triage Console"
   },
   "6": {
    "type": "lift",
    "to": 3,
    "needs": null,
    "label": "Lift : Engineering"
   }
  }
 },
 {
  "id": "eng",
  "name": "Engineering",
  "hue": 25,
  "intro": "The reactor hall. Dae Cho's handprints are still on the manual feed levers, cast in scorched glove rubber. The old girl never sang again.",
  "map": [
   "                                        ",
   "   ##########################           ",
   "   #.S...~......H......~....#           ",
   "   #.........................#####      ",
   "   #..%..####....####..%..1..D..P#      ",
   "   #.....#**#....#**#........#####      ",
   "   #..H..#**#....#**#...H....#          ",
   "   #.....####....####........#          ",
   "   #...~.......B.........%...#          ",
   "   #.2.......................#          ",
   "   ###.####################.##          ",
   "   #...#      #......#    #.#           ",
   "   #.O.########..4...######.####        ",
   "   #.........D......D......~..O#        ",
   "   #.3.......#......#..........#        ",
   "   ##########.......#####.######        ",
   "   #.5...D...........# #.6.#            ",
   "   ######.############ #####            ",
   "   #.P......O#                          ",
   "   ###########                          "
  ],
  "entities": {
   "1": {
    "type": "terminal",
    "author": "CHO",
    "label": "Reactor Console"
   },
   "2": {
    "type": "socket",
    "opens": "power1",
    "label": "Main Bus Socket A"
   },
   "3": {
    "type": "socket",
    "opens": "power2",
    "label": "Main Bus Socket B"
   },
   "4": {
    "type": "echodoor",
    "persona": "CHO",
    "opens": "lift",
    "label": "Drive Core Hatch",
    "lore": "The hatch answers the chief engineer. The chief engineer only."
   },
   "5": {
    "type": "archive",
    "key": "cho_final",
    "label": "Cho's Recorder"
   },
   "6": {
    "type": "lift",
    "to": 4,
    "needs": "echodoor+power",
    "label": "Lift : Bridge"
   }
  }
 },
 {
  "id": "bridge",
  "name": "Bridge",
  "hue": 220,
  "intro": "The forward glass is a cataract of scorched crystal. The Shear came through here first. Sol Vega's charts are still pinned under a cold cup.",
  "map": [
   "                                      ",
   "        #WWWWWWWWWWWW#                ",
   "       ##............##               ",
   "      ##....~....B.....##             ",
   "     ##.................##            ",
   "     #...1...........2...#            ",
   "     #....%.........%....#            ",
   "     ##.......S.........##            ",
   "      ###.....~......####             ",
   "        #............#                ",
   "   ######.####.#######                ",
   "   #....O.#  #.......####             ",
   "   #.3....#  #..~........#            ",
   "   #......#  #.4....O..5.#            ",
   "   ########  #...........#            ",
   "             ######.######            ",
   "             #......#                 ",
   "             #..6...#                 ",
   "             #......#                 ",
   "             ########                 "
  ],
  "entities": {
   "1": {
    "type": "terminal",
    "author": "VEGA",
    "label": "Nav Station"
   },
   "2": {
    "type": "terminal",
    "author": "REYNE",
    "label": "Command Console"
   },
   "3": {
    "type": "echodoor",
    "persona": "VEGA",
    "opens": "chartroom",
    "label": "Chart Room",
    "lore": "Vega sealed the chart room with a voiceprint. Stars are private things."
   },
   "4": {
    "type": "archive",
    "key": "reyne_final",
    "label": "The Final Log"
   },
   "5": {
    "type": "echodoor",
    "persona": "REYNE",
    "opens": "lift",
    "label": "Captain's Seal",
    "lore": "The way down to the Core answers only to the captain of the Vesper."
   },
   "6": {
    "type": "lift",
    "to": 5,
    "needs": "echodoor",
    "label": "Descent : The Core"
   }
  }
 },
 {
  "id": "core",
  "name": "The Core",
  "hue": 300,
  "intro": "The heart of the ship. A column of cold light, still burning after three hundred years. Everything ECHO is lives in this room. It has been waiting.",
  "map": [
   "                       ",
   "     ###########       ",
   "    ##.........##      ",
   "   ##...~...~...##     ",
   "   #.....###.....#     ",
   "   #....##1##....#     ",
   "   #.S...........#     ",
   "   #....#####....#     ",
   "   #.....###.....#     ",
   "   ##...........##     ",
   "    ##.........##      ",
   "     ##..#.#..##       ",
   "      #..#O#..#        ",
   "      ####.####        ",
   "      #...2...#        ",
   "      #########        "
  ],
  "entities": {
   "1": {
    "type": "corealtar",
    "label": "ECHO"
   },
   "2": {
    "type": "hangar",
    "label": "Hangar Access"
   }
  }
 }
];
if (typeof module !== "undefined") module.exports = DECKS;
