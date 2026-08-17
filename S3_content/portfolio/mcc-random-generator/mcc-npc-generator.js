(function (root) {
  "use strict";

  const TABLE_1_5 = [
    { min: 1, max: 32, label: "Pure Strain Human", kind: "pure" },
    { min: 33, max: 66, label: "Mutant", kind: "mutant" },
    { min: 67, max: 88, label: "Manimal", kind: "manimal" },
    { min: 89, max: 100, label: "Plantient", kind: "plantient" }
  ];

  const OCCUPATIONS = [
    { min: 1, max: 50, label: "Hunter", equipment: "wood spear" },
    { min: 51, max: 100, label: "Gatherer", equipment: "large leather sack" }
  ];

  const BIRTH_SIGNS = [
    "Nuclear Winter",
    "The Roxen",
    "The Triffid",
    "The Beast",
    "The Millisteed",
    "The Apocalypse",
    "Ragnarok",
    "Revelations",
    "The Hunter",
    "The Gatherer",
    "The Outsider",
    "The Sensor",
    "The Genomorph",
    "The Alpha Striker",
    "The Programmer",
    "The Hypospray",
    "The Survivor",
    "The Multitool",
    "The Healer",
    "The Scientist",
    "The Glow",
    "The Esper",
    "The Bunker",
    "The CPU",
    "The Ecobot",
    "The War-Bot",
    "The Unchanging",
    "The Backup Disk",
    "The Universal Translator",
    "The Accelerant"
  ];

  const STARTING_EQUIPMENT = [
    { min: 1, max: 4, item: "blowgun and 12 darts", detail: "1d3", value: "6" },
    { min: 5, max: 9, item: "bone club", detail: "1d6", value: "3" },
    { min: 10, max: 13, item: "bow and 12 arrows", detail: "1d6", value: "30" },
    { min: 14, max: 18, item: "flint dagger", detail: "1d4", value: "3" },
    { min: 19, max: 21, item: "leather sling", detail: "1d4", value: "2" },
    { min: 22, max: 25, item: "stone axe", detail: "1d7", value: "7" },
    { min: 26, max: 29, item: "stone-tipped spear", detail: "1d6", value: "5" },
    { min: 30, max: 33, item: "wooden club", detail: "1d5", value: "2" },
    { min: 34, max: 37, item: "fur cloak", detail: "+2 AC", value: "20" },
    { min: 38, max: 41, item: "hide armor", detail: "+3 AC", value: "30" },
    { min: 42, max: 45, item: "leather shield", detail: "+1 AC", value: "10" },
    { min: 46, max: 49, item: "flint fire starter", value: "5" },
    { min: 50, max: 53, item: "hemp rope, 50 ft.", value: "5" },
    { min: 54, max: 57, item: "jerked roxen meat", value: "2" },
    { min: 58, max: 61, item: "leather rucksack", value: "10" },
    { min: 62, max: 65, item: "torch (x3)", value: "3" },
    { min: 66, max: 69, item: "antler hood", detail: "+1 AC", value: "10" },
    { min: 70, max: 73, item: "bone necklace", value: "15" },
    { min: 74, max: 77, item: "conch shell trumpet", value: "25" },
    { min: 78, max: 81, item: "magic sticky rock (lodestone)", value: "30" },
    { min: 82, max: 85, item: "paints and dyes", value: "35" },
    { min: 86, max: 89, item: "bag of sea shells", value: "40" },
    { min: 90, max: 93, item: "small shiny thing (trinket non-functional artifact)", value: "50" },
    { min: 94, max: 97, item: "large shiny thing (trinket non-functional artifact)", value: "100" },
    { min: 98, max: 100, item: "telepathic rat (pet)", detail: "1d3 attack", value: "250" }
  ];

  const MUTANT_APPEARANCE = [
    {
      min: 1,
      max: 5,
      label: "Skin color",
      die: 6,
      options: [
        "bright red skin",
        "snow white skin",
        "lemon yellow skin",
        "purple skin",
        "green skin",
        "translucent skin"
      ]
    },
    {
      min: 6,
      max: 9,
      label: "Skin texture",
      die: 6,
      options: [
        "mottled skin",
        "reptilian skin",
        "chitinous skin",
        "rocky skin",
        "metallic skin",
        "invisible skin"
      ]
    },
    {
      min: 10,
      max: 12,
      label: "Eyes",
      die: 6,
      options: [
        "slitted pupils",
        "no pupils",
        "eyes that glow in the dark",
        "a single eye",
        "compound insect eyes",
        "eyes covered by semi-transparent skin"
      ]
    },
    {
      min: 13,
      max: 15,
      label: "Mouth",
      die: 6,
      options: [
        "a fanged mouth",
        "a featureless slit mouth",
        "a beak or bill",
        "an insectoid mouth",
        "a mouth located in the belly",
        "no mouth, replaced by porous skin"
      ]
    },
    {
      min: 16,
      max: 17,
      label: "Head",
      die: 6,
      options: [
        "a larger than normal head",
        "a smaller than normal head",
        "a craggy brow and ridged skull",
        "small horns",
        "antennae",
        "a head that retreats into the body"
      ]
    },
    {
      min: 18,
      max: 19,
      label: "Hair",
      die: 6,
      options: [
        "hair that stands on end",
        "hair that grows into a lion's mane",
        "hair over the entire body",
        "hair that drips oil",
        "hair made of organic metal",
        "hair comprised of small leaves"
      ]
    },
    {
      min: 20,
      max: 22,
      label: "Hands",
      die: 6,
      options: [
        "hands with no nails",
        "hands with only three fingers",
        "hands with six fingers",
        "prehensile claw hands",
        "hands comprised of tentacles",
        "no hands, replaced with tentacle fingers"
      ]
    },
    {
      min: 23,
      max: 24,
      label: "Feet",
      die: 6,
      options: [
        "overlarge padded feet",
        "feet with 12 toes",
        "clawed feet",
        "bird talons",
        "hooves",
        "no feet, replaced with cilia clumps"
      ]
    },
    {
      min: 25,
      max: 27,
      label: "Body",
      die: 6,
      options: [
        "a tail",
        function (roll) {
          const arms = roll.die(4, "Body arms");
          return `has ${arms.result} ${arms.result === 1 ? "arm" : "arms"}`;
        },
        function (roll) {
          const legs = roll.die(4, "Body legs");
          return `has ${legs.result} ${legs.result === 1 ? "leg" : "legs"}`;
        },
        "a ridged back",
        "a symbiotic twin in the stomach",
        "a segmented worm-like body"
      ]
    },
    {
      min: 28,
      max: 28,
      label: "Form",
      die: 6,
      options: [
        "a tripedal form",
        "a quadrupedal form",
        "a serpentine form",
        "an insectoid form",
        "a globular form",
        "a condensed ball of plasma that must inhabit clothes to maintain form"
      ]
    },
    { min: 29, max: 30, label: "Roll twice", kind: "rollTwice" }
  ];

  const MANIMAL_SUBTYPE = [
    { min: 1, max: 4, label: "Primate", die: 4, options: ["gorilla", "chimpanzee", "orangutan", "gibbon"] },
    { min: 5, max: 8, label: "Canine", die: 4, options: ["dog", "wolf", "coyote", "fox"] },
    { min: 9, max: 11, label: "Feline", die: 4, options: ["lion", "tiger", "cheetah", "panther"] },
    { min: 12, max: 13, label: "Ursine", die: 3, options: ["brown bear", "grizzly bear", "polar bear"] },
    { min: 14, max: 16, label: "Bovine", die: 5, options: ["cow", "bison", "buffalo", "antelope", "yak"] },
    { min: 17, max: 18, label: "Suidae", die: 3, options: ["pig", "hog", "warthog"] },
    { min: 19, max: 20, label: "Rodentia", die: 6, options: ["mouse", "rat", "squirrel", "porcupine", "beaver", "rabbit"] },
    { min: 21, max: 22, label: "Amphibia", die: 3, options: ["frog", "toad", "salamander"] },
    { min: 23, max: 24, label: "Avian", die: 6, options: ["hawk", "eagle", "crow", "owl", "vulture", "seagull"] },
    { min: 25, max: 27, label: "Insecta", die: 6, options: ["roach", "ant", "fly", "grasshopper", "beetle", "moth"] },
    { min: 28, max: 30, label: "Roll again plus mutant appearance", kind: "rollAgainMutant" }
  ];

  const PLANTIENT_SUBTYPE = [
    { min: 1, max: 5, label: "Deciduous", die: 5, options: ["maple", "oak", "sycamore", "buckeye", "chestnut"] },
    { min: 6, max: 9, label: "Conifer", die: 6, options: ["cedar", "larch", "fir", "pine", "spruce", "yew"] },
    { min: 10, max: 11, label: "Fruit-Bearing", die: 6, options: ["apple", "pear", "peach", "cherry", "plum", "banana"] },
    { min: 12, max: 13, label: "Fern", die: 3, options: ["horsetail", "whisk fern", "marratoid"] },
    { min: 14, max: 16, label: "Vine", die: 6, options: ["ivy", "honeysuckle", "arrowroot", "morning glory", "grape", "sweet pea"] },
    { min: 17, max: 19, label: "Shrub", die: 6, options: ["sagebrush", "hibiscus", "blackberry", "huckleberry", "sumac", "yucca"] },
    { min: 20, max: 22, label: "Tropical", die: 4, options: ["palm", "coconut", "bamboo", "teak"] },
    { min: 23, max: 24, label: "Cacti", die: 4, options: ["barrel cactus", "beavertail cactus", "aloe", "prickly pear"] },
    { min: 25, max: 27, label: "Mosses", die: 3, options: ["green moss", "liverwort", "hornwort"] },
    { min: 28, max: 29, label: "Fungi", die: 4, options: ["mushroom", "toadstool", "fungus", "mold"] },
    { min: 30, max: 30, label: "Roll again plus mutant appearance", kind: "rollAgainMutant" }
  ];

  const TECH_LABELS = {
    1: "Stone Age, Hunter Gatherer",
    2: "Medieval",
    3: "Industrial Revolution",
    4: "Pre-Crash High Tech"
  };

  const FACTIONS = [
    { min: 1, max: 38, name: "Clan of Cog", genotypes: ["pure", "mutant", "plantient", "manimal"], prime: "per" },
    { min: 39, max: 47, name: "Chosen of Zuu", genotypes: ["manimal"], prime: "str" },
    { min: 48, max: 56, name: "Children of the Glow", genotypes: ["mutant", "plantient", "manimal"], prime: "luck" },
    { min: 57, max: 65, name: "Curators", genotypes: ["pure", "mutant", "manimal"], prime: "int" },
    { min: 66, max: 74, name: "Atomic Equinox", genotypes: ["plantient"], prime: "ag" },
    { min: 75, max: 80, name: "Holy Medicinal Order", genotypes: ["pure", "mutant", "plantient", "manimal"], prime: "per" },
    { min: 81, max: 85, name: "Gene Police", genotypes: ["pure"], prime: "str" },
    { min: 86, max: 95, name: "Vile Brotherhood", genotypes: ["mutant"], prime: "luck" },
    { min: 95, max: 100, name: "Technorabble", genotypes: ["pure", "mutant", "plantient", "manimal"], prime: "int" }
  ];

  const HOUSE_ADJECTIVES_BY_TECH = {
    1: ["Clay", "Stone", "Stick", "Straw", "Cave", "Mud"],
    2: ["Windmill", "Brick", "Wrought Iron", "Tower", "Mill", "Slaughter", "Farm", "Fermentation"],
    3: ["Safe", "Secure", "Tudor", "Haunted", "Refridgeration", "Noodle", "Curry", "Medical", "Family", "Suburban", "Basketball"],
    4: ["Vault", "Robot", "Cyborg", "Hologram", "Electric", "Nanobot", "Drone", "Replicated", "Clone"]
  };

  const PLANT_SETTLEMENT_ADJECTIVES = ["Forest", "Farm", "Jungle", "Field", "Woods"];

  const SETTLEMENT_TABLES = {
    common: [
      { min: 1, max: 6, type: "House", population: "1d6", tech: [1, 4], adjective: "house" },
      { min: 7, max: 10, type: "Encampment", population: "4d4", tech: [1, 4] },
      { min: 11, max: 30, type: "Homestead", population: "4d6", tech: [1, 3] },
      { min: 31, max: 60, type: "Nomad Camp", population: "6d6", tech: [1, 2] },
      { min: 61, max: 65, type: "Walled Water Merchants", population: "4d10+10", tech: [1, 3] },
      { min: 66, max: 76, type: "Commune", population: "10d10+40", tech: [1, 3] },
      { min: 77, max: 87, type: "Freehold", population: "1d100+150", tech: [1, 4] },
      { min: 87, max: 90, type: "Trade Outpost", population: "1d100+1d50+198", tech: [2, 3] },
      { min: 91, max: 93, type: "Pre War Vault", population: "3d100+50", tech: [3, 4] },
      { min: 93, max: 97, type: "Walled Town", population: "5d100+500", tech: [2, 3] },
      { min: 97, max: 100, type: "Walled City", population: "4d1000+1000", tech: [2, 3] }
    ],
    martial: [
      { min: 1, max: 6, type: "Hunter Cave", population: "1d6", tech: [1, 4] },
      { min: 7, max: 10, type: "Scout Hideout", population: "4d4", tech: [1, 4] },
      { min: 11, max: 30, type: "Mercenary Fort", population: "4d6", tech: [1, 3] },
      { min: 31, max: 60, type: "War Camp", population: "6d6", tech: [1, 2] },
      { min: 61, max: 65, type: "Walled Water Commisar", population: "4d10+10", tech: [1, 3] },
      { min: 66, max: 76, type: "Garrison", population: "10d10+40", tech: [1, 3] },
      { min: 77, max: 87, type: "Castle", population: "1d100+150", tech: [1, 4] },
      { min: 87, max: 90, type: "Fortress", population: "1d100+1d50+198", tech: [2, 3] },
      { min: 91, max: 93, type: "Bastion", population: "3d100+50", tech: [3, 4] },
      { min: 93, max: 97, type: "Walled Base", population: "5d100+500", tech: [2, 3] },
      { min: 97, max: 100, type: "Warlord's Capitol", population: "4d1000+1000", tech: [2, 3] }
    ],
    plant: [
      { min: 1, max: 6, type: "Copse", population: "1d6", tech: [1, 4] },
      { min: 7, max: 10, type: "Grove", population: "4d4", tech: [1, 4] },
      { min: 11, max: 30, type: "Orchard", population: "4d6", tech: [1, 3] },
      { min: 31, max: 60, type: "Garden", population: "6d6", tech: [1, 2] },
      { min: 61, max: 65, type: "Commons", population: "4d10+10", tech: [1, 3] },
      { min: 66, max: 76, type: "Commune", population: "10d10+40", tech: [1, 3] },
      { min: 77, max: 87, type: "Freehold", population: "1d100+150", tech: [1, 4] },
      { min: 87, max: 90, type: "Collective", population: "1d100+1d50+198", tech: [2, 3] },
      { min: 91, max: 93, type: "Small", population: "3d100+50", tech: [3, 4], adjective: "plant" },
      { min: 93, max: 97, type: "Medium", population: "5d100+500", tech: [2, 3], adjective: "plant" },
      { min: 97, max: 100, type: "Farm", population: "4d1000+1000", tech: [2, 3], adjective: "plant" }
    ],
    holy: [
      { min: 1, max: 6, type: "Hermitage", population: "1d6", tech: [1, 4], adjective: "house" },
      { min: 7, max: 10, type: "Chantry", population: "4d4", tech: [1, 4] },
      { min: 11, max: 30, type: "Sanctuary", population: "4d6", tech: [1, 3] },
      { min: 31, max: 60, type: "Enclave", population: "6d6", tech: [1, 2] },
      { min: 61, max: 65, type: "Chapter House", population: "4d10+10", tech: [1, 3] },
      { min: 66, max: 76, type: "Commune", population: "10d10+40", tech: [1, 3] },
      { min: 77, max: 87, type: "Sacred Village", population: "1d100+150", tech: [1, 4] },
      { min: 87, max: 90, type: "Temple", population: "1d100+1d50+198", tech: [2, 3] },
      { min: 91, max: 93, type: "Temple Vault", population: "3d100+50", tech: [3, 4] },
      { min: 93, max: 97, type: "Holy Town", population: "5d100+500", tech: [2, 3] },
      { min: 97, max: 100, type: "Holy City", population: "4d1000+1000", tech: [2, 3] }
    ]
  };

  const FACTION_SETTLEMENT_TABLE = {
    "Clan of Cog": "common",
    "Children of the Glow": "common",
    "Curators": "common",
    "Technorabble": "common",
    "Chosen of Zuu": "martial",
    "Gene Police": "martial",
    "Atomic Equinox": "plant",
    "Vile Brotherhood": "holy",
    "Holy Medicinal Order": "holy"
  };

  const CLASS_DEFINITIONS = {
    Sentinel: { page: 26, hpDie: 12 },
    Shaman: { page: 28, hpDie: 4 },
    Healer: { page: 30, hpDie: 8 },
    Rover: { page: 32, hpDie: 6 },
    Mutant: { page: 34, hpDie: 5, physical: "1d3", mental: "1d2" },
    Manimal: { page: 36, hpDie: 7, physical: "1d2", mental: "1" },
    Plantient: { page: 38, hpDie: 5, physical: "1d3", mental: "0" }
  };

  const MUTATION_TABLE = [
    { min: 1, max: 5, physical: "Roll a defect", mental: "Roll a defect", defect: "Roll two defects" },
    { min: 6, max: 8, physical: "Amplimorph", mental: "Absorption", defect: "Asymmetrical Body" },
    { min: 9, max: 12, physical: "Carapace", mental: "Cryokinesis", defect: "Attraction Odor" },
    { min: 13, max: 15, physical: "Claws", mental: "Death Field Generation", defect: "Body Part Loss" },
    { min: 16, max: 18, physical: "Electrical Generation", mental: "Devolution", defect: "Death Pretense" },
    { min: 19, max: 24, physical: "Extra Senses", mental: "Domination", defect: "Delayed Reactions" },
    { min: 25, max: 29, physical: "Gas Generation", mental: "Dual Brain", defect: "Delusional" },
    { min: 30, max: 32, physical: "Heightened Agility", mental: "Empathy", defect: "Devolved" },
    { min: 33, max: 35, physical: "Heightened Stamina", mental: "Force Field Generation", defect: "Diminished Body Part" },
    { min: 36, max: 40, physical: "Heightened Strength", mental: "Heightened Intelligence", defect: "Diminished Sense" },
    { min: 41, max: 43, physical: "Holographic Skin", mental: "Illusion Generation", defect: "Diminished Stamina" },
    { min: 44, max: 46, physical: "Increased Speed", mental: "Life Force Reflection", defect: "Enmity" },
    { min: 47, max: 49, physical: "Infravision", mental: "Magnetic Control", defect: "Enlarged Body Part" },
    { min: 50, max: 52, physical: "Light Generation", mental: "Mind Control", defect: "Ipsilateral Body Plan" },
    { min: 53, max: 55, physical: "Metamorph", mental: "Mental Blast", defect: "Life Force Transference" },
    { min: 56, max: 59, physical: "Multiple Body Parts", mental: "Mental Shield", defect: "Mental Block" },
    { min: 60, max: 62, physical: "New Body Parts", mental: "Mental Reflection", defect: "Mental Defenselessness" },
    { min: 63, max: 65, physical: "Plasticity", mental: "Molecular Disruption", defect: "Multiple Personalities" },
    { min: 66, max: 69, physical: "Radiation Generation", mental: "Molecular Integration", defect: "Mutation Loss" },
    { min: 70, max: 73, physical: "Regeneration", mental: "Pyrokinesis", defect: "Special Vulnerability" },
    { min: 74, max: 77, physical: "Shorter", mental: "Telekinesis", defect: "Stumblebum" },
    { min: 78, max: 80, physical: "Sonic Generation", mental: "Telepathy", defect: "Stunted Wings" },
    { min: 81, max: 83, physical: "Spines", mental: "Teleportation", defect: "Thin Skin" },
    { min: 84, max: 86, physical: "Symbiotic Touch", mental: "Temporary Invulnerability", defect: "Uncontrolled Empathy" },
    { min: 87, max: 91, physical: "Taller", mental: "Thought Spike", defect: "Uncontrolled Telepathy" },
    { min: 92, max: 94, physical: "Ultravision", mental: "Time Sense", defect: "Useless Extra Body Parts" },
    { min: 95, max: 97, physical: "Wings", mental: "Time Stop", defect: "Weak Willed" },
    { min: 98, max: 100, physical: "Mega Mutation", mental: "Mega Mutation", defect: "No defect, gain mutation" }
  ];

  const MEGA_MUTATION_TABLE = [
    { min: 1, max: 11, physical: "Anaerobic", mental: "Assimilation" },
    { min: 12, max: 22, physical: "Detonating Fingers", mental: "Cognitive Immortality" },
    { min: 23, max: 33, physical: "Gene Splice", mental: "Eidetic Memory" },
    { min: 34, max: 44, physical: "Merge", mental: "Genetic Oracle" },
    { min: 45, max: 55, physical: "Metallic Skin", mental: "Life Force Drain" },
    { min: 56, max: 66, physical: "Phase Shift", mental: "Meditative State" },
    { min: 67, max: 77, physical: "Singularity", mental: "Molecular Analysis" },
    { min: 78, max: 88, physical: "Xenomorph", mental: "Time Lash" },
    { min: 89, max: 100, physical: "Pick any two mutations", mental: "Pick any two mutations" }
  ];

  const MUTATION_DETAILS = {
    Amplimorph: { page: 45, type: "Active" },
    Carapace: { page: 46, type: "Passive", profile: "carapace" },
    Claws: { page: 46, type: "Passive", profile: "claws" },
    "Electrical Generation": { page: 47, type: "Active" },
    "Extra Senses": { page: 48, type: "Active" },
    "Gas Generation": { page: 49, type: "Active" },
    "Heightened Agility": { page: 50, type: "Passive", profile: "heightenedAgility" },
    "Heightened Stamina": { page: 51, type: "Passive", profile: "heightenedStamina" },
    "Heightened Strength": { page: 51, type: "Passive", profile: "heightenedStrength" },
    "Holographic Skin": { page: 52, type: "Active" },
    "Increased Speed": { page: 53, type: "Passive", profile: "increasedSpeed" },
    Infravision: { page: 54, type: "Passive", profile: "infravision" },
    "Light Generation": { page: 54, type: "Active" },
    Metamorph: { page: 55, type: "Active" },
    "Multiple Body Parts": { page: 56, type: "Passive", profile: "multipleBodyParts" },
    "New Body Parts": { page: 56, type: "Passive", profile: "newBodyParts" },
    Plasticity: { page: 57, type: "Passive", profile: "plasticity" },
    "Radiation Generation": { page: 58, type: "Active" },
    Regeneration: { page: 59, type: "Active" },
    Shorter: { page: 60, type: "Passive", profile: "shorter" },
    "Sonic Generation": { page: 60, type: "Active" },
    Spines: { page: 61, type: "Passive", profile: "spines" },
    "Symbiotic Touch": { page: 62, type: "Active" },
    Taller: { page: 62, type: "Passive", profile: "taller" },
    Ultravision: { page: 63, type: "Passive", profile: "ultravision" },
    Wings: { page: 64, type: "Passive", profile: "wings" },
    Absorption: { page: 65, type: "Passive", profile: "genericPassive" },
    Cryokinesis: { page: 66, type: "Active" },
    "Death Field Generation": { page: 66, type: "Active" },
    Devolution: { page: 68, type: "Active" },
    Domination: { page: 69, type: "Active" },
    "Dual Brain": { page: 69, type: "Passive", profile: "genericPassive" },
    Empathy: { page: 70, type: "Active" },
    "Force Field Generation": { page: 71, type: "Active" },
    "Heightened Intelligence": { page: 72, type: "Passive", profile: "heightenedIntelligence" },
    "Illusion Generation": { page: 72, type: "Active" },
    "Life Force Reflection": { page: 73, type: "Active" },
    "Magnetic Control": { page: 74, type: "Active" },
    "Mind Control": { page: 75, type: "Active" },
    "Mental Blast": { page: 76, type: "Active" },
    "Mental Shield": { page: 76, type: "Active" },
    "Mental Reflection": { page: 77, type: "Active" },
    "Molecular Disruption": { page: 78, type: "Active" },
    "Molecular Integration": { page: 79, type: "Active" },
    Pyrokinesis: { page: 80, type: "Active" },
    Telekinesis: { page: 81, type: "Active" },
    Telepathy: { page: 82, type: "Active" },
    Teleportation: { page: 83, type: "Active" },
    "Temporary Invulnerability": { page: 83, type: "Active" },
    "Thought Spike": { page: 85, type: "Active" },
    "Time Sense": { page: 85, type: "Active" },
    "Time Stop": { page: 86, type: "Active" },
    "Asymmetrical Body": { page: 88, type: "Passive", defect: true, profile: "genericDefect" },
    "Attraction Odor": { page: 88, type: "Passive", defect: true, profile: "genericDefect" },
    "Body Part Loss": { page: 89, type: "Passive", defect: true, profile: "genericDefect" },
    "Death Pretense": { page: 89, type: "Active", defect: true },
    "Delayed Reactions": { page: 90, type: "Passive", defect: true, profile: "genericDefect" },
    Delusional: { page: 90, type: "Passive", defect: true, profile: "genericDefect" },
    Devolved: { page: 91, type: "Passive", defect: true, profile: "genericDefect" },
    "Diminished Body Part": { page: 91, type: "Passive", defect: true, profile: "genericDefect" },
    "Diminished Sense": { page: 92, type: "Passive", defect: true, profile: "genericDefect" },
    "Diminished Stamina": { page: 92, type: "Passive", defect: true, profile: "genericDefect" },
    Enmity: { page: 93, type: "Passive", defect: true, profile: "genericDefect" },
    "Enlarged Body Part": { page: 93, type: "Passive", defect: true, profile: "genericDefect" },
    "Ipsilateral Body Plan": { page: 94, type: "Passive", defect: true, profile: "genericDefect" },
    "Life Force Transference": { page: 94, type: "Active", defect: true },
    "Mental Block": { page: 95, type: "Passive", defect: true, profile: "genericDefect" },
    "Mental Defenselessness": { page: 95, type: "Passive", defect: true, profile: "genericDefect" },
    "Multiple Personalities": { page: 96, type: "Passive", defect: true, profile: "genericDefect" },
    "Mutation Loss": { page: 97, type: "Passive", defect: true, profile: "genericDefect" },
    "Special Vulnerability": { page: 97, type: "Passive", defect: true, profile: "genericDefect" },
    Stumblebum: { page: 98, type: "Passive", defect: true, profile: "genericDefect" },
    "Stunted Wings": { page: 98, type: "Passive", defect: true, profile: "genericDefect" },
    "Thin Skin": { page: 99, type: "Passive", defect: true, profile: "genericDefect" },
    "Uncontrolled Empathy": { page: 99, type: "Passive", defect: true, profile: "genericDefect" },
    "Uncontrolled Telepathy": { page: 100, type: "Passive", defect: true, profile: "genericDefect" },
    "Useless Extra Body Parts": { page: 100, type: "Passive", defect: true, profile: "genericDefect" },
    "Weak Willed": { page: 100, type: "Passive", defect: true, profile: "genericDefect" },
    Anaerobic: { page: 102, type: "Passive", profile: "genericPassive" },
    "Detonating Fingers": { page: 103, type: "Active" },
    "Gene Splice": { page: 104, type: "Active" },
    Merge: { page: 104, type: "Active" },
    "Metallic Skin": { page: 106, type: "Active" },
    "Phase Shift": { page: 107, type: "Active" },
    Singularity: { page: 108, type: "Active" },
    Xenomorph: { page: 109, type: "Passive", profile: "genericPassive" },
    Assimilation: { page: 110, type: "Active" },
    "Cognitive Immortality": { page: 111, type: "Active" },
    "Eidetic Memory": { page: 112, type: "Passive", profile: "genericPassive" },
    "Genetic Oracle": { page: 113, type: "Passive", profile: "genericPassive" },
    "Life Force Drain": { page: 114, type: "Active" },
    "Meditative State": { page: 115, type: "Active" },
    "Molecular Analysis": { page: 117, type: "Active" },
    "Time Lash": { page: 118, type: "Active" }
  };

  const TECH_2_ITEMS = [
    { name: "battleaxe", detail: "1d10", cost: "20 gp" },
    { name: "blackjack", detail: "1d3/2d6", cost: "3 gp" },
    { name: "blowgun", detail: "1d3/1d5, range 20/40/60", cost: "6 gp" },
    { name: "club", detail: "1d4", cost: "3 gp" },
    { name: "crossbow", detail: "range 80/160/240", cost: "30 gp", ammo: "quarrels" },
    { name: "dagger", detail: "1d4/1d10, range 10/20/30", cost: "3 gp" },
    { name: "dart", detail: "range 20/40/60", cost: "5 sp" },
    { name: "flail", detail: "1d6", cost: "8 gp" },
    { name: "garrote", detail: "1/3d4", cost: "3 gp" },
    { name: "handaxe", detail: "range 10/20/30", cost: "4 gp" },
    { name: "javelin", detail: "range 30/60/90", cost: "1 gp" },
    { name: "lance", detail: "1d12", cost: "25 gp" },
    { name: "longbow", detail: "range 70/140/210", cost: "40 gp", ammo: "arrows and arrow, irradiated" },
    { name: "longsword", detail: "1d8", cost: "10 gp" },
    { name: "mace", detail: "1d6", cost: "5 gp" },
    { name: "polearm", detail: "1d10", cost: "7 gp" },
    { name: "shortbow", detail: "range 50/100/150", cost: "25 gp", ammo: "arrows and arrow, irradiated" },
    { name: "short sword", detail: "1d6", cost: "7 gp" },
    { name: "sling", detail: "range 40/80/160", cost: "2 sp", ammo: "sling stones" },
    { name: "spear", detail: "1d8", cost: "3 gp" },
    { name: "staff", detail: "1d4", cost: "5 sp" },
    { name: "two-handed sword", detail: "1d10", cost: "15 gp" },
    { name: "warhammer", detail: "1d8", cost: "5 gp" },
    { name: "backpack", cost: "2 gp" },
    { name: "candle", cost: "1 cp" },
    { name: "chain, 10 ft.", cost: "30 gp" },
    { name: "chalk, 1 piece", cost: "1 cp" },
    { name: "chest, empty", cost: "2 gp" },
    { name: "crowbar", cost: "2 gp" },
    { name: "flask, empty", cost: "3 cp" },
    { name: "flint & steel", cost: "15 cp" },
    { name: "grappling hook", cost: "1 gp" },
    { name: "hammer, small", cost: "5 sp" },
    { name: "holy symbol", cost: "25 gp" },
    { name: "holy water, 1 vial", cost: "25 gp" },
    { name: "iron spikes, each", cost: "1 sp" },
    { name: "lantern", cost: "10 gp" },
    { name: "mirror, hand-sized", cost: "10 gp" },
    { name: "oil, 1 flask", cost: "2 sp" },
    { name: "pole, 10-foot", cost: "15 cp" },
    { name: "rations, per day", cost: "5 cp" },
    { name: "rope, 50 ft.", cost: "25 cp" },
    { name: "sack, large", cost: "12 cp" },
    { name: "sack, small", cost: "8 cp" },
    { name: "thieves' tools", cost: "25 gp" },
    { name: "torch, each", cost: "1 cp" },
    { name: "waterskin", cost: "5 sp" },
    { name: "padded armor", cost: "5 gp" },
    { name: "leather armor", cost: "20 gp" },
    { name: "studded leather", cost: "45 gp" },
    { name: "hide armor", cost: "30 gp" },
    { name: "scale mail", cost: "80 gp" },
    { name: "chainmail", cost: "150 gp" },
    { name: "banded mail", cost: "250 gp" },
    { name: "half-plate", cost: "600 gp" },
    { name: "full plate", cost: "1,200 gp" },
    { name: "shield", cost: "10 gp" }
  ];

  const TECH_3_ITEMS = [
    { name: "battleaxe", detail: "1d10", cost: "20 gp" },
    { name: "club", detail: "1d4", cost: "3 gp" },
    { name: "crossbow", detail: "1d6, range 80/160/240", cost: "60 gp", ammo: "quarrels" },
    { name: "crossbow, hand", detail: "1d4, range 20/40/60", cost: "250 gp", ammo: "quarrels" },
    { name: "crossbow, repeating", detail: "1d6, range 80/160/240", cost: "600 gp", ammo: "quarrels" },
    { name: "dagger", detail: "1d4/1d10, range 10/20/30", cost: "10 gp" },
    { name: "flail", detail: "1d6", cost: "25 gp" },
    { name: "javelin", detail: "1d6, range 30/60/90", cost: "10 gp" },
    { name: "handaxe", detail: "1d6, range 10/20/30", cost: "5 gp" },
    { name: "lance", detail: "1d12", cost: "40 gp" },
    { name: "longbow", detail: "1d6, range 70/140/210", cost: "150 gp", ammo: "arrows" },
    { name: "longsword", detail: "1d8", cost: "50 gp" },
    { name: "mace", detail: "1d6", cost: "35 gp" },
    { name: "nunchaku", detail: "1d5", cost: "20 gp" },
    { name: "polearm", detail: "1d10", cost: "35 gp" },
    { name: "pick, military", detail: "1d10", cost: "40 gp" },
    { name: "quarterstaff", detail: "1d4", cost: "5 gp" },
    { name: "rapier", detail: "1d5", cost: "125 gp" },
    { name: "scimitar", detail: "1d6", cost: "80 gp" },
    { name: "shield", detail: "1d3", cost: "30 gp" },
    { name: "sling", detail: "1d4, range 40/80/120", cost: "10 gp", ammo: "sling stones" },
    { name: "shortbow", detail: "1d6, range 50/100/150", cost: "55 gp", ammo: "arrows" },
    { name: "short sword", detail: "1d6", cost: "35 gp" },
    { name: "spear", detail: "1d8", cost: "10 gp" },
    { name: "stiletto", detail: "1d3, range 10/15/20", cost: "10 gp" },
    { name: "scythe", detail: "1d10", cost: "50 gp" },
    { name: "trident", detail: "1d8", cost: "60 gp" },
    { name: "two-handed sword", detail: "1d10", cost: "80 gp" },
    { name: "warhammer", detail: "1d8", cost: "70 gp" },
    { name: "whip", detail: "1d4", cost: "25 gp" },
    { name: "rifle", detail: "2d8, range 100/200/300", cost: "150 gp, ammo: 10 shot clip" },
    { name: "pistol, .25", detail: "1d8, range 30/60/90", cost: "100 gp, ammo: 8 shot clip" },
    { name: "pistol, .45", detail: "2d6, range 30/60/90", cost: "175 gp, ammo: 10 shot clip" },
    { name: "revolver, .38", detail: "1d12, range 30/60/90", cost: "125 gp, ammo: 6 in cylinder" },
    { name: "shotgun", detail: "2d6, range 10/20/30", cost: "100 gp, ammo: 6 integral" },
    { name: "sexy leather", detail: "+1 AC", cost: "200 gp" },
    { name: "armored jacket", detail: "+1 AC", cost: "40 gp" },
    { name: "leather", detail: "+2 AC", cost: "60 gp" },
    { name: "halfling leather", detail: "+2 AC", cost: "200/600 gp" },
    { name: "micromesh clothing", detail: "+2 AC", cost: "200 gp" },
    { name: "composite sport, light", detail: "+3 AC", cost: "30 gp" },
    { name: "hide", detail: "+3 AC", cost: "20 gp" },
    { name: "micromesh", detail: "+3 AC", cost: "850 gp" },
    { name: "sexy chainmail", detail: "+3 AC", cost: "1,000 gp" },
    { name: "minilynx, light", detail: "+4 AC", cost: "750 gp" },
    { name: "chainmail shirt", detail: "+4 AC", cost: "100 gp" },
    { name: "composite sports, heavy", detail: "+5 AC", cost: "300 gp" },
    { name: "chainmail", detail: "+5 AC", cost: "250 gp" },
    { name: "titanium chainmail", detail: "+5 AC", cost: "750 gp" },
    { name: "breastplate", detail: "+5 AC", cost: "400 gp" },
    { name: "titanium breastplate", detail: "+5 AC", cost: "1,200 gp" },
    { name: "sexy half plate", detail: "+5 AC", cost: "800 gp" },
    { name: "elfmake chainmail", detail: "+5 AC", cost: "special" },
    { name: "banded mail", detail: "+6 AC", cost: "300 gp" },
    { name: "minilynx", detail: "+6 AC", cost: "1,300 gp" },
    { name: "half plate", detail: "+7 AC", cost: "600 gp" },
    { name: "dwarvish plate", detail: "+8 AC", cost: "5,000 gp" },
    { name: "plate mail", detail: "+8 AC", cost: "2,225 gp" },
    { name: "titanium plate mail", detail: "+8 AC", cost: "7,000 gp" }
  ];

  const TECH_4_ITEMS = [
    "dazer pistol", "fazer pistol", "gauzer pistol", "lazer pistol", "mazer pistol",
    "neutron rifle", "fazer rifle", "gauzer rifle", "lazer rifle", "mazer rifle",
    "EMP grenade", "photon grenade", "stun grenade", "quantum grenade",
    "force baton", "plasma sword", "zapper glove",
    "bubble helmet", "enviro belt", "force field belt", "plasteel mesh", "power armor, scout", "power armor, attack", "power armor, assault",
    "bubble car", "grav ped", "grav sled",
    "accelershot", "cureshot", "cybernetic implant", "medipac", "medishot", "neuroshot", "radshot", "stimshot",
    "carbon nano-cord", "com badge", "energy cloak", "fusion torch", "grav clamp", "holo-cloak", "multitool", "rejuv-chamber", "sensor pad", "sonic spanner",
    "c-cell", "f-cell", "f-pack", "q-cell", "q-pack", "s-cell", "solar recharger",
    "cortexin cylinders", "force field projector", "gene resequencer", "stasis booth"
  ].map((name) => ({ name, cost: "artifact" }));

  const TRAPS_BY_TECH = {
    1: [
      "swing hammer", "spike pit", "snare", "stone avalanche", "cactus thorn caltrops", "clay jar: scorpions",
      "spiked swinging log", "sinking sand-vault", "barbed vine net", "fire trap", "tetanus board", "ash bag",
      "meat basket trap"
    ],
    2: [
      "crossbow tripwire", "counterweight cage", "iron hunting trap", "rolling steel barrel roll", "musket trap",
      "guillotine", "gatling-style flail trap", "serrated cable snare", "weighted spike board", "spring-loaded spear",
      "candle drop", "spike-roller", "iron gate drop"
    ],
    3: [
      "claymore tripwire", "shotgun doorknob", "electric wire over wet hall", "pneumatic piston ram",
      "high-voltage chainlink fence", "propane tank flame-thrower", "industrial shredder pit", "subwoofer trap",
      "nail-gun sentry rig", "flash bulb trap", "tablesaw trap", "dirty-bomb"
    ],
    4: [
      "AI laser sentry", "4 micro robo grenades", "EMP mine", "sleep-gas", "radiation emitter",
      "ultrasonic disruption array", "strobe-incapacitation corridor", "proximity-activated plasma mine",
      "smart monofilament wire grid", "liquid nitrogen sprinkler", "bio-hazard emitter", "anti mutagen dart",
      "holographic decoy", "directed microwave emitter", "automated tesla coil field", "gravity-grid inversion",
      "nanite disassembly zone", "optical disruptor turret"
    ]
  };

  const HEX_TERRAINS = {
    G: { name: "Grass", color: "#8ccf5f", radiation: 10, forage: "Dex d12", settlement: 20, encounter: 20 },
    D: { name: "Desert", color: "#e7cf62", radiation: 20, forage: "Sta d20", settlement: 10, encounter: 20 },
    F: { name: "Forest", color: "#2d7f43", radiation: 10, forage: "Dex d16", settlement: 10, encounter: 30 },
    S: { name: "Swamp", color: "#8d9d32", radiation: 10, forage: "Str d16", settlement: 8, encounter: 40 },
    H: { name: "Hills", color: "#8b6137", radiation: 10, forage: "Sta d16", settlement: 8, encounter: 20 },
    M: { name: "Mountains", color: "#9b9b9b", radiation: 10, forage: "Str d20", settlement: 5, encounter: 40 },
    O: { name: "Ocean", color: "#8fd4f5", radiation: 20, forage: "Luck d10", settlement: 5, encounter: 20 },
    L: { name: "Lake", color: "#3f8fde", radiation: 10, forage: "Luck d16", settlement: 20, encounter: 20 },
    W: { name: "Wasteland", color: "#e88caf", radiation: 80, forage: "Int d24", settlement: 10, encounter: 80 },
    R: { name: "Ruins", color: "#8d57c7", radiation: 50, forage: "Int d20", settlement: 50, encounter: 50 }
  };

  const HEX_TERRAIN_WEIGHTS = {
    G: { G: 50, D: 20, F: 20, S: 20, H: 20, M: 10, O: 4, L: 20, R: 10, W: 20 },
    D: { G: 20, D: 50, F: 5, S: 5, H: 20, M: 10, O: 3, L: 4, W: 30, R: 10 },
    F: { G: 20, D: 5, F: 50, S: 20, H: 20, M: 10, O: 3, L: 10, R: 20, W: 10 },
    S: { G: 20, D: 5, F: 20, S: 50, H: 5, M: 1, O: 6, L: 20, W: 10, R: 10 },
    H: { G: 30, D: 20, F: 20, S: 5, H: 30, M: 30, O: 2, L: 5, W: 5, R: 5 },
    M: { G: 10, D: 5, F: 10, S: 5, H: 20, M: 40, O: 1, L: 10, W: 1, R: 1 },
    O: { G: 4, D: 2, F: 2, S: 5, H: 3, M: 1, O: 50, L: 1, W: 3, R: 5 },
    L: { G: 20, D: 5, F: 20, S: 30, H: 5, M: 5, O: 1, L: 20, W: 5, R: 5 },
    W: { G: 10, D: 20, F: 10, S: 20, H: 10, M: 5, O: 5, L: 10, W: 50, R: 10 },
    R: { G: 20, D: 20, F: 20, S: 20, H: 20, M: 5, O: 5, L: 10, W: 40, R: 5 }
  };

  const DICE_CHAIN = ["d3", "d4", "d5", "d6", "d7", "d8", "d10", "d12", "d14", "d16", "d20", "d24", "d30"];
  const HEX_MAP_RADIUS = 10;
  const OCEAN_SIDE_BAND_DEPTH = 4;
  const OCEAN_SHORE_CHANCE_BY_DISTANCE = [96, 88, 74, 58];
  const ISLAND_TERRAIN_WEIGHTS = { G: 35, F: 25, H: 15, R: 10, W: 8, S: 4, D: 3 };
  const OCEAN_SETTLEMENT_PREFIXES = [
    "Sunken",
    "Floating",
    "Pontoon",
    "Sailship",
    "Seaborne",
    "Submarine",
    "Underwater",
    "Drifting",
    "Drowned"
  ];

  const HEX_DIRECTIONS = [
    { q: 1, r: 0, key: "E", keypad: "num6" },
    { q: 1, r: -1, key: "NE", keypad: "num9" },
    { q: 0, r: -1, key: "NW", keypad: "num7" },
    { q: -1, r: 0, key: "W", keypad: "num4" },
    { q: -1, r: 1, key: "SW", keypad: "num1" },
    { q: 0, r: 1, key: "SE", keypad: "num3" }
  ];

  const HEX_SIDES = [
    { key: "E", keypad: "num6", distance: (q, _r, radius) => radius - q },
    { key: "NE", keypad: "num9", distance: (_q, r, radius) => r + radius },
    { key: "NW", keypad: "num7", distance: (q, r, radius) => q + r + radius },
    { key: "W", keypad: "num4", distance: (q, _r, radius) => q + radius },
    { key: "SW", keypad: "num1", distance: (_q, r, radius) => radius - r },
    { key: "SE", keypad: "num3", distance: (q, r, radius) => radius - (q + r) }
  ];

  const FACTION_ICON_PREFIX = {
    "Clan of Cog": "cog",
    "Chosen of Zuu": "zuu",
    "Children of the Glow": "glow",
    Curators: "curator",
    "Atomic Equinox": "equinox",
    "Holy Medicinal Order": "medicinal",
    "Gene Police": "gene-cop",
    "Vile Brotherhood": "vile",
    Technorabble: "techno"
  };

  const RANDOM_ENCOUNTERS = [
    { name: "Aether Squid", hd: "20d6", source: "Bestiary A.D." },
    { name: "Beast Thing", hd: "1d10", source: "Bestiary A.D." },
    { name: "Beast Thing Champion", hd: "1d10+2", source: "Bestiary A.D." },
    { name: "Byte-Mon", hd: "20d10", source: "Bestiary A.D." },
    { name: "Caprapod (Spider-Goat)", hd: "4d6", source: "Bestiary A.D." },
    { name: "Caprapod Warder", hd: "10d8", source: "Bestiary A.D." },
    { name: "Cactacea Rex (C-Rex)", hd: "25d6", source: "Bestiary A.D." },
    { name: "Changeling", hd: "2d6", source: "Bestiary A.D." },
    { name: "Data Ghost", hd: "0", source: "Bestiary A.D.", rarityHd: "10d10" },
    { name: "Descryer", hd: "5d6", source: "Bestiary A.D." },
    { name: "(Devil) Ant-Men", hd: "1d10", source: "Bestiary A.D." },
    { name: "(Devil) Ant-Men, Drone", hd: "3d8+6", source: "Bestiary A.D." },
    { name: "(Devil) Croachling", hd: "2d6", source: "Bestiary A.D." },
    { name: "(Devil) Hopper", hd: "2d10", source: "Bestiary A.D." },
    { name: "(Devil) Wooler", hd: "2d10", source: "Bestiary A.D." },
    { name: "Gigantopithecus (Great Ape)", hd: "15d6", source: "Bestiary A.D." },
    { name: "Glazkin", hd: "2d10", source: "Bestiary A.D." },
    { name: "Gopher-Men", hd: "1d4", source: "Bestiary A.D." },
    { name: "Grasser", hd: "2d10", source: "Bestiary A.D." },
    { name: "Morticon-66", hd: "6d6", source: "Bestiary A.D." },
    { name: "Piranha Bats", hd: "1d4", source: "Bestiary A.D." },
    { name: "Pyrosome (Funnel Beast)", hd: "20d10", source: "Bestiary A.D." },
    { name: "Quantum Cat", hd: "1d6", source: "Bestiary A.D." },
    { name: "Silane Serpent (Glass Snake)", hd: "10d6", source: "Bestiary A.D." },
    { name: "Scavok-69", hd: "2d6", source: "Bestiary A.D." },
    { name: "Screamer", hd: "3d6", source: "Bestiary A.D." },
    { name: "Smart Mud", hd: "6d6", source: "Bestiary A.D." },
    { name: "Tardigrade (Terrorphant)", hd: "10d10", source: "Bestiary A.D." },
    { name: "Tetravalent (Rotah)", hd: "4d10", source: "Bestiary A.D." },
    { name: "Tibbar", hd: "2d10", source: "Bestiary A.D." },
    { name: "Rexxon the Ravenger (Yvox)", hd: "30d12+6", source: "Bestiary A.D." },
    { name: "Android, Immortal", hd: "20d6", source: "Artifact AI" },
    { name: "Android, Simulant", hd: "7d6", source: "Artifact AI" },
    { name: "Android, Synthezoid", hd: "20d6", source: "Artifact AI" },
    { name: "Android, Replicant", hd: "10d6", source: "Artifact AI" },
    { name: "Cyborg, Covert Ops", hd: "18d10", source: "Artifact AI" },
    { name: "Cyborg, Covert Ops (Advanced)", hd: "18d10", source: "Artifact AI" },
    { name: "Cyborg, Military", hd: "10d10", source: "Artifact AI" },
    { name: "Hologram, Soft Light", hd: "1d6", source: "Artifact AI" },
    { name: "Hologram, Hard Light", hd: "4d6", source: "Artifact AI" },
    { name: "Hologram, Resurrection", hd: "1d6/4d6", source: "Artifact AI", average: 11.375 },
    { name: "Agro-Bot", hd: "20d6", source: "Artifact AI" },
    { name: "Cargo-Bot", hd: "15d6", source: "Artifact AI" },
    { name: "Companion-Bot", hd: "7d6", source: "Artifact AI" },
    { name: "Construction-Bot", hd: "20d6", source: "Artifact AI" },
    { name: "Household-Bot", hd: "7d6", source: "Artifact AI" },
    { name: "Medi-Bot", hd: "10d6", source: "Artifact AI" },
    { name: "Nano-Bot", hd: "0", source: "Artifact AI", rarityHd: "10d10" },
    { name: "Security-Bot", hd: "14d6", source: "Artifact AI" },
    { name: "War-Bot", hd: "40d6", source: "Artifact AI" }
  ];

  const ENCOUNTER_STAT_BLOCKS = {
    "Aether Squid": "Aether Squid: Init +5; Atk spiked tentacles +5 melee (1d8 constriction) or bite +5 melee (1d20 + swallow whole); AC 17; HD {hdHp}; MV 150' flying; Act 4d20; SP swallow whole, +5 mutation checks Holographic Skin; SV Fort +4, Ref +4, Will +2.",
    "Beast Thing": "Beast Thing: Init +1; Atk spear +0 melee (1d6) or poison darts +1 ranged (1d3, DC 13 Fort save or paralysis 1d4 rounds); AC 12; HD {hdHp}; MV 30'; Act 1d20; SV Fort +1, Ref +1, Will -1.",
    "Beast Thing Champion": "Beast Thing Champion: Init +1; Atk axe +2 melee (1d12) or poison darts +1 missile (1d3, DC 13 Fort save or paralysis, 1d4 rounds); AC 12; HD {hdHp}; MV 30'; Act 1d20; SV Fort +1, Ref +1, Will -1.",
    "Byte-Mon": "Byte-Mon: Init +4; Atk none; AC 20; HD {hdHp}; MV 50'; Act 1d30; SV Fort +1, Ref +1, Will +1.",
    "Caprapod (Spider-Goat)": "Caprapod: Init +3; Atk gore +3 melee (2d4), bite +3 melee (1d4 plus paralytic poison), or webs +3 missile fire (entangled); AC 15; HD {hdHp}; MV 40'; Act 1d20; SP paralytic poison; SV Fort +2, Ref +4, Will +0.",
    "Caprapod Warder": "Caprapod Warder: Init +6; Atk +6 shepherd crook (1d6); AC 14; HD {hdHp}; MV 10'; Act 1d20 + 1d16; SP +6 mutation checks Telepathy, Mental Blast; SV Fort +4, Ref +2, Will +4.",
    "Cactacea Rex (C-Rex)": "Cactacea Rex: Init +6; Atk bite +6 (6d6, target is swallowed whole if damage greater than target's hit point total); AC 17; HD {hdHp}; MV 60'; Act 2d20; SP takes 2x damage from fire-based attacks, mutation checks +6 Carapace, Regeneration; SV Fort +6, Ref +4, Will +3.",
    "Changeling": "Changeling: Init +3; Atk bite +2 melee (1d6, sever appendage on critical hit); AC 14; HD {hdHp}; MV 10'-50'; Act 1d20; SP mutation check +2 Metamorph; SV Fort +1, Ref +2, Will +1.",
    "Data Ghost": "Data Ghost: Init +0; Atk none; AC 0; HD {hdHp}; MV 20'; Act 1d20; SP immaterial; SV Fort +0, Ref +0, Will +0.",
    "Descryer": "Descryer: Init +4; Atk sucker tentacles +4 melee (1d4, drains blood for 1 hit point every round attached); AC 12; HD {hdHp}; MV 40' flying; Act 3d20; SP mutation check +4 Molecular Disruption; SV Fort +2, Ref +1, Will +0.",
    "(Devil) Ant-Men": "(Devil) Ant-Men: Init +2; Atk bite +2 melee (1d6) or barbed wood spear +2 missile fire (1d10); AC 14; HD {hdHp}; MV 40'; Act 1d20; SP mutation check +2 Hive Intelligence; SV Fort +1, Ref +2, Will -1.",
    "(Devil) Ant-Men, Drone": "(Devil) Ant-Men, Drones: Atk bite +3 melee (1d6) or barbed wood spear +3 missile fire (1d10); AC 18; HD {hdHp}; MV 50' or fly 50'; Act 1d20; SP mind control saliva spit (Range 10', DC 14 Will save to resist), mutation check +3 Hive Intelligence; SV Fort +7, Ref +3, Will +1.",
    "(Devil) Croachling": "Croachling: Init +2; Atk bite +2 melee (1d4) or crude spear +4 missile fire (1d5); AC 14; HD {hdHp}; MV 20', 25' flying; Act 1d20; SP walk on walls, ceiling, mutation check +2 Carapace, Wings, Mental Blast; SV Fort +4, Ref +1, Will +1.",
    "(Devil) Hopper": "(Devil) Hopper: Init +2; Atk bite +0 melee (1d8) or kick +2 melee (1d12); AC 14; HD {hdHp}; MV 100', 50' jump; Act 1d20; SV Fort +1, Ref +2, Will -1.",
    "(Devil) Wooler": "(Devil) Wooler: Init +1; Atk radiation blast +1 missile fire (2d6 +1) or cocoon spin +1 missile fire (DC 15 Ref save or become entangled); AC 12; HD {hdHp}; MV 120' flying; Act 1d20; SV Fort +0, Ref +2, Will -1.",
    "Gigantopithecus (Great Ape)": "Gigantopithecus: Init +5; Atk fists +5 melee (1d20), boulder toss +5 missile fire (3d6), or tentacle constriction +5 melee (2d10); AC 12; HD {hdHp}; MV 60'; Act 1d20; SP none; SV Fort +5, Ref +5, Will +1.",
    "Glazkin": "Glazkin: Init +5; Atk unarmed +5 (1d4) or +5 by weapon type; AC 14; HD {hdHp}; MV 15'; Act 1d20+5; SP mutation check +5 Shorter, Heightened Intelligence, Illusion Generation; SV Fort +1, Ref +4, Will +6.",
    "Gopher-Men": "Gopher-Men: Init +0; Atk steel claws +0 melee (1d8); AC 10; HD {hdHp}; MV 20', 30' tunneling; Act 1d20; SP steel claws; SV Fort +1, Ref +0, Will -1.",
    "Grasser": "Grasser: Init +0; Atk bite +0 melee (1d6) or horns +0 melee (1d8); AC 12; HD {hdHp}; MV 45'; Act 1d20; SV Fort +1, Ref +0, Will -1.",
    "Morticon-66": "Morticon-66: Init +2; Atk baton +3 melee (1d6), lazer rifle +4 missile fire (6d6); AC 15; HD {hdHp}; MV 35'; Act 1d20; SP immune to mind control, EMP proof; SV Fort +4, Ref +4, Will +2.",
    "Piranha Bats": "Piranha Bats: Init +2; Atk bite +5 bite melee (1 hp); AC 10; HD {hdHp}; MV 35' flying; Act 1d20; SP mutation checks +2 Enhanced Senses (echolocation); SV Fort +0, Ref +2, Will +0.",
    "Pyrosome (Funnel Beast)": "Pyrosome: Init +4; Atk envelope target +8 missile fire (DC 18 Reflex save to avoid), flame digestion (damage equal to current hp); AC 15; HD {hdHp}; MV 60' flying; Act 1d20; SP damage divides creature into two half-sized creatures; SV Fort +0, Ref +4, Will +0.",
    "Quantum Cat": "Quantum Cat: Init +4; Atk claw +4 melee (1d2) and bite +4 melee (1d3); AC 16; HD {hdHp}; MV 40'; Act 3d20; SP touch causes transformation into duplicate of target creature; SV Fort +4, Ref +6, Will +2.",
    "Silane Serpent (Glass Snake)": "Silane Serpent: Init +5; Atk bite +5 melee (5d6); AC 18; HD {hdHp}; MV 40' burrowing; Act 1d20+5; SP swallow victims whole, takes 1d12 damage per pint of water splashed on it; SV Fort +4, Ref +2, Will -4.",
    "Scavok-69": "Scavok-69: Init +1; Atk stun ray +2 missile fire (DC 14 Ref save or stunned for 1d6 rounds); AC 15; HD {hdHp}; MV 30'; Act 1d20; SV Fort +2, Ref +2, Will -4.",
    "Screamer": "Screamer: Init -4; Atk slam +1 melee (1d4 + DC 15 Fort save or 1d3 radiation burn); AC 9; HD {hdHp}; MV 20'; Act 1d20; SP un-dead; SV Fort +4, Ref -4, Will +2.",
    "Smart Mud": "Smart Mud: Init -1; Atk pseudopod +3 melee (1d12 plus suffocation); AC 10; HD {hdHp}; MV 20'; Act 2d20; SP grapple to suffocate (DC 12 Fort save or suffocate in 2d5 rounds); SV Fort +4, Ref +1, Will +1.",
    "Tardigrade (Terrorphant)": "Tardigrade: Init +2; Atk extensible snout bite +2 melee (3d6) or roll over victim for crushing damage +4 melee (6d6); AC 18; HD {hdHp}; MV 40'; Act 1d20; SP none; SV Fort +6, Ref +0, Will -3.",
    "Tetravalent (Rotah)": "Tetravalent: Init +2; Atk envelope foe +0 melee (4d6 acid damage); AC 19; HD {hdHp}; MV 35', 25' burrowing; Act 1d20; SP mutation check +4 Carapace; SV Fort +6, Ref +0, Will +1.",
    "Tibbar": "Tibbar: Init +3; Atk bite +3 melee (1d4), wooden spear +3 melee or missile fire (1d6); AC 12; HD {hdHp}; MV 35'; Act 1d20+3; SP mutation check +2 Life Force Drain, Energy Sap; SV Fort +1, Ref +0, Will -1.",
    "Rexxon the Ravenger (Yvox)": "Rexxon the Ravenger (Yvox): Init +9; Atk claws +9 melee (1d10), bite +9 melee (1d12), tail slap +9 melee (1d20), wing buffet +9 missile fire (2d12), atomic breath +9 missile fire (see SP); AC 27; HD {hdHp}; MV 60', 120' flying; Act 5d20; SP Atomic Breath, mutation checks +9 Enhanced Intelligence, Molecular Disruption; SV Fort +10, Ref +8, Will +12.",
    "Android, Immortal": "Android, Immortal: Init +8; Atk slam +8 melee (1d20+8 or by weapon type +8); AC 20 or by armor type (+8 AC); HD {hdHp}; MV 100'; Act 1d24; SP immune to mind control, limited invulnerability; SV Fort +8, Ref +8, Will +7; AI recog automatic.",
    "Android, Simulant": "Android, Simulant: Init +4; Atk slam +4 melee (1d8 or by weapon type +4); AC 13 or by armor type (+4); HD {hdHp}; MV 30'; Act 1d20; SP immune to mind control; SV Fort +4, Ref +4, Will +3; AI recog automatic.",
    "Android, Synthezoid": "Android, Synthezoid: Init +6; Atk slam +6 melee (1d14 or by weapon type +6); AC 17 or by armor type (+6 AC); HD {hdHp}; MV 60'; Act 1d20; SP immune to mind control, poisons, radiation, does not need to eat or breathe; SV Fort +6, Ref +6, Will +5; AI recog N/A.",
    "Android, Replicant": "Android, Replicant: Init +5; Atk slam +5 melee (1d10 or by weapon type +5); AC 16 or by armor type (+5 AC); HD {hdHp}; MV 45'; Act 1d20; SP immune to mind control; SV Fort +5, Ref +5, Will +4; AI recog N/A.",
    "Cyborg, Covert Ops": "Cyborg, Covert Ops: Init +10; Atk slam +8 melee (1d12 or by weapon type +8); AC 18; HD {hdHp}; MV 40'; Act 3d20; SP immune to mind control; SV Fort +8, Ref +8, Will +4; AI recog 16.",
    "Cyborg, Covert Ops (Advanced)": "Cyborg, Covert Ops (Advanced): Init +10; Atk lazer rifle +8 missile fire (6d6 heat) or plasma sword +8 melee (2d12) and lazer pistol +8 missile fire (3d6 heat); AC 18; HD {hdHp}; MV 40'; Act 3d20; SP immune to mind control; SV Fort +8, Ref +8, Will +4; AI recog 18.",
    "Cyborg, Military": "Cyborg, Military: Init +5; Atk Fazer Rifle +5 missile fire (stun, Heat 5d6 damage, or Disintegrate); AC 20; HD {hdHp}; MV 30' (60' flying); Act 2d20; SP force field (50 hp), impervious to non-energy-based attacks; SV Fort +5, Ref +1, Will +2; AI recog 24.",
    "Hologram, Soft Light": "Hologram, Soft Light: Init +4; Atk holo-flail +4 melee (1d6 subdual); AC 18; HD {hdHp}; MV 30'; Act 1d20; SP immaterial; SV Fort +4, Ref +4, Will +4; AI recog 5.",
    "Hologram, Hard Light": "Hologram, Hard Light: Init +4; Atk +4 melee (1d8 or by weapon type); AC 20; HD {hdHp}; MV 30'; Act 1d20; SP invulnerable except for heat-based attacks; SV Fort +4, Ref +4, Will +4; AI recog 5.",
    "Hologram, Resurrection": "Hologram, Resurrection: Init +2/4; Atk +4 holo-flail melee (1d6 subdual), +4/+4 melee (1d8) or by weapon type; AC 18/20; HD {hdHp}; MV 30'; Act 1d20; SP immaterial/invulnerable except for heat-based attacks; SV Fort +4, Ref +4, Will +4; AI recog 5.",
    "Agro-Bot": "Agro-Bot: Init +2; Atk garden tool arm +10 melee (6d6) or manipulator arm +10 melee (4d6); AC 18; HD {hdHp}; MV 20'; Act 3d20; SP force cage, immune to mind control; SV Fort +4, Ref +2, Will +0; AI recog 14 (Governmental).",
    "Cargo-Bot": "Cargo-Bot: Init +2; Atk load lifter arms +2 melee (10d6), tractor beam (10 ton); AC 18; HD {hdHp}; MV 30'; Act 2d20; SP immune to mind control; SV Fort +4, Ref +2, Will +1; AI recog 12 (Governmental).",
    "Companion-Bot": "Companion-Bot: Init +0; Atk none; AC 14; HD {hdHp}; MV 30'; Act 1d20; SP immune to mind control; SV Fort +1, Ref +1, Will +0; AI recog 12.",
    "Construction-Bot": "Construction-Bot: Init +3; Atk bulldozer arm +3 melee (12d6), crane arms +3 melee (10d6), laser welder +3 ranged (15d6), or tractor beam +3 ranged (15 ton limit); AC 18; HD {hdHp}; MV 20' (10' flying); Act 2d20; SP immune to mind control; SV Fort +8, Ref +4, Will +1; AI recog 12 (Governmental).",
    "Household-Bot": "Household-Bot: Init +0; Atk +3 claw melee (1d6), insecticide spray +3 ranged (1d8, 20' radius, DC 12 Ref save for 1/2 damage); AC 14; HD {hdHp}; MV 30'; Act 1d20; SP immune to mind control; SV Fort +2, Ref +1, Will +0; AI recog 12.",
    "Medi-Bot": "Medi-Bot: Init +4; Atk ultrasonic scalpel +2 melee (1d10); HD {hdHp}; MV 30' (20' flying); Act 1d20; SP immune to mind control, heal 4d8, cure radiation/poison; SV Fort +4, Ref +4, Will +2; AI recog 18 (Medical).",
    "Nano-Bot": "Nano-Bot: Init +20; Atk none; AC 30; HD {hdHp}, 1 hit point per 10,000 encountered; MV 120' flying; Act d30; SP immune to mind control, can alter matter at the atomic level; SV Fort +20, Ref +20, Will +20; AI recog 20 (Security).",
    "Security-Bot": "Security-Bot: Init +8; Atk stun ray +8 missile fire, force baton +8 melee (2d8+8), neural net +8 missile fire, sleep micro-grenades +8 missile fire; AC 18; HD {hdHp}; MV 50' flying; Act 4d20; SP immune to mind control, force shield (15 hp); SV Fort +6, Ref +4, Will +1; AI recog 19 (Security).",
    "War-Bot": "War-Bot: Init +10; Atk fazer rifle +10 missile fire, maser rifle +10 missile fire, plasma sword +10 melee (2d12), quantum grenades +10 missile fire; AC 20; HD {hdHp}; MV 120' flying; Act 4d20; SP force screen (25 hp, regenerative), immune to mind control; SV Fort +10, Ref +8, Will +8; AI recog 20 (Military)."
  };

  const NPC_NICKNAMES = [
    "Doctor",
    "Patchwork",
    "Rustjaw",
    "Glassback",
    "Needles",
    "Shiver",
    "Crank",
    "Old Switch",
    "Wirebite",
    "Bonebox",
    "Sparkplug",
    "Brightmask",
    "Static",
    "Cinders",
    "Roadsign",
    "Scrapwick",
    "Glimmer",
    "Hazmat",
    "Gasket",
    "Twine",
    "Null",
    "Six-Toes",
    "Longshadow",
    "Bristle",
    "Greenflash",
    "Cobalt",
    "Mercy",
    "Stitches",
    "Suture",
    "Geargrin",
    "Tin Smile",
    "Burnmark",
    "Knucklebone",
    "Glowstick",
    "Switchback",
    "Drift",
    "Rattle",
    "Farsight",
    "Torchbearer",
    "Quarry",
    "Softstep",
    "Grime",
    "Filter",
    "Canteen",
    "Spindle",
    "Brackish",
    "Weather",
    "Ashlock",
    "Duct Tape",
    "Crosswire",
    "Whisperplate",
    "Sister Static",
    "Brother Bolt",
    "Warden",
    "Bugout",
    "Jackpot",
    "Double-Down",
    "Curb",
    "Yardstick",
    "Tangle",
    "Rootcase",
    "Saffron",
    "Chlorine",
    "Feverdream",
    "Kettle",
    "Bent Nail",
    "Half-Life",
    "Oddmint",
    "Redline",
    "Knives",
    "Spare Part",
    "Mutter",
    "Coppervein",
    "Bunker",
    "Scaffold",
    "Mosslight",
    "Twitch",
    "Socket",
    "Pincushion",
    "Blackout",
    "Greywater",
    "Sundown",
    "Knock-Knock",
    "Crawlspace",
    "Vinegar",
    "Pale Wire",
    "Tollbooth",
    "Scrap Saint",
    "Wick",
    "Blindturn",
    "Clatter",
    "Primer",
    "Smokestack",
    "Tagalong",
    "Hardshell",
    "Lowlight",
    "Ruinborn",
    "Greasepaint",
    "Sundial",
    "Milkglass",
    "Alarm",
    "Crater",
    "Nightmark",
    "Skinsuit",
    "Thimble",
    "Ferro",
    "Quiver",
    "Sunspot",
    "Chalkline",
    "Cauter",
    "Odd Job",
    "Sparks",
    "Lockjaw",
    "Pothole",
    "Mire",
    "Clink",
    "Aftertaste",
    "Washboard",
    "Blister",
    "Ragwire",
    "Tin Cup"
  ];

  const EXTRA_NICKNAME_SOURCE = "AshSootCinderRustOxideTarSmogSlagGritSiltMudClaySlateFlintCoalQuartzBasaltBrambleThornBurrNettleThistleBarkDustBlightMarrowSinewBoneFossilGrimRidgeScarStitchPatchRagTatterShredScrapJunkRemnantsBoltNutScrewGearCogSprocketWrenchValvePistonCrankRivetWireFuseSparkCircuitCapacitorTransistorRelayDiodeAnodeCathodeGaugeMeterSensorRadarSonarLaserPlasmaStaticSignalVectorMatrixCyberGlitchBufferCacheMacroProxyNodeKernelTagsBladeEdgePointSpikeBarbTalonFangClawGripHiltSheathShieldArmorHelmAxeMaulMaceFlailClubCleaverTracerRicochetDebrisCaliberTriggerHammerBarrelStockScopeSightBreachChokeRecoilMuzzleImpactShockBlastSparkIgniterLeadScoutTrackerHunterTrapperScavLooterRaiderRunnerCourierPilotDriverWreckerMechanicFixerDocMedicSurgeonChemistCookButcherSmithTinkererWeaverTailorScrapperDiggerMinerProspectorSurveyorCartographerSentinelWatchmanGuardSentryRangerEnforcerJudgeWardenKeeperElderWeatherStarknessStormGaleSquallTempestBlizzardFrostRimeHailThunderBoltLightningFlashNovaCometMeteorOrbitEclipseCoronaSolarCosmoVesperDuskDawnTwilightGloomShadowShadePhantomGhostSpecterWraithHollowBansheeEchoWhisperMurmurRumbleHissBuzzDrone";

  const ALL_NPC_NICKNAMES = uniqueNicknames([
    ...NPC_NICKNAMES,
    ...parseCapitalDelimitedNames(EXTRA_NICKNAME_SOURCE)
  ]);

  const HYPHEN_SEGMENTS = ALL_NPC_NICKNAMES.filter((name) => /^[A-Za-z]+$/.test(name) && name.length <= 7);

  function parseCapitalDelimitedNames(source) {
    return source.match(/[A-Z][a-z0-9]*/g) || [];
  }

  function uniqueNicknames(names) {
    const seen = new Set();
    return names.filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function randomInt(max) {
    if (max < 1) {
      throw new Error("Die sides must be positive.");
    }

    const cryptoSource = root.crypto || (typeof require === "function" ? require("crypto").webcrypto : null);
    if (cryptoSource && cryptoSource.getRandomValues) {
      const array = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / max) * max;
      let value;
      do {
        cryptoSource.getRandomValues(array);
        value = array[0];
      } while (value >= limit);
      return (value % max) + 1;
    }

    return Math.floor(Math.random() * max) + 1;
  }

  function createRoller(log) {
    return {
      die(sides, label) {
        const result = randomInt(sides);
        log.push(`${label}: d${sides} = ${result}`);
        return { sides, result };
      },
      dice(count, sides, label) {
        const results = [];
        for (let i = 0; i < count; i += 1) {
          results.push(randomInt(sides));
        }
        const total = results.reduce((sum, value) => sum + value, 0);
        log.push(`${label}: ${count}d${sides} = ${total} (${results.join("+")})`);
        return { count, sides, results, total };
      }
    };
  }

  function findRange(table, value) {
    return table.find((row) => value >= row.min && value <= row.max);
  }

  function chooseOne(values, roll, label) {
    const choiceRoll = roll.die(values.length, label);
    return values[choiceRoll.result - 1];
  }

  function chooseWeighted(weightMap, roll, label) {
    const entries = Object.entries(weightMap).filter(([, weight]) => weight > 0);
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    const choiceRoll = roll.die(total, label);
    let cursor = choiceRoll.result;

    for (const [key, weight] of entries) {
      cursor -= weight;
      if (cursor <= 0) {
        return key;
      }
    }

    return entries[entries.length - 1][0];
  }

  function rollRange(min, max, roll, label) {
    const rangeRoll = roll.die(max - min + 1, label);
    return min + rangeRoll.result - 1;
  }

  function rollFormula(formula, roll, label) {
    const parts = formula.match(/[+-]?[^+-]+/g) || [];
    let total = 0;
    const detail = [];

    parts.forEach((part) => {
      const sign = part.startsWith("-") ? -1 : 1;
      const clean = part.replace(/^[+-]/, "");
      const diceMatch = clean.match(/^(\d+)d(\d+)$/i);
      if (diceMatch) {
        const count = Number(diceMatch[1]);
        const sides = Number(diceMatch[2]);
        const dice = roll.dice(count, sides, label);
        total += sign * dice.total;
        detail.push(`${sign < 0 ? "-" : ""}${dice.total}`);
      } else {
        const value = Number(clean);
        total += sign * value;
        detail.push(`${sign < 0 ? "-" : "+"}${value}`);
      }
    });

    return { total, detail: detail.join(" ") };
  }

  function resolveOption(row, roll) {
    const subroll = roll.die(row.die, row.label);
    const option = row.options[subroll.result - 1];
    return typeof option === "function" ? option(roll) : option;
  }

  function rollMutantAppearance(roll, depth) {
    const safeDepth = depth || 0;
    if (safeDepth > 10) {
      return ["unstable cascading mutant appearance"];
    }

    const tableRoll = roll.die(30, "Table 1-6 Mutant Appearance");
    const row = findRange(MUTANT_APPEARANCE, tableRoll.result);
    if (row.kind === "rollTwice") {
      return [
        ...rollMutantAppearance(roll, safeDepth + 1),
        ...rollMutantAppearance(roll, safeDepth + 1)
      ];
    }

    return [resolveOption(row, roll)];
  }

  function rollSubtype(table, tableName, roll, depth) {
    const safeDepth = depth || 0;
    if (safeDepth > 10) {
      return ["unstable cascading subtype"];
    }

    const tableRoll = roll.die(30, tableName);
    const row = findRange(table, tableRoll.result);
    if (row.kind === "rollAgainMutant") {
      return [
        ...rollSubtype(table, tableName, roll, safeDepth + 1),
        ...rollMutantAppearance(roll, 0)
      ];
    }

    return [resolveOption(row, roll)];
  }

  function abilityModifier(score) {
    if (score <= 3) {
      return -3;
    }
    if (score <= 5) {
      return -2;
    }
    if (score <= 8) {
      return -1;
    }
    if (score <= 12) {
      return 0;
    }
    if (score <= 15) {
      return 1;
    }
    if (score <= 17) {
      return 2;
    }
    return 3;
  }

  function rollAbilities(roll) {
    return {
      str: roll.dice(3, 6, "Strength").total,
      ag: roll.dice(3, 6, "Agility").total,
      sta: roll.dice(3, 6, "Stamina").total,
      per: roll.dice(3, 6, "Personality").total,
      int: roll.dice(3, 6, "Intelligence").total,
      luck: roll.dice(3, 6, "Luck").total
    };
  }

  function rollBirthSign(roll) {
    const birthSignRoll = roll.die(30, "Table 1-3 Birth Sign");
    return BIRTH_SIGNS[birthSignRoll.result - 1];
  }

  function rollOccupation(roll) {
    const occupationRoll = roll.die(100, "Table 1-2 Occupation");
    return findRange(OCCUPATIONS, occupationRoll.result);
  }

  function rollStartingEquipment(roll) {
    const firstRoll = roll.die(100, "Table 1-4 Beginning Equipment 1");
    const secondRoll = roll.die(100, "Table 1-4 Beginning Equipment 2");
    return [
      findRange(STARTING_EQUIPMENT, firstRoll.result).item,
      findRange(STARTING_EQUIPMENT, secondRoll.result).item
    ];
  }

  function rollStartingEquipmentItem(roll, label) {
    const itemRoll = roll.die(100, label);
    return findRange(STARTING_EQUIPMENT, itemRoll.result);
  }

  function rollAlignment(genotypeKind, roll) {
    const alignmentRoll = roll.die(10, "Alignment");
    if (alignmentRoll.result <= 6) {
      return "Clan of Cog";
    }

    return {
      pure: "The Curators",
      mutant: "Children of the Glow",
      manimal: "The Chosen Zuu",
      plantient: "The Atomic Equinox"
    }[genotypeKind];
  }

  function formatSigned(value) {
    return value >= 0 ? `+${value}` : `${value}`;
  }

  function articleFor(item) {
    if (/^(hide armor|jerked|paints|hemp rope)/.test(item)) {
      return "";
    }
    return /^[aeiou]/.test(item) ? "an" : "a";
  }

  function finalStats(abilities, birthSign, hpRoll) {
    const staMod = abilityModifier(abilities.sta);
    const agMod = abilityModifier(abilities.ag);
    const perMod = abilityModifier(abilities.per);
    const luckMod = abilityModifier(abilities.luck);

    let hp = hpRoll + staMod;
    let ac = 10 + agMod;
    let fort = staMod;
    let ref = agMod;
    let will = perMod;

    if (birthSign === "The Survivor") {
      fort += luckMod;
      ref += luckMod;
      will += luckMod;
    } else if (birthSign === "The Scientist") {
      ref += luckMod;
    } else if (birthSign === "The Glow") {
      fort += luckMod;
    } else if (birthSign === "The Esper") {
      will += luckMod;
    } else if (birthSign === "The Bunker") {
      ac += luckMod;
    } else if (birthSign === "The Ecobot") {
      hp += luckMod;
    }

    return {
      hp: Math.max(1, hp),
      ac,
      fort,
      ref,
      will
    };
  }

  function formatEquipment(items) {
    const lowerItems = items.map((item) => item.toLowerCase());
    const finalItem = lowerItems[lowerItems.length - 1];
    const article = articleFor(finalItem);
    const finalText = article ? `${article} ${finalItem}` : finalItem;
    return `${lowerItems.slice(0, -1).join(", ")}, and ${finalText}`;
  }

  function factionByName(name) {
    return FACTIONS.find((faction) => faction.name === name);
  }

  function factionsForGenotype(genotypeKind) {
    return FACTIONS.filter((faction) => faction.genotypes.includes(genotypeKind));
  }

  function isPrimeHighest(abilities, prime) {
    return Object.entries(abilities).every(([key, value]) => key === prime || abilities[prime] >= value);
  }

  function rollAbilitiesUntil(roll, label, predicate) {
    for (let attempt = 1; attempt <= 500; attempt += 1) {
      const abilities = rollAbilities(roll);
      if (!predicate || predicate(abilities)) {
        return abilities;
      }
    }
    return rollAbilities(roll);
  }

  function socialSum(abilities) {
    return abilities.ag + abilities.per + abilities.luck;
  }

  function physicalSum(abilities) {
    return abilities.str + abilities.sta + abilities.int;
  }

  function combatSum(abilities) {
    return abilities.str + abilities.ag + abilities.sta;
  }

  function mentalSum(abilities) {
    return abilities.per + abilities.int + abilities.luck;
  }

  function rollSettlementLeaderLevel(settlementIndex, roll, role) {
    if (settlementIndex <= 1) {
      return 0;
    }

    const cappedRank = Math.min(settlementIndex, 6);
    const penalty = 7 - cappedRank;
    return Math.max(0, roll.die(6, `${role} level`).result - penalty);
  }

  function choosePureStrainClass(npc, roll) {
    if (npc.faction === "Holy Medicinal Order") {
      return "Healer";
    }
    if (npc.faction === "Technorabble" || npc.faction === "Curators") {
      return "Shaman";
    }
    if (npc.faction === "Gene Police") {
      return "Sentinel";
    }

    const candidates = [
      { key: "str", className: "Sentinel" },
      { key: "sta", className: "Sentinel" },
      { key: "ag", className: "Rover" },
      { key: "int", className: "mental" }
    ];
    const highest = Math.max(...candidates.map((candidate) => npc.abilities[candidate.key]));
    const tied = candidates.filter((candidate) => npc.abilities[candidate.key] === highest);
    const picked = chooseOne(tied, roll, `${npc.role || "NPC"} pure strain class ability`);

    if (picked.className === "mental") {
      return chooseOne(["Shaman", "Healer"], roll, `${npc.role || "NPC"} Int class`);
    }

    return picked.className;
  }

  function chooseNpcClass(npc, roll) {
    if (npc.genotypeKind === "mutant") return "Mutant";
    if (npc.genotypeKind === "manimal") return "Manimal";
    if (npc.genotypeKind === "plantient") return "Plantient";
    return choosePureStrainClass(npc, roll);
  }

  function formulaCount(formula, roll, label) {
    if (!formula || formula === "0") {
      return 0;
    }
    const diceMatch = formula.match(/^(\d+)d(\d+)$/i);
    if (diceMatch) {
      return roll.dice(Number(diceMatch[1]), Number(diceMatch[2]), label).total;
    }
    return Number(formula) || 0;
  }

  function thresholdText(total, bands) {
    const band = bands.find((entry) => total <= entry.max) || bands[bands.length - 1];
    return typeof band.text === "function" ? band.text() : band.text;
  }

  function passiveMutationDescription(profile, total, roll) {
    if (profile === "carapace") {
      return thresholdText(total, [
        { max: 11, text: "Cosmetic armored hide only." },
        { max: 13, text: "Natural AC increases by +2." },
        { max: 17, text: "Natural AC increases by +3; +1 Fort." },
        { max: 19, text: "Natural AC increases by +4; +2 Fort; speed -5'." },
        { max: 23, text: "Natural AC increases by +5; +3 Fort; speed -10'." },
        { max: 27, text: "Natural AC increases by +6; +4 Fort; speed -15'." },
        { max: 29, text: "Natural AC increases by +7; +5 Fort; speed -16'." },
        { max: 31, text: "Natural AC increases by +8; +5 Fort; speed -18'." },
        { max: Infinity, text: "Natural AC increases by +9; +5 Fort; speed -20'." }
      ]);
    }
    if (profile === "claws") {
      return thresholdText(total, [
        { max: 11, text: "Cosmetic, non-damaging claws." },
        { max: 13, text: "Claws cause 1d3 damage per strike." },
        { max: 17, text: "Claws cause 1d5 damage per strike." },
        { max: 19, text: "Claws cause 1d7 damage per strike." },
        { max: 23, text: "Claws cause 1d14 damage per strike; +1 initiative." },
        { max: 27, text: "Claws cause 1d16 damage per strike; +2 initiative." },
        { max: 29, text: "Claws cause 1d20 damage per strike; +3 initiative." },
        { max: 31, text: "Claws cause 1d20 damage; 2 attacks per action die; +4 initiative." },
        { max: Infinity, text: "Claws cause 1d20 damage; 3 attacks per action die; +5 initiative." }
      ]);
    }
    if (profile === "heightenedAgility") {
      return thresholdText(total, [
        { max: 11, text: "Cosmetic hyperactive speech." },
        { max: 13, text: "Agility +1." },
        { max: 17, text: "Agility +2." },
        { max: 19, text: "Agility +3." },
        { max: 23, text: "Agility +4; base speed 35'." },
        { max: 27, text: "Agility +6; AC +9 ignoring normal Agility modifier; base speed 40'." },
        { max: 29, text: "Agility +7; AC +10 ignoring normal Agility modifier; base speed 60'." },
        { max: 31, text: "Agility +8; AC +11 ignoring normal Agility modifier; base speed 80'." },
        { max: Infinity, text: "Agility +9; AC +12 ignoring normal Agility modifier; base speed 100'; cannot be surprised." }
      ]);
    }
    if (profile === "heightenedStamina") {
      return thresholdText(total, [
        { max: 11, text: "Cosmetic skin trauma resistance." },
        { max: 13, text: "Stamina +1." },
        { max: 17, text: "Stamina +2." },
        { max: 19, text: "Stamina +3." },
        { max: 23, text: "Stamina +4; not vulnerable to electrical attacks." },
        { max: 27, text: "Stamina +6; immune to heat attacks." },
        { max: 29, text: "Stamina +7; fully resistant to radiation attacks." },
        { max: 31, text: "Stamina +8; impervious to kinetic attacks." },
        { max: Infinity, text: "Stamina +9; unaffected by energy attacks; cannot miss Fort saves except on natural 1." }
      ]);
    }
    if (profile === "heightenedStrength") {
      return thresholdText(total, [
        { max: 11, text: "Cosmetic muscular build." },
        { max: 13, text: "Strength +1." },
        { max: 17, text: "Strength +2." },
        { max: 19, text: "Strength +3." },
        { max: 23, text: "Strength +4; speed -5'." },
        { max: 27, text: "Strength +6; speed -10'." },
        { max: 29, text: "Strength +7; speed -15'." },
        { max: 31, text: "Strength +8; speed -20'." },
        { max: Infinity, text: "Strength +9; may only make melee attacks every other round." }
      ]);
    }
    if (profile === "heightenedIntelligence") {
      return thresholdText(total, [
        { max: 11, text: "Cosmetic distracted brilliance." },
        { max: 13, text: "Intelligence +1." },
        { max: 17, text: "Intelligence +2." },
        { max: 19, text: "Intelligence +3." },
        { max: 23, text: "Intelligence +4; +1 artifact checks." },
        { max: 27, text: "Intelligence +6; +2 artifact checks." },
        { max: 29, text: "Intelligence +7; +3 artifact checks." },
        { max: 31, text: "Intelligence +8; +4 artifact checks." },
        { max: Infinity, text: "Intelligence becomes 24; artifact checks automatic for all tech levels; cannot be surprised." }
      ]);
    }
    if (profile === "increasedSpeed") {
      return thresholdText(total, [
        { max: 11, text: "Cosmetic twitchiness." },
        { max: 13, text: "Movement speed +5'." },
        { max: 17, text: "Movement speed +10'." },
        { max: 19, text: "Movement speed +15'; gains additional d14 action die." },
        { max: 23, text: "Movement speed +20'; gains additional d16 action die." },
        { max: 27, text: "Movement speed +25'; gains additional d20 action die." },
        { max: 29, text: "Movement speed +30'; gains two additional d14 action dice." },
        { max: 31, text: "Movement speed +50'; gains two additional d16 action dice." },
        { max: Infinity, text: "Movement speed +100'; gains two additional d20 action dice." }
      ]);
    }
    if (profile === "infravision") {
      return thresholdText(total, [
        { max: 11, text: "Cosmetic infrared eyes." },
        { max: 13, text: "Sees infrared heat sources up to 10'." },
        { max: 17, text: "Sees infrared heat sources up to 20'." },
        { max: 19, text: "Sees infrared heat sources up to 40'." },
        { max: 23, text: "Sees heat sources up to 60' and residual heat up to 10 minutes old." },
        { max: 27, text: "Sees heat sources up to 100' and residual heat/cold up to 30 minutes old." },
        { max: 29, text: "Sees heat sources up to 100' and residual heat/cold up to 2 hours old." },
        { max: 31, text: "Sees heat sources up to 100' and 1' through organic matter." },
        { max: Infinity, text: "Sees heat sources up to 100', 10' through organic matter, and 5' through inorganic matter." }
      ]);
    }
    if (profile === "multipleBodyParts") {
      return thresholdText(total, [
        { max: 11, text: () => `Cosmetic only; gains one nonfunctional ${chooseOne(["arm", "leg", "tiny head on chest"], roll, "Multiple Body Parts cosmetic part")}.` },
        { max: 13, text: "The mutant has 2 extra arms and gains a d16 additional action die for melee attacks only." },
        { max: 17, text: "The mutant has 2 extra legs and gains an additional 20' to movement." },
        { max: 19, text: "The mutant has 2 extra arms and gains a d20 additional action die for melee attacks only." },
        { max: 23, text: "The mutant has 2 extra arms and a d20 melee action die; also has 2 extra legs and +30' movement." },
        { max: 27, text: "The mutant has 4 extra arms and a d20 melee action die; also has 4 extra legs and +40' movement." },
        { max: 29, text: () => `The mutant has ${roll.die(5, "Multiple Body Parts extra arms").result + 3} extra arms and gains two additional d20 action dice for melee and missile attacks only.` },
        { max: 31, text: () => `The mutant has ${roll.die(5, "Multiple Body Parts extra arms").result + 3} extra arms and two additional d20 action dice; also has ${roll.die(5, "Multiple Body Parts extra legs").result + 3} extra legs and +50' ground movement.` },
        { max: Infinity, text: () => `The mutant has ${roll.die(5, "Multiple Body Parts extra arms").result + 5} extra arms and two additional d20 action dice; also has ${roll.die(5, "Multiple Body Parts extra legs").result + 5} extra legs and +60' movement.` }
      ]);
    }
    if (profile === "newBodyParts") {
      return thresholdText(total, [
        { max: 11, text: () => `Cosmetic only; gains one nonfunctional ${chooseOne(["antennae", "tail", "gills"], roll, "New Body Parts cosmetic part")}.` },
        { max: 13, text: "Antennae grant 360-degree movement sense; cannot be surprised by moving creatures or objects." },
        { max: 17, text: "Prehensile tail acts as an extra arm; gains d16 melee/missile action die; +1 Agility." },
        { max: 19, text: "Gills allow underwater breathing." },
        { max: 23, text: "Wings grant 30' flying movement." },
        { max: 27, text: "Gills and fins allow underwater breathing and 30' swimming movement." },
        { max: 29, text: () => `Possesses ${roll.die(6, "New Body Parts tentacles").result} prehensile tentacles; each pair grants an additional d16 melee/missile action die.` },
        { max: 31, text: () => `Possesses ${roll.die(6, "New Body Parts tentacles").result} prehensile tentacles with d16 action dice by pair; also has wings and 40' flying movement.` },
        { max: Infinity, text: "Adapted to land, water, and air with wings, fins, tail, antennae, and gills; breathes air/water, gains d20 object-manipulation action die, 360-degree senses, and 50' air/water movement." }
      ]);
    }
    if (profile === "plasticity") {
      return thresholdText(total, [
        { max: 11, text: "Cosmetic contortion only." },
        { max: 13, text: "Extends arms 10' and may make melee attacks at that range." },
        { max: 17, text: "Extends limbs 15'; melee range 15'; movement +15'." },
        { max: 19, text: "Extends limbs 20'; melee range 20'; movement +20'; -1 blunt force damage." },
        { max: 23, text: "Elastic reach and movement improve; consult p.57 for exact Plasticity outcome." },
        { max: Infinity, text: "Extreme elastic/shape-changing body; consult p.57 for exact Plasticity outcome." }
      ]);
    }
    if (profile === "shorter") {
      return thresholdText(total, [
        { max: 11, text: "Cosmetic slight shortness." },
        { max: 13, text: "1' shorter than average; AC +1." },
        { max: 17, text: "2' shorter; AC +2; movement -5'." },
        { max: 19, text: "3' shorter; AC +3; movement -10'." },
        { max: 23, text: "One-third normal height; AC +4; movement -15'." },
        { max: 27, text: "One-quarter normal height; AC +5; movement -20'." },
        { max: 29, text: "Approximately 6 inches tall; AC +6; movement 5'." },
        { max: 31, text: "Approximately 3 inches tall; AC +7; movement 2'." },
        { max: Infinity, text: "Approximately 1 inch tall; AC +10; movement 1'." }
      ]);
    }
    if (profile === "taller") {
      return thresholdText(total, [
        { max: 11, text: "Cosmetic tallness." },
        { max: 13, text: "1' taller than average; Strength +1; AC -1." },
        { max: 17, text: "2' taller; Strength +2; AC -2." },
        { max: 19, text: "3' taller; Strength +3; AC -3." },
        { max: 23, text: "Very tall; Strength +4; AC -4; movement 40'." },
        { max: 27, text: "Huge; Strength +6; AC -5; movement 50'." },
        { max: 29, text: "Giant-sized; Strength +7; AC -6; movement 60'." },
        { max: 31, text: "Towering; Strength +8; AC -7; movement 70'." },
        { max: Infinity, text: "Colossus around 18' tall; Strength +9 max 24; AC -8; movement 90'; HD changes to d20." }
      ]);
    }
    if (profile === "wings") {
      return thresholdText(total, [
        { max: 11, text: "Cosmetic wing growth only." },
        { max: 13, text: "Crude gliding wings; consult p.64." },
        { max: 17, text: "Functional wings for short flight; consult p.64." },
        { max: 23, text: "Functional wings with stronger flight; consult p.64." },
        { max: Infinity, text: "Powerful functional wings; consult p.64 for flight details." }
      ]);
    }
    if (profile === "spines" || profile === "ultravision") {
      return `Passive check ${total}; consult p.${profile === "spines" ? 61 : 63} for the exact outcome.`;
    }
    if (profile === "genericDefect") {
      return `Defect check ${total}; use the defect outcome table on the listed page.`;
    }
    return `Passive check ${total}; use the mutation outcome table on the listed page.`;
  }

  function rollPassiveMutation(mutation, npc, roll) {
    const d20 = roll.die(20, `${mutation.name} passive mutation check`);
    const total = d20.result + (npc.level || 0) + npc.abilities.luck;
    const causesDefect = d20.result === 1;
    return {
      total,
      natural: d20.result,
      description: causesDefect
        ? "Natural 1: mutation replaced by defect."
        : passiveMutationDescription(mutation.profile, total, roll),
      causesDefect
    };
  }

  function mutationRecord(name, category, npc, roll) {
    const detail = MUTATION_DETAILS[name] || { page: 44, type: "Active" };
    const record = {
      name,
      category,
      page: detail.page,
      type: detail.type,
      defect: Boolean(detail.defect)
    };

    if (detail.type === "Passive") {
      record.passive = rollPassiveMutation({ ...record, profile: detail.profile }, npc, roll);
    }

    return record;
  }

  function rollMegaMutation(category, npc, roll, depth) {
    if (depth > 6) {
      return [mutationRecord("Unstable mega mutation", category, npc, roll)];
    }

    const megaRoll = roll.die(100, `Table 3-3 ${category} mega mutation`);
    const row = findRange(MEGA_MUTATION_TABLE, megaRoll.result);
    const name = row[category];
    if (name === "Pick any two mutations") {
      return [
        rollMutation(category, npc, roll, depth + 1),
        rollMutation(category, npc, roll, depth + 1)
      ].flat();
    }
    return [mutationRecord(name, category, npc, roll)];
  }

  function rollMutation(category, npc, roll, depth) {
    if (depth > 8) {
      return [mutationRecord("Unstable mutation", category, npc, roll)];
    }

    const tableRoll = roll.die(100, `Table 3-2 ${category} mutation`);
    const row = findRange(MUTATION_TABLE, tableRoll.result);
    const name = row[category];

    if (name === "Roll a defect") {
      return rollMutation("defect", npc, roll, depth + 1);
    }
    if (name === "Roll two defects") {
      return [
        ...rollMutation("defect", npc, roll, depth + 1),
        ...rollMutation("defect", npc, roll, depth + 1)
      ];
    }
    if (name === "No defect, gain mutation") {
      const gainedCategory = chooseOne(["physical", "mental"], roll, "Defect table gained mutation type");
      return rollMutation(gainedCategory, npc, roll, depth + 1);
    }
    if (name === "Mega Mutation") {
      return rollMegaMutation(category, npc, roll, depth + 1);
    }

    const record = mutationRecord(name, category, npc, roll);
    const records = [record];
    if (record.passive && record.passive.causesDefect && category !== "defect") {
      records.push(...rollMutation("defect", npc, roll, depth + 1));
    }
    return records;
  }

  function rollClassMutations(className, npc, roll) {
    const classDef = CLASS_DEFINITIONS[className];
    const mutations = [];
    const physicalCount = formulaCount(classDef.physical, roll, `${className} physical mutations`);
    const mentalCount = formulaCount(classDef.mental, roll, `${className} mental mutations`);

    for (let i = 0; i < physicalCount; i += 1) {
      mutations.push(...rollMutation("physical", npc, roll, 0));
    }
    for (let i = 0; i < mentalCount; i += 1) {
      mutations.push(...rollMutation("mental", npc, roll, 0));
    }

    return mutations;
  }

  function applyClassAdvancement(npc, level, roll) {
    const className = level > 0 ? chooseNpcClass(npc, roll) : "0-level";
    const classDef = CLASS_DEFINITIONS[className] || null;
    const classHp = classDef && level > 0 ? roll.dice(level, classDef.hpDie, `${npc.role || "NPC"} ${className} hit points`).total : 0;
    npc.level = level;
    npc.className = className;
    npc.classPage = classDef ? classDef.page : 23;
    npc.classHp = classHp;
    npc.classHpDie = classDef ? classDef.hpDie : null;
    npc.mutations = classDef && level > 0 ? rollClassMutations(className, npc, roll) : [];
    npc.stats.hp += classHp;
  }

  function genotypeLabel(kind, roll) {
    if (kind === "pure") {
      return "Pure Strain Human";
    }
    if (kind === "mutant") {
      return `Mutant, ${joinFeatures(rollMutantAppearance(roll, 0))}`;
    }
    if (kind === "manimal") {
      return `Manimal, ${joinFeatures(rollSubtype(MANIMAL_SUBTYPE, "Table 1-7 Manimal Sub-Type", roll, 0))}`;
    }
    return `Plantient, ${joinFeatures(rollSubtype(PLANTIENT_SUBTYPE, "Table 1-8 Plantient Sub-Type", roll, 0))}`;
  }

  function generateNpcRecord(roll, options) {
    const settings = options || {};
    const name = rollNickname(roll);
    const genotypeKind = settings.genotypeKind || findRange(TABLE_1_5, roll.die(100, "Table 1-5 Character Genotype").result).kind;
    const genotypeOutput = genotypeLabel(genotypeKind, roll);
    const faction = settings.faction || rollAlignment(genotypeKind, roll);
    const abilities = settings.abilityPredicate
      ? rollAbilitiesUntil(roll, settings.role || "NPC", settings.abilityPredicate)
      : rollAbilities(roll);
    const hpRoll = roll.die(4, "Hit Points").result;
    const birthSign = rollBirthSign(roll);
    const stats = finalStats(abilities, birthSign, hpRoll);
    const occupation = rollOccupation(roll);
    const extraEquipment = rollStartingEquipment(roll);
    const equipment = formatEquipment([
      occupation.equipment,
      "flint dagger",
      "waterskin",
      ...extraEquipment
    ]);

    const npc = {
      role: settings.role,
      name,
      faction,
      genotypeKind,
      genotypeOutput,
      abilities,
      stats,
      birthSign,
      occupation: occupation.label,
      equipment
    };

    if (settings.level !== undefined) {
      applyClassAdvancement(npc, settings.level, roll);
    }

    return npc;
  }

  function formatMutationRecord(mutation) {
    const label = `${mutation.name}, p.${mutation.page}`;
    if (!mutation.passive) {
      return label;
    }
    return `${label} [Passive ${mutation.passive.total}: ${mutation.passive.description}]`;
  }

  function formatMutationLines(npc) {
    if (!npc.mutations || npc.mutations.length === 0) {
      return [];
    }

    const physical = npc.mutations.filter((mutation) => mutation.category === "physical" && !mutation.defect);
    const mental = npc.mutations.filter((mutation) => mutation.category === "mental" && !mutation.defect);
    const defects = npc.mutations.filter((mutation) => mutation.category === "defect" || mutation.defect);
    const lines = [];

    if (physical.length) {
      lines.push(`Physical Mutations: ${physical.map(formatMutationRecord).join("; ")}`);
    }
    if (mental.length) {
      lines.push(`Mental Mutations: ${mental.map(formatMutationRecord).join("; ")}`);
    }
    if (defects.length) {
      lines.push(`Defects: ${defects.map(formatMutationRecord).join("; ")}`);
    }

    return lines;
  }

  function formatNpcRecord(npc, role) {
    const prefix = role ? `${role}: ` : "Name: ";
    const affiliationLabel = role ? "Faction" : "Alignment";
    const classLine = npc.level !== undefined
      ? (npc.className === "0-level" ? "Class: Level 0" : `Class: Level ${npc.level} ${npc.className}, p.${npc.classPage}; class HP +${npc.classHp} (${npc.level}d${npc.classHpDie})`)
      : "";
    return [
      `${prefix}${npc.name}    ${affiliationLabel}: ${npc.faction}`,
      `Genotype: ${npc.genotypeOutput}    Occupation: ${npc.occupation}`,
      classLine,
      `Str:${npc.abilities.str} Ag:${npc.abilities.ag} Sta:${npc.abilities.sta} Per:${npc.abilities.per} Int:${npc.abilities.int} Luck:${npc.abilities.luck}`,
      `HP: ${npc.stats.hp}    AC: ${npc.stats.ac}    Birth Sign: ${npc.birthSign}`,
      `Fort: ${formatSigned(npc.stats.fort)} Ref: ${formatSigned(npc.stats.ref)} Will: ${formatSigned(npc.stats.will)}`,
      ...formatMutationLines(npc),
      `Equipment: ${npc.equipment}`
    ].filter(Boolean).join("\n");
  }

  function settlementTableForFaction(factionName) {
    return SETTLEMENT_TABLES[FACTION_SETTLEMENT_TABLE[factionName]];
  }

  function settlementDisplayType(row, tech, roll) {
    if (row.adjective === "house") {
      const adjective = chooseOne(HOUSE_ADJECTIVES_BY_TECH[tech], roll, "Settlement adjective");
      return `${adjective} ${row.type}`;
    }
    if (row.adjective === "plant") {
      const adjective = chooseOne(PLANT_SETTLEMENT_ADJECTIVES, roll, "Settlement adjective");
      return `${adjective} ${row.type}`;
    }
    return row.type;
  }

  function oceanSettlementDisplayType(type, roll, q, r) {
    const prefix = chooseOne(OCEAN_SETTLEMENT_PREFIXES, roll, `Hex ${q},${r} ocean settlement modifier`);
    return `${prefix} ${type}`;
  }

  function itemPoolsForTech(tech) {
    if (tech === 1) {
      return STARTING_EQUIPMENT;
    }
    if (tech === 2) {
      return TECH_2_ITEMS;
    }
    if (tech === 3) {
      return uniqueItems([...TECH_2_ITEMS, ...TECH_3_ITEMS]);
    }
    return TECH_4_ITEMS;
  }

  function uniqueItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = item.item || item.name;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function formatBarterItem(item) {
    const name = (item.item || item.name).toLowerCase();
    const detail = item.detail ? ` (${item.detail})` : "";
    const ammo = item.ammo ? `, plus ${item.ammo}` : "";
    const cost = item.value || item.cost || "-";
    return `${cost} - ${name}${detail}${ammo}`;
  }

  function rollAvailableItems(tech, count, roll) {
    const selected = [];
    const seen = new Set();
    let guard = 0;

    while (selected.length < count && guard < 1000) {
      guard += 1;
      const item = tech === 1
        ? rollStartingEquipmentItem(roll, "Available tech 1 item")
        : chooseOne(itemPoolsForTech(tech), roll, `Available tech ${tech} item`);
      const name = (item.item || item.name).toLowerCase();
      if (!seen.has(name)) {
        seen.add(name);
        selected.push(item);
      }
    }

    return selected;
  }

  function rollAvailableTraps(tech, count, roll) {
    const pool = TRAPS_BY_TECH[tech];
    const selected = [];
    const seen = new Set();
    let guard = 0;

    while (selected.length < count && guard < 1000) {
      guard += 1;
      const trap = chooseOne(pool, roll, `Available tech ${tech} trap`);
      if (!seen.has(trap)) {
        seen.add(trap);
        selected.push(trap);
      }
    }

    return selected;
  }

  function averageSingleHd(part) {
    const clean = part.trim();
    const diceMatch = clean.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!diceMatch) {
      return Number(clean) || 0;
    }

    const count = Number(diceMatch[1]);
    const sides = Number(diceMatch[2]);
    const modifier = Number(diceMatch[3] || 0);
    return count * ((sides + 1) / 2) + modifier;
  }

  function rollSingleHd(part, roll, label) {
    const clean = part.trim();
    const diceMatch = clean.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!diceMatch) {
      const value = Number(clean) || 0;
      return { text: `${clean} (${value} HP)`, hp: value };
    }

    const count = Number(diceMatch[1]);
    const sides = Number(diceMatch[2]);
    const modifier = Number(diceMatch[3] || 0);
    const dice = roll.dice(count, sides, label);
    const hp = Math.max(0, dice.total + modifier);
    const modifierText = modifier === 0 ? "" : (modifier > 0 ? `+${modifier}` : `${modifier}`);
    return { text: `${count}d${sides}${modifierText} (${hp} HP)`, hp };
  }

  function rollEncounterHp(encounter, roll) {
    if (encounter.hd === "0") {
      return "0 (0 HP)";
    }

    return encounter.hd
      .split("/")
      .map((part) => rollSingleHd(part, roll, `${encounter.name} HP`).text)
      .join("/");
  }

  function hdAverage(encounter) {
    if (encounter.average) {
      return encounter.average;
    }
    if (encounter.hd === "0") {
      return averageSingleHd(encounter.rarityHd || "10d10");
    }

    const parts = encounter.hd.split("/");
    const total = parts.reduce((sum, part) => sum + averageSingleHd(part), 0);
    return total / parts.length;
  }

  function encounterWeight(encounter) {
    const average = hdAverage(encounter);
    return Math.max(1, 11 - Math.ceil(average / 5.5));
  }

  function weightedEncounterPool() {
    return RANDOM_ENCOUNTERS.flatMap((encounter) => {
      const weight = encounterWeight(encounter);
      return Array.from({ length: weight }, () => encounter);
    });
  }

  function generateEncounter() {
    const log = [];
    const roll = createRoller(log);
    const encounter = generateEncounterRecord(roll);
    return { output: encounter.output, log };
  }

  function generateEncounterRecord(roll) {
    const pool = weightedEncounterPool();
    const encounterRoll = roll.die(pool.length, "Random encounter");
    const encounter = pool[encounterRoll.result - 1];
    const hpText = rollEncounterHp(encounter, roll);
    const template = ENCOUNTER_STAT_BLOCKS[encounter.name] || `${encounter.name}: HD {hdHp}.`;
    const output = template.replace("{hdHp}", hpText);

    return {
      name: encounter.name,
      output
    };
  }

  function axialKey(q, r) {
    return `${q},${r}`;
  }

  function axialDistance(q, r) {
    return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
  }

  function axialToPixel(q, r, size) {
    return {
      x: size * Math.sqrt(3) * (q + r / 2),
      y: size * 1.5 * r
    };
  }

  function pointyHexPoints(cx, cy, size) {
    const points = [];
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      points.push(`${(cx + size * Math.cos(angle)).toFixed(2)},${(cy + size * Math.sin(angle)).toFixed(2)}`);
    }
    return points.join(" ");
  }

  function hexRing(radius) {
    if (radius === 0) {
      return [{ q: 0, r: 0 }];
    }

    const results = [];
    let q = -radius;
    let r = radius;
    HEX_DIRECTIONS.forEach((direction) => {
      for (let i = 0; i < radius; i += 1) {
        results.push({ q, r });
        q += direction.q;
        r += direction.r;
      }
    });
    return results;
  }

  function hexSpiral(radius) {
    const results = [];
    for (let ring = 0; ring <= radius; ring += 1) {
      results.push(...hexRing(ring));
    }
    return results;
  }

  function sideDistance(side, q, r, radius) {
    return side.distance(q, r, radius);
  }

  function isIslandBandForSide(side, q, r, radius) {
    const distance = sideDistance(side, q, r, radius);
    return distance >= 1 && distance <= 2;
  }

  function isSurroundedByOcean(islandKeys, oceanKeys, coordKeys) {
    const islandSet = new Set(islandKeys);

    return islandKeys.every((key) => {
      const [q, r] = key.split(",").map(Number);
      return HEX_DIRECTIONS.every((direction) => {
        const neighborKey = axialKey(q + direction.q, r + direction.r);
        return coordKeys.has(neighborKey) && (islandSet.has(neighborKey) || oceanKeys.has(neighborKey));
      });
    });
  }

  function growIsland(seed, side, solidSide, terrain, oceanKeys, coordKeys, radius, roll) {
    const targetSize = roll.die(3, `Ocean ${side.key} island size`).result;
    const terrainKey = chooseWeighted(ISLAND_TERRAIN_WEIGHTS, roll, `Ocean ${side.key} island terrain`);
    const islandKeys = [axialKey(seed.q, seed.r)];

    while (islandKeys.length < targetSize) {
      const options = [];
      islandKeys.forEach((key) => {
        const [q, r] = key.split(",").map(Number);
        HEX_DIRECTIONS.forEach((direction) => {
          const next = { q: q + direction.q, r: r + direction.r };
          const nextKey = axialKey(next.q, next.r);
          if (
            !islandKeys.includes(nextKey) &&
            !options.some((option) => option.key === nextKey) &&
            terrain.get(nextKey) === "O" &&
            isIslandBandForSide(side, next.q, next.r, radius) &&
            (!solidSide || sideDistance(solidSide, next.q, next.r, radius) >= OCEAN_SIDE_BAND_DEPTH) &&
            isSurroundedByOcean([...islandKeys, nextKey], oceanKeys, coordKeys)
          ) {
            options.push({ ...next, key: nextKey });
          }
        });
      });

      if (options.length === 0) {
        break;
      }

      islandKeys.push(chooseOne(options, roll, `Ocean ${side.key} island growth`).key);
    }

    islandKeys.forEach((key) => {
      terrain.set(key, terrainKey);
      oceanKeys.delete(key);
    });

    return {
      side: side.key,
      terrain: HEX_TERRAINS[terrainKey].name,
      size: islandKeys.length
    };
  }

  function placeOceanIslands(coords, selectedSides, solidSide, terrain, oceanKeys, coordKeys, radius, roll) {
    const islands = [];

    selectedSides.forEach((side) => {
      if (solidSide && side.key === solidSide.key) {
        return;
      }

      const islandChance = roll.die(100, `Ocean ${side.key} island chance`);
      if (islandChance.result > 45) {
        return;
      }

      const candidates = coords.filter(({ q, r }) => {
        const key = axialKey(q, r);
        if (terrain.get(key) !== "O" || !isIslandBandForSide(side, q, r, radius)) {
          return false;
        }
        if (solidSide && sideDistance(solidSide, q, r, radius) < OCEAN_SIDE_BAND_DEPTH) {
          return false;
        }
        return isSurroundedByOcean([key], oceanKeys, coordKeys);
      });

      if (candidates.length === 0) {
        return;
      }

      const seed = chooseOne(candidates, roll, `Ocean ${side.key} island seed`);
      islands.push(growIsland(seed, side, solidSide, terrain, oceanKeys, coordKeys, radius, roll));
    });

    return islands;
  }

  function createOceanPlan(roll, radius) {
    const coords = hexSpiral(radius);
    const coordKeys = new Set(coords.map(({ q, r }) => axialKey(q, r)));
    const terrain = new Map();
    const oceanKeys = new Set();
    const sideCount = roll.die(3, "Ocean side count").result;
    const startIndex = roll.die(HEX_SIDES.length, "Ocean side arc start").result - 1;
    const selectedSides = Array.from({ length: sideCount }, (_value, index) => HEX_SIDES[(startIndex + index) % HEX_SIDES.length]);
    const solidSide = sideCount === 3 ? selectedSides[1] : null;

    coords.forEach(({ q, r }) => {
      const key = axialKey(q, r);
      const sideHits = selectedSides
        .map((side) => ({ side, distance: sideDistance(side, q, r, radius) }))
        .filter((hit) => hit.distance >= 0 && hit.distance < OCEAN_SIDE_BAND_DEPTH);

      if (sideHits.length === 0) {
        return;
      }

      const solidHit = solidSide && sideHits.some((hit) => hit.side.key === solidSide.key);
      const closestHit = sideHits.reduce((best, hit) => (hit.distance < best.distance ? hit : best), sideHits[0]);
      const oceanChance = OCEAN_SHORE_CHANCE_BY_DISTANCE[closestHit.distance] || 50;
      const isOcean = solidHit || roll.die(100, `Hex ${q},${r} ocean shoreline`).result <= oceanChance;

      if (isOcean) {
        terrain.set(key, "O");
        oceanKeys.add(key);
      }
    });

    const islands = placeOceanIslands(coords, selectedSides, solidSide, terrain, oceanKeys, coordKeys, radius, roll);

    return {
      terrain,
      sideCount,
      selectedSides: selectedSides.map((side) => ({ key: side.key, keypad: side.keypad })),
      solidSide: solidSide ? { key: solidSide.key, keypad: solidSide.keypad } : null,
      islands
    };
  }

  function steppedForage(forage, irradiated) {
    if (!irradiated) {
      return forage;
    }

    return forage.replace(/d\d+/, (die) => {
      const index = DICE_CHAIN.indexOf(die);
      return DICE_CHAIN[Math.min(DICE_CHAIN.length - 1, index + 1)] || die;
    });
  }

  function radiationDamageRate(total) {
    if (total >= 60) return "1 HP per year";
    if (total >= 50) return "1 HP per month";
    if (total >= 40) return "1 HP per day";
    if (total >= 30) return "1 HP per hour";
    if (total >= 20) return "1 HP per minute";
    return "1 HP per round";
  }

  function radiationFortDc(total) {
    if (total >= 50) return 6;
    if (total >= 40) return 8;
    if (total >= 30) return 10;
    if (total >= 20) return 14;
    return 16;
  }

  function rollRadiationProfile(roll, doubled) {
    const damageRoll = roll.dice(5, 10, "Radiation damage interval").total * (doubled ? 2 : 1);
    const fortRoll = roll.dice(5, 10, "Radiation Fort save").total * (doubled ? 2 : 1);
    return {
      damageRoll,
      fortRoll,
      rate: radiationDamageRate(damageRoll),
      fort: radiationFortDc(fortRoll),
      doubled
    };
  }

  function generateHexSettlementInfo(roll, q, r, terrainKey) {
    const faction = findRange(FACTIONS, roll.die(100, `Hex ${q},${r} settlement faction`).result);
    const table = settlementTableForFaction(faction.name);
    const sizeRoll = roll.die(100, `Hex ${q},${r} settlement size`);
    const settlementRow = findRange(table, sizeRoll.result);
    const tech = rollRange(settlementRow.tech[0], settlementRow.tech[1], roll, `Hex ${q},${r} settlement tech`);
    const population = rollFormula(settlementRow.population, roll, `Hex ${q},${r} settlement population`);
    const baseType = settlementDisplayType(settlementRow, tech, roll);
    const type = terrainKey === "O" ? oceanSettlementDisplayType(baseType, roll, q, r) : baseType;
    const size = population.total > 200 ? "large" : "small";
    const settlementRecord = buildSettlementRecord(roll, {
      faction,
      sizeRollValue: sizeRoll.result,
      settlementRow,
      tech,
      population,
      settlementType: type
    });

    return {
      faction: faction.name,
      tech,
      population: population.total,
      type,
      size,
      settlementIcon: `${size}-settlement-${tech}.png`,
      factionIcon: factionIconPath(faction.name, tech),
      output: settlementRecord.output
    };
  }

  function factionIconPath(factionName, tech) {
    return `${FACTION_ICON_PREFIX[factionName]}-${tech}.png`.replace("cog-", "cog");
  }

  function generateHexTerrain(q, r, map, roll) {
    const combined = {};
    HEX_DIRECTIONS.forEach((direction) => {
      const neighbor = map.get(axialKey(q + direction.q, r + direction.r));
      if (!neighbor) {
        return;
      }

      const weights = HEX_TERRAIN_WEIGHTS[neighbor.terrain];
      Object.entries(weights).forEach(([terrain, weight]) => {
        combined[terrain] = (combined[terrain] || 0) + weight;
      });
    });

    return chooseWeighted(Object.keys(combined).length ? combined : HEX_TERRAIN_WEIGHTS.G, roll, `Hex ${q},${r} terrain`);
  }

  function generateHexDetails(q, r, terrainKey, roll, forced) {
    const terrain = HEX_TERRAINS[terrainKey];
    const radiation = forced && forced.radiation !== undefined
      ? forced.radiation
      : roll.die(100, `Hex ${q},${r} radiation`).result <= terrain.radiation;
    const settlementChance = radiation ? Math.floor(terrain.settlement / 2) : terrain.settlement;
    const settlement = forced && forced.settlement !== undefined
      ? forced.settlement
      : roll.die(100, `Hex ${q},${r} settlement`).result <= settlementChance;
    const encounter = forced && forced.encounter !== undefined
      ? forced.encounter
      : roll.die(100, `Hex ${q},${r} encounter`).result <= terrain.encounter;
    const radiationProfile = radiation ? rollRadiationProfile(roll, radiation && settlement) : null;
    const settlementInfo = settlement ? generateHexSettlementInfo(roll, q, r, terrainKey) : null;
    const encounterInfo = encounter ? generateEncounterRecord(roll) : null;

    return {
      q,
      r,
      ring: axialDistance(q, r),
      terrain: terrainKey,
      terrainName: terrain.name,
      radiation,
      settlement,
      settlementChance,
      settlementInfo,
      encounter,
      encounterInfo,
      forage: steppedForage(terrain.forage, radiation),
      radiationProfile,
      explored: q === 0 && r === 0
    };
  }

  function summarizeHexMap(hexes, oceanPlan) {
    const counts = {};
    let radiation = 0;
    let settlements = 0;
    let encounters = 0;
    const radiatedSettlements = [];
    const settlementSizes = { small: 0, large: 0 };
    const factionCounts = {};

    hexes.forEach((hex) => {
      counts[hex.terrainName] = (counts[hex.terrainName] || 0) + 1;
      if (hex.radiation) radiation += 1;
      if (hex.settlement) settlements += 1;
      if (hex.encounter) encounters += 1;
      if (hex.settlementInfo) {
        settlementSizes[hex.settlementInfo.size] += 1;
        factionCounts[hex.settlementInfo.faction] = (factionCounts[hex.settlementInfo.faction] || 0) + 1;
      }
      if (hex.radiation && hex.settlement && hex.radiationProfile) {
        radiatedSettlements.push(hex);
      }
    });

    const oceanSides = oceanPlan
      ? oceanPlan.selectedSides.map((side) => `${side.key} (${side.keypad})`).join(", ")
      : "none";
    const islands = oceanPlan && oceanPlan.islands.length
      ? oceanPlan.islands.map((island) => `${island.size}-hex ${island.terrain} island on ${island.side}`)
      : ["none"];

    return [
      `Hex Map: 10 rings (${hexes.length} hexes)`,
      "Center: Grass, no radiation, settlement present",
      `Ocean sides: ${oceanSides}`,
      oceanPlan && oceanPlan.solidSide ? `Full ocean side: ${oceanPlan.solidSide.key} (${oceanPlan.solidSide.keypad})` : "Full ocean side: none",
      `Ocean islands: ${islands.join("; ")}`,
      "Hex movement: num7 NW, num9 NE, num4 W, num6 E, num1 SW, num3 SE",
      "Legend: terrain letters G/D/F/S/H/M/O/L/W/R; settlement, radiation, and encounter icons mark hex features; encounter icons appear above radiation icons when both overlap; unexplored hexes are grayed out",
      "Settlement icon schema: small-settlement-[tech] or large-settlement-[tech] with matching faction-[tech] badge overlay; large means population over 200.",
      "Radiation adds one step to the forage dice chain.",
      `Radiated hexes: ${radiation}`,
      `Settlement hexes: ${settlements}`,
      `Encounter hexes: ${encounters}`,
      `Settlement icon sizes: small ${settlementSizes.small}, large ${settlementSizes.large}`,
      "",
      "Terrain counts:",
      ...Object.entries(counts).map(([name, count]) => `${name}: ${count}`),
      "",
      "Settlement factions:",
      ...(Object.keys(factionCounts).length
        ? Object.entries(factionCounts).map(([name, count]) => `${name}: ${count}`)
        : ["none"]),
      "",
      "Radiated settlements:",
      ...(radiatedSettlements.length
        ? radiatedSettlements.map((hex) => `${hex.q},${hex.r} ${hex.terrainName}: ${hex.radiationProfile.rate}, Fort ${hex.radiationProfile.fort}`)
        : ["none"])
    ].join("\n");
  }

  function generateHexMap() {
    const log = [];
    const roll = createRoller(log);
    const map = new Map();
    const coords = hexSpiral(HEX_MAP_RADIUS);
    const oceanPlan = createOceanPlan(roll, HEX_MAP_RADIUS);

    coords.forEach(({ q, r }) => {
      const forcedTerrain = oceanPlan.terrain.get(axialKey(q, r));
      const terrain = q === 0 && r === 0 ? "G" : forcedTerrain || generateHexTerrain(q, r, map, roll);
      const forced = q === 0 && r === 0 ? { radiation: false, settlement: true, encounter: false } : {};
      map.set(axialKey(q, r), generateHexDetails(q, r, terrain, roll, forced));
    });

    const hexes = Array.from(map.values());
    return { output: summarizeHexMap(hexes, oceanPlan), log, hexes, oceanPlan };
  }

  function renderHexMap(container, metaElement, hexes, openPopup, closePopup, playerPosition) {
    container.replaceChildren();
    const size = 18;
    const margin = 26;
    const positions = hexes.map((hex, index) => ({ ...hex, index, ...axialToPixel(hex.q, hex.r, size) }));
    const minX = Math.min(...positions.map((hex) => hex.x - size));
    const maxX = Math.max(...positions.map((hex) => hex.x + size));
    const minY = Math.min(...positions.map((hex) => hex.y - size));
    const maxY = Math.max(...positions.map((hex) => hex.y + size));
    const width = maxX - minX + margin * 2;
    const height = maxY - minY + margin * 2;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    svg.setAttribute("viewBox", `0 0 ${width.toFixed(2)} ${height.toFixed(2)}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Generated ten-ring pointy-top hex map");

    positions.forEach((hex) => {
      const cx = hex.x - minX + margin;
      const cy = hex.y - minY + margin;
      const terrain = HEX_TERRAINS[hex.terrain];
      const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      const radiationText = hex.radiationProfile
        ? `; radiation ${hex.radiationProfile.rate}, Fort ${hex.radiationProfile.fort}${hex.radiationProfile.doubled ? " (radiated settlement doubled)" : ""}`
        : "";
      const settlementText = hex.settlementInfo
        ? `; settlement ${hex.settlementInfo.type}, ${hex.settlementInfo.population} pop, tech ${hex.settlementInfo.tech}, ${hex.settlementInfo.faction}`
        : "";

      polygon.setAttribute("points", pointyHexPoints(cx, cy, size));
      polygon.setAttribute("fill", terrain.color);
      polygon.setAttribute("class", `hex-tile ${hex.explored ? "explored" : "unexplored"}`);
      polygon.dataset.hexIndex = String(hex.index);
      polygon.dataset.action = "hex";
      title.textContent = `${hex.q},${hex.r}: ${hex.terrainName}; radiation ${hex.radiation ? "yes" : "no"}; settlement ${hex.settlement ? "yes" : "no"}; encounter ${hex.encounter ? "yes" : "no"}; forage ${hex.forage}${settlementText}${radiationText}`;
      polygon.appendChild(title);
      svg.appendChild(polygon);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", cx);
      label.setAttribute("y", hex.settlementInfo ? cy - 11 : cy - 4);
      label.setAttribute("class", "hex-label");
      label.textContent = hex.terrain;
      svg.appendChild(label);

      if (hex.settlementInfo) {
        const baseIcon = document.createElementNS("http://www.w3.org/2000/svg", "image");
        baseIcon.setAttribute("href", hex.settlementInfo.settlementIcon);
        baseIcon.setAttribute("x", cx - 9);
        baseIcon.setAttribute("y", cy - 8);
        baseIcon.setAttribute("width", 18);
        baseIcon.setAttribute("height", 18);
        baseIcon.setAttribute("preserveAspectRatio", "xMidYMid meet");
        baseIcon.setAttribute("opacity", hex.explored ? "1" : "0.72");
        baseIcon.setAttribute("class", "hex-click-target");
        baseIcon.dataset.hexIndex = String(hex.index);
        baseIcon.dataset.action = "settlement";
        svg.appendChild(baseIcon);

        const factionIcon = document.createElementNS("http://www.w3.org/2000/svg", "image");
        factionIcon.setAttribute("href", hex.settlementInfo.factionIcon);
        factionIcon.setAttribute("x", cx - 5.5);
        factionIcon.setAttribute("y", cy - 4.5);
        factionIcon.setAttribute("width", 11);
        factionIcon.setAttribute("height", 11);
        factionIcon.setAttribute("preserveAspectRatio", "xMidYMid meet");
        factionIcon.setAttribute("opacity", hex.explored ? "1" : "0.86");
        factionIcon.setAttribute("class", "hex-click-target");
        factionIcon.dataset.hexIndex = String(hex.index);
        factionIcon.dataset.action = "settlement";
        svg.appendChild(factionIcon);
      }

      if (hex.radiation) {
        const radiationIcon = document.createElementNS("http://www.w3.org/2000/svg", "image");
        radiationIcon.setAttribute("href", "irradiated-symbol.png");
        radiationIcon.setAttribute("x", cx + 1);
        radiationIcon.setAttribute("y", cy + 4);
        radiationIcon.setAttribute("width", 13);
        radiationIcon.setAttribute("height", 13);
        radiationIcon.setAttribute("preserveAspectRatio", "xMidYMid meet");
        radiationIcon.setAttribute("opacity", hex.explored ? "1" : "0.82");
        radiationIcon.setAttribute("class", "hex-click-target");
        radiationIcon.dataset.hexIndex = String(hex.index);
        radiationIcon.dataset.action = "radiation";
        svg.appendChild(radiationIcon);
      }

      if (hex.encounter) {
        const encounterIcon = document.createElementNS("http://www.w3.org/2000/svg", "image");
        encounterIcon.setAttribute("href", "encounter.png");
        encounterIcon.setAttribute("x", cx - 14);
        encounterIcon.setAttribute("y", cy - 14);
        encounterIcon.setAttribute("width", 13);
        encounterIcon.setAttribute("height", 13);
        encounterIcon.setAttribute("preserveAspectRatio", "xMidYMid meet");
        encounterIcon.setAttribute("opacity", hex.explored ? "1" : "0.88");
        encounterIcon.setAttribute("class", "hex-click-target");
        encounterIcon.dataset.hexIndex = String(hex.index);
        encounterIcon.dataset.action = "encounter";
        svg.appendChild(encounterIcon);
      }
    });

    if (playerPosition) {
      const playerHex = positions.find((hex) => hex.q === playerPosition.q && hex.r === playerPosition.r);
      if (playerHex) {
        const cx = playerHex.x - minX + margin;
        const cy = playerHex.y - minY + margin;
        const playerIcon = document.createElementNS("http://www.w3.org/2000/svg", "image");
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        playerIcon.setAttribute("href", "player.png");
        playerIcon.setAttribute("x", cx - 11);
        playerIcon.setAttribute("y", cy - 20);
        playerIcon.setAttribute("width", 22);
        playerIcon.setAttribute("height", 22);
        playerIcon.setAttribute("preserveAspectRatio", "xMidYMid meet");
        playerIcon.setAttribute("class", "hex-click-target");
        playerIcon.dataset.hexIndex = String(playerHex.index);
        playerIcon.dataset.action = "hex";
        title.textContent = `Player: ${playerHex.q},${playerHex.r}`;
        playerIcon.appendChild(title);
        svg.appendChild(playerIcon);
      }
    }

    if (openPopup) {
      svg.addEventListener("click", (event) => {
        const target = event.target.closest ? event.target.closest("[data-hex-index]") : null;
        if (!target) {
          if (closePopup) {
            closePopup();
          }
          return;
        }
        const hex = hexes[Number(target.dataset.hexIndex)];
        openPopup(hex, target.dataset.action || "hex");
      });
    }

    container.appendChild(svg);
    if (metaElement) {
      const playerText = playerPosition ? ` - player ${playerPosition.q},${playerPosition.r}` : "";
      metaElement.textContent = `${hexes.length} hexes${playerText} - num7 NW, num9 NE, num4 W, num6 E, num1 SW, num3 SE`;
    }
  }

  function radiationInterval(profile) {
    return profile.rate.replace(/^1 HP per /, "");
  }

  function hexPopupContent(hex, action) {
    if (action === "settlement" && hex.settlementInfo) {
      return {
        title: `${hex.q},${hex.r} Settlement`,
        body: hex.settlementInfo.output
      };
    }

    if (action === "encounter" && hex.encounterInfo) {
      return {
        title: `${hex.q},${hex.r} Encounter`,
        body: hex.encounterInfo.output
      };
    }

    if (action === "radiation" && hex.radiationProfile) {
      return {
        title: `${hex.q},${hex.r} Radiation`,
        body: `Fort: DC ${hex.radiationProfile.fort} per ${radiationInterval(hex.radiationProfile)} or suffer 1 damage.`
      };
    }

    return {
      title: `${hex.q},${hex.r} ${hex.terrainName}`,
      body: [
        `Terrain: ${hex.terrainName}`,
        `Coordinates: ${hex.q},${hex.r}`,
        `Ring: ${hex.ring}`,
        `Forage: ${hex.forage}`,
        `Radiation: ${hex.radiation ? "Yes" : "No"}`,
        `Settlement: ${hex.settlementInfo ? `${hex.settlementInfo.type}, ${hex.settlementInfo.population} pop, tech ${hex.settlementInfo.tech}, ${hex.settlementInfo.faction}` : "No"}`,
        `Encounter: ${hex.encounterInfo ? hex.encounterInfo.name : "No"}`,
        hex.radiationProfile ? `Radiation Save: Fort DC ${hex.radiationProfile.fort} per ${radiationInterval(hex.radiationProfile)} or suffer 1 damage.` : ""
      ].filter(Boolean).join("\n")
    };
  }

  function movementDirectionFromEvent(event) {
    const key = event.key;
    const code = event.code;
    const directionKey = {
      7: "NW",
      9: "NE",
      4: "W",
      6: "E",
      1: "SW",
      3: "SE",
      Digit7: "NW",
      Digit9: "NE",
      Digit4: "W",
      Digit6: "E",
      Digit1: "SW",
      Digit3: "SE",
      Numpad7: "NW",
      Numpad9: "NE",
      Numpad4: "W",
      Numpad6: "E",
      Numpad1: "SW",
      Numpad3: "SE",
      Home: "NW",
      PageUp: "NE",
      ArrowLeft: "W",
      ArrowRight: "E",
      End: "SW",
      PageDown: "SE"
    }[code] || {
      7: "NW",
      9: "NE",
      4: "W",
      6: "E",
      1: "SW",
      3: "SE",
      Home: "NW",
      PageUp: "NE",
      ArrowLeft: "W",
      ArrowRight: "E",
      End: "SW",
      PageDown: "SE"
    }[key];

    return HEX_DIRECTIONS.find((direction) => direction.key === directionKey) || null;
  }

  function hyphenChance(name) {
    if (!/^[A-Za-z]+$/.test(name)) {
      return 0;
    }
    if (name.length <= 3) {
      return 75;
    }
    if (name.length <= 5) {
      return 50;
    }
    return 0;
  }

  function rollNickname(roll) {
    const nicknameRoll = roll.die(ALL_NPC_NICKNAMES.length, "NPC nickname");
    const parts = [ALL_NPC_NICKNAMES[nicknameRoll.result - 1]];

    while (parts.length <= 4) {
      const previous = parts[parts.length - 1];
      const chance = hyphenChance(previous);
      if (chance === 0) {
        break;
      }

      const chanceRoll = roll.die(100, `Hyphen chance after ${previous}`);
      if (chanceRoll.result > chance) {
        break;
      }

      const availableSegments = HYPHEN_SEGMENTS.filter((name) => !parts.includes(name));
      const segmentRoll = roll.die(availableSegments.length, "Hyphen name segment");
      parts.push(availableSegments[segmentRoll.result - 1]);
    }

    return parts.join("-");
  }

  function joinFeatures(features) {
    const clean = features.filter(Boolean);
    if (clean.length === 0) {
      return "";
    }
    if (clean.length === 1) {
      return clean[0];
    }
    if (clean.length === 2) {
      return `${clean[0]} and ${clean[1]}`;
    }
    return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
  }

  function generateNpc() {
    const log = [];
    const roll = createRoller(log);
    const output = formatNpcRecord(generateNpcRecord(roll));
    return { output, log };
  }

  function chooseSettlementNpc(roll, role, settlementFaction, settings) {
    const options = settings || {};
    const genotypes = options.genotypes || settlementFaction.genotypes;
    const genotypeKind = chooseOne(genotypes, roll, `${role} genotype`);
    let faction = options.faction || settlementFaction.name;

    if (options.factionFromGenotype) {
      const availableFactions = factionsForGenotype(genotypeKind)
        .filter((candidate) => !options.excludeFactions || !options.excludeFactions.includes(candidate.name))
        .filter((candidate) => !options.differentFrom || candidate.name !== options.differentFrom);
      faction = chooseOne(availableFactions, roll, `${role} faction`).name;
    }

    return generateNpcRecord(roll, {
      role,
      genotypeKind,
      faction,
      abilityPredicate: options.abilityPredicate,
      level: options.level
    });
  }

  function settlementNpcPairs(settlementFaction, excludeFactions) {
    const pairs = [];
    settlementFaction.genotypes.forEach((genotypeKind) => {
      factionsForGenotype(genotypeKind).forEach((faction) => {
        if (!excludeFactions || !excludeFactions.includes(faction.name)) {
          pairs.push({ genotypeKind, faction });
        }
      });
    });
    return pairs;
  }

  function chooseSettlementPair(roll, label, settlementFaction, excludeFactions) {
    return chooseOne(settlementNpcPairs(settlementFaction, excludeFactions), roll, label);
  }

  function buildSettlementRecord(roll, options) {
    const settings = options || {};
    const sizeRollValue = settings.sizeRollValue || roll.die(100, "Settlement size").result;
    const faction = settings.faction || findRange(FACTIONS, roll.die(100, "Settlement faction").result);
    const table = settlementTableForFaction(faction.name);
    const settlementRow = settings.settlementRow || findRange(table, sizeRollValue);
    const settlementIndex = table.indexOf(settlementRow) + 1;
    const tech = settings.tech || rollRange(settlementRow.tech[0], settlementRow.tech[1], roll, "Settlement tech");
    const population = settings.population || rollFormula(settlementRow.population, roll, "Settlement population");
    const settlementType = settings.settlementType || settlementDisplayType(settlementRow, tech, roll);
    const availableItems = rollAvailableItems(tech, settlementIndex, roll);
    const availableTraps = rollAvailableTraps(tech, settlementIndex, roll);
    const leaderGenotype = chooseOne(faction.genotypes, roll, "Settlement leader genotype");
    const leaderLevel = rollSettlementLeaderLevel(settlementIndex, roll, "Settlement Leader");
    const leader = generateNpcRecord(roll, {
      role: "Settlement Leader",
      genotypeKind: leaderGenotype,
      faction: faction.name,
      abilityPredicate: (abilities) => isPrimeHighest(abilities, faction.prime),
      level: leaderLevel
    });

    const lines = [
      `Settlement: ${settlementType}    Faction: ${faction.name}`,
      `Population: ${population.total}    Tech: ${tech} - ${TECH_LABELS[tech]}`,
      "",
      "Available items for barter:",
      ...availableItems.map((item) => `- ${formatBarterItem(item)}`),
      "",
      "Traps available:",
      ...availableTraps.map((trap) => `- ${trap}`),
      "",
      formatNpcRecord(leader, "Settlement Leader")
    ];

    if (sizeRollValue >= 77) {
      const rebel = chooseSettlementNpc(roll, "Rebel Leader", faction, {
        factionFromGenotype: true,
        differentFrom: faction.name,
        abilityPredicate: (abilities) => socialSum(abilities) > physicalSum(abilities),
        level: rollSettlementLeaderLevel(settlementIndex, roll, "Rebel Leader")
      });
      const militaryRole = faction.name === "Holy Medicinal Order" ? "High Priest" : "Military Leader";
      const military = chooseSettlementNpc(roll, militaryRole, faction, {
        faction: faction.name,
        abilityPredicate: faction.name === "Holy Medicinal Order"
          ? (abilities) => combatSum(abilities) < mentalSum(abilities)
          : (abilities) => combatSum(abilities) > mentalSum(abilities),
        level: rollSettlementLeaderLevel(settlementIndex, roll, militaryRole)
      });
      const civicPair = chooseSettlementPair(roll, "Civic Leader faction", faction);
      const civic = generateNpcRecord(roll, {
        role: "Civic Leader",
        genotypeKind: civicPair.genotypeKind,
        faction: civicPair.faction.name,
        abilityPredicate: (abilities) => combatSum(abilities) < mentalSum(abilities),
        level: rollSettlementLeaderLevel(settlementIndex, roll, "Civic Leader")
      });
      const criminalPair = chooseSettlementPair(roll, "Criminal Leader faction", faction, ["Holy Medicinal Order"]);
      const criminal = generateNpcRecord(roll, {
        role: "Criminal Leader",
        genotypeKind: criminalPair.genotypeKind,
        faction: criminalPair.faction.name,
        abilityPredicate: (abilities) => socialSum(abilities) > physicalSum(abilities),
        level: rollSettlementLeaderLevel(settlementIndex, roll, "Criminal Leader")
      });

      lines.push(
        "",
        formatNpcRecord(rebel, "Rebel Leader"),
        "",
        formatNpcRecord(military, militaryRole),
        "",
        formatNpcRecord(civic, "Civic Leader"),
        "",
        formatNpcRecord(criminal, "Criminal Leader")
      );
    }

    return {
      faction,
      tech,
      population: population.total,
      settlementType,
      settlementIndex,
      output: lines.join("\n")
    };
  }

  function generateSettlement() {
    const log = [];
    const roll = createRoller(log);
    const settlement = buildSettlementRecord(roll);
    return { output: settlement.output, log };
  }

  const LEADER_BLOCK_PATTERN = /^(Settlement Leader|Rebel Leader|Military Leader|High Priest|Civic Leader|Criminal Leader): /gm;

  function leaderDisplayKind(role) {
    if (role === "High Priest") {
      return "High Priest";
    }
    return role.replace(/ Leader$/, "");
  }

  function parseLeaderBlock(block) {
    const lines = block.split("\n");
    const header = lines[0] || "";
    const headerMatch = header.match(/^(.*?):\s+(.+?)(?:\s{2,}|$)/);
    const genotypeLine = lines.find((line) => line.startsWith("Genotype: ")) || "";
    const genotypeMatch = genotypeLine.match(/^Genotype:\s+(.+?)(?:\s{2,}Occupation:|$)/);
    const role = headerMatch ? headerMatch[1] : "Leader";

    return {
      role,
      kind: leaderDisplayKind(role),
      name: headerMatch ? headerMatch[2].trim() : "Unknown",
      genotype: genotypeMatch ? genotypeMatch[1].trim() : "Unknown genotype",
      text: block.trim()
    };
  }

  function parseSettlementOutput(outputText) {
    const matches = [...outputText.matchAll(LEADER_BLOCK_PATTERN)];
    if (matches.length === 0) {
      return { summary: outputText.trim(), leaders: [] };
    }

    return {
      summary: outputText.slice(0, matches[0].index).trim(),
      leaders: matches.map((match, index) => {
        const start = match.index;
        const end = index + 1 < matches.length ? matches[index + 1].index : outputText.length;
        return parseLeaderBlock(outputText.slice(start, end));
      })
    };
  }

  function renderSettlementOutput(container, outputText) {
    const parsed = parseSettlementOutput(outputText);
    container.replaceChildren();

    if (parsed.summary) {
      const summary = document.createElement("pre");
      summary.className = "settlement-summary";
      summary.textContent = parsed.summary;
      container.appendChild(summary);
    }

    parsed.leaders.forEach((leader) => {
      const details = document.createElement("details");
      details.className = "leader-detail";

      const summary = document.createElement("summary");
      const kind = document.createElement("span");
      const name = document.createElement("span");
      const genotype = document.createElement("span");
      kind.className = "leader-kind";
      name.className = "leader-name";
      genotype.className = "leader-genotype";
      kind.textContent = leader.kind;
      name.textContent = leader.name;
      genotype.textContent = leader.genotype;
      summary.append(kind, name, genotype);

      const body = document.createElement("pre");
      body.textContent = leader.text;
      details.append(summary, body);
      container.appendChild(details);
    });
  }

  function renderLog(logElement, log) {
    logElement.replaceChildren();
    log.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      logElement.appendChild(li);
    });
  }

  function addHistory(historyElement, output) {
    const li = document.createElement("li");
    const lines = output.split("\n").filter(Boolean);
    li.textContent = lines.slice(0, 2).join(" - ");
    historyElement.prepend(li);

    while (historyElement.children.length > 8) {
      historyElement.lastElementChild.remove();
    }
  }

  function init() {
    const generateButton = document.getElementById("generateNpc");
    const settlementButton = document.getElementById("generateSettlement");
    const encounterButton = document.getElementById("generateEncounter");
    const hexMapButton = document.getElementById("generateHexMap");
    const copyButton = document.getElementById("copyOutput");
    const output = document.getElementById("npcOutput");
    const logElement = document.getElementById("rollLog");
    const historyElement = document.getElementById("historyList");
    const hexMapPanel = document.getElementById("hexMapPanel");
    const hexMapElement = document.getElementById("hexMap");
    const hexMapMeta = document.getElementById("hexMapMeta");
    const closeHexMap = document.getElementById("closeHexMap");
    const hexPopup = document.getElementById("hexPopup");
    const hexPopupBackdrop = document.getElementById("hexPopupBackdrop");
    const closeHexPopup = document.getElementById("closeHexPopup");
    const hexPopupTitle = document.getElementById("hexPopupTitle");
    const hexPopupBody = document.getElementById("hexPopupBody");
    const richOutput = document.getElementById("richOutput");
    const hexPopupRich = document.getElementById("hexPopupRich");
    let currentHexMap = null;
    let playerPosition = null;

    function currentHexAt(q, r) {
      return currentHexMap
        ? currentHexMap.hexes.find((hex) => hex.q === q && hex.r === r)
        : null;
    }

    function renderCurrentHexMap() {
      if (!currentHexMap) {
        return;
      }
      renderHexMap(hexMapElement, hexMapMeta, currentHexMap.hexes, openPopup, closePopup, playerPosition);
    }

    function movePlayer(direction) {
      if (!currentHexMap || !playerPosition) {
        return false;
      }

      const next = {
        q: playerPosition.q + direction.q,
        r: playerPosition.r + direction.r
      };
      const nextHex = currentHexAt(next.q, next.r);
      if (!nextHex) {
        return false;
      }

      playerPosition = next;
      nextHex.explored = true;
      closePopup();
      renderCurrentHexMap();
      return true;
    }

    function closePopup() {
      hexPopup.removeAttribute("open");
      hexPopupBackdrop.hidden = true;
      hexPopupBody.hidden = false;
      hexPopupRich.hidden = true;
      hexPopupRich.replaceChildren();
    }

    function openPopup(hex, action) {
      const content = hexPopupContent(hex, action);
      hexPopupTitle.textContent = content.title;
      if (action === "settlement" && hex.settlementInfo) {
        hexPopupBody.hidden = true;
        hexPopupBody.textContent = "";
        hexPopupRich.hidden = false;
        renderSettlementOutput(hexPopupRich, content.body);
      } else {
        hexPopupRich.hidden = true;
        hexPopupRich.replaceChildren();
        hexPopupBody.hidden = false;
        hexPopupBody.textContent = content.body;
      }
      hexPopupBackdrop.hidden = false;
      hexPopup.setAttribute("open", "");
    }

    function showPlainOutput(text) {
      output.value = text;
      output.hidden = false;
      richOutput.hidden = true;
      richOutput.replaceChildren();
    }

    function showSettlementOutput(text) {
      output.value = text;
      output.hidden = true;
      richOutput.hidden = false;
      renderSettlementOutput(richOutput, text);
    }

    function hideHexMap() {
      closePopup();
      hexMapPanel.hidden = true;
      hexMapPanel.classList.remove("fullscreen");
      hexMapElement.replaceChildren();
      currentHexMap = null;
      playerPosition = null;
    }

    function runGenerator() {
      hideHexMap();
      const npc = generateNpc();
      showPlainOutput(npc.output);
      renderLog(logElement, npc.log);
      addHistory(historyElement, npc.output);
    }

    generateButton.addEventListener("click", runGenerator);
    settlementButton.addEventListener("click", () => {
      hideHexMap();
      const settlement = generateSettlement();
      showSettlementOutput(settlement.output);
      renderLog(logElement, settlement.log);
      addHistory(historyElement, settlement.output);
    });
    encounterButton.addEventListener("click", () => {
      hideHexMap();
      const encounter = generateEncounter();
      showPlainOutput(encounter.output);
      renderLog(logElement, encounter.log);
      addHistory(historyElement, encounter.output);
    });
    hexMapButton.addEventListener("click", () => {
      const hexMap = generateHexMap();
      currentHexMap = hexMap;
      playerPosition = { q: 0, r: 0 };
      currentHexAt(0, 0).explored = true;
      showPlainOutput(hexMap.output);
      renderLog(logElement, [
        `Generated ${hexMap.hexes.length} hexes.`,
        `Pre-rolled ${hexMap.hexes.filter((hex) => hex.settlementInfo).length} settlements.`,
        `Pre-rolled ${hexMap.hexes.filter((hex) => hex.encounterInfo).length} encounters.`,
        `Stored ${hexMap.log.length} internal roll events.`
      ]);
      renderCurrentHexMap();
      hexMapPanel.hidden = false;
      hexMapPanel.classList.add("fullscreen");
      addHistory(historyElement, hexMap.output);
    });
    closeHexMap.addEventListener("click", hideHexMap);
    closeHexPopup.addEventListener("click", closePopup);
    hexPopupBackdrop.addEventListener("click", closePopup);
    document.addEventListener("keydown", (event) => {
      if (hexMapPanel.hidden || !currentHexMap) {
        return;
      }

      const direction = movementDirectionFromEvent(event);
      if (!direction) {
        return;
      }

      event.preventDefault();
      movePlayer(direction);
    });
    copyButton.addEventListener("click", async () => {
      if (!output.value) {
        return;
      }

      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
          throw new Error("Clipboard API unavailable.");
        }
        await navigator.clipboard.writeText(output.value);
      } catch (_error) {
        const wasHidden = output.hidden;
        try {
          output.hidden = false;
          output.focus();
          output.select();
          document.execCommand("copy");
        } finally {
          output.hidden = wasHidden;
        }
      }

      copyButton.classList.add("copy-flash");
      window.setTimeout(() => copyButton.classList.remove("copy-flash"), 650);
    });

    runGenerator();
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", init);
  }

  if (typeof module !== "undefined") {
    module.exports = {
      generateNpc,
      generateSettlement,
      generateEncounter,
      generateHexMap,
      rollMutantAppearance,
      rollSubtype,
      rollNickname,
      generateNpcRecord,
      hdAverage,
      encounterWeight,
      renderHexMap,
      parseSettlementOutput,
      tables: {
        TABLE_1_5,
        MUTANT_APPEARANCE,
        MANIMAL_SUBTYPE,
        PLANTIENT_SUBTYPE,
        NPC_NICKNAMES: ALL_NPC_NICKNAMES,
        HYPHEN_SEGMENTS,
        FACTIONS,
        SETTLEMENT_TABLES,
        CLASS_DEFINITIONS,
        MUTATION_TABLE,
        MEGA_MUTATION_TABLE,
        MUTATION_DETAILS,
        STARTING_EQUIPMENT,
        TECH_2_ITEMS,
        TECH_3_ITEMS,
        TECH_4_ITEMS,
        TRAPS_BY_TECH,
        RANDOM_ENCOUNTERS,
        HEX_TERRAINS,
        HEX_TERRAIN_WEIGHTS,
        HEX_DIRECTIONS,
        HEX_SIDES,
        OCEAN_SETTLEMENT_PREFIXES
      }
    };
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
