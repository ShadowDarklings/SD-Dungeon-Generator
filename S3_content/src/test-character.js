export const TEST_CHARACTER = {
  name: "Inthon",
  stats: {
    STR: 9,
    DEX: 10,
    CON: 15,
    INT: 12,
    WIS: 9,
    CHA: 15
  },
  rolledStats: {
    STR: 9,
    DEX: 10,
    CON: 15,
    INT: 12,
    WIS: 9,
    CHA: 15
  },
  ancestry: "Elf",
  class: "Wizard",
  level: 1,
  levels: [
    {
      level: 1,
      talentRolledDesc: "Learn one additional wizard spell of any tier you know",
      talentRolledName: "LearnExtraSpell",
      Rolled12TalentOrTwoStatPoints: "",
      Rolled12ChosenTalentDesc: "",
      Rolled12ChosenTalentName: "",
      HitPointRoll: 4,
      stoutHitPointRoll: 0
    }
  ],
  XP: 0,
  ambitionTalentLevel: {
    level: 1,
    talentRolledDesc: "",
    talentRolledName: "",
    Rolled12TalentOrTwoStatPoints: "",
    Rolled12ChosenTalentDesc: "",
    Rolled12ChosenTalentName: "",
    HitPointRoll: 0,
    stoutHitPointRoll: 0
  },
  title: "Apprentice",
  alignment: "Lawful",
  background: "Herbalist",
  deity: "Madeera the Covenant",
  maxHitPoints: 6,
  armorClass: 10,
  gearSlotsTotal: 10,
  gearSlotsUsed: 9,
  bonuses: [
    {
      sourceType: "Ancestry",
      sourceName: "Elf",
      sourceCategory: "Ability",
      gainedAtLevel: 1,
      name: "FarSight",
      bonusName: "Plus1ToCastingSpells",
      bonusTo: "Spellcasting",
      bonusAmount: 1
    },
    {
      sourceType: "Class",
      sourceName: "Wizard",
      sourceCategory: "Ability",
      gainedAtLevel: 1,
      name: "ExtraLanguage: Wizard 1",
      bonusTo: "Languages",
      bonusName: "Merran"
    },
    {
      sourceType: "Class",
      sourceName: "Wizard",
      sourceCategory: "Ability",
      gainedAtLevel: 1,
      name: "ExtraLanguage: Wizard 2",
      bonusTo: "Languages",
      bonusName: "Orcish"
    },
    {
      sourceType: "Class",
      sourceName: "Wizard",
      sourceCategory: "Ability",
      gainedAtLevel: 1,
      name: "ExtraLanguage: Wizard 3",
      bonusTo: "Languages",
      bonusName: "Primordial"
    },
    {
      sourceType: "Class",
      sourceName: "Wizard",
      sourceCategory: "Ability",
      gainedAtLevel: 1,
      name: "ExtraLanguage: Wizard 4",
      bonusTo: "Languages",
      bonusName: "Diabolic"
    },
    {
      sourceType: "Class",
      sourceName: "Wizard",
      sourceCategory: "Ability",
      gainedAtLevel: 1,
      name: "Spell: Wizard, Tier 1, Spell 1",
      bonusTo: "Tier:1, Spell:1",
      bonusName: "Mage Armor"
    },
    {
      sourceType: "Class",
      sourceName: "Wizard",
      sourceCategory: "Ability",
      gainedAtLevel: 1,
      name: "Spell: Wizard, Tier 1, Spell 2",
      bonusTo: "Tier:1, Spell:2",
      bonusName: "Magic Missile"
    },
    {
      sourceType: "Class",
      sourceName: "Wizard",
      sourceCategory: "Ability",
      gainedAtLevel: 1,
      name: "Spell: Wizard, Tier 1, Spell 3",
      bonusTo: "Tier:1, Spell:3",
      bonusName: "Detect Magic"
    },
    {
      sourceType: "Class",
      sourceName: "Wizard",
      sourceCategory: "Talent",
      gainedAtLevel: 1,
      name: "LearnExtraSpell",
      bonusTo: "PickExtraSpell",
      bonusName: "Sleep"
    }
  ],
  goldRolled: 40,
  gold: 28,
  silver: 5,
  copper: 0,
  gear: [
    {
      instanceId: "mqidctz9",
      gearId: "w4",
      name: "Dagger",
      type: "weapon",
      quantity: 1,
      totalUnits: 1,
      slots: 1,
      cost: 1,
      currency: "gp"
    },
    {
      instanceId: "mqidctza",
      gearId: "s2",
      name: "Backpack",
      type: "sundry",
      quantity: 1,
      totalUnits: 1,
      slots: 0,
      cost: 2,
      currency: "gp"
    },
    {
      instanceId: "mqidctzb",
      gearId: "s8",
      name: "Flint and steel",
      type: "sundry",
      quantity: 2,
      totalUnits: 2,
      slots: 2,
      cost: 10,
      currency: "sp"
    },
    {
      instanceId: "mqidctzc",
      gearId: "s17",
      name: "Torch",
      type: "sundry",
      quantity: 4,
      totalUnits: 4,
      slots: 4,
      cost: 20,
      currency: "sp"
    },
    {
      instanceId: "mqidctzf",
      gearId: "s6",
      name: "Crowbar",
      type: "sundry",
      quantity: 1,
      totalUnits: 1,
      slots: 1,
      cost: 5,
      currency: "sp"
    },
    {
      instanceId: "mqidctzi",
      gearId: "s11",
      name: "Lantern",
      type: "sundry",
      quantity: 1,
      totalUnits: 1,
      slots: 1,
      cost: 5,
      currency: "gp"
    }
  ],
  treasures: [],
  magicItems: [],
  attacks: [
    "DAGGER: +0 (N), 1d4 (FIN)",
    "SPELLS: To cast a Wizard spell, roll 1d20+2 vs a DC equal to 10 + the spell's tier."
  ],
  ledger: [
    {
      goldChange: 40,
      silverChange: 0,
      copperChange: 0,
      desc: "Starting gold",
      notes: ""
    },
    {
      goldChange: -1,
      silverChange: 0,
      copperChange: 0,
      desc: "Buy Dagger",
      notes: ""
    },
    {
      goldChange: -2,
      silverChange: 0,
      copperChange: 0,
      desc: "Buy Backpack",
      notes: ""
    },
    {
      goldChange: 0,
      silverChange: -5,
      copperChange: 0,
      desc: "Buy Flint and steel",
      notes: ""
    },
    {
      goldChange: 0,
      silverChange: -5,
      copperChange: 0,
      desc: "Buy Torch",
      notes: ""
    },
    {
      goldChange: 0,
      silverChange: -5,
      copperChange: 0,
      desc: "Buy Torch",
      notes: ""
    },
    {
      goldChange: 0,
      silverChange: -5,
      copperChange: 0,
      desc: "Buy Torch",
      notes: ""
    },
    {
      goldChange: 0,
      silverChange: -5,
      copperChange: 0,
      desc: "Buy Crowbar",
      notes: ""
    },
    {
      goldChange: 0,
      silverChange: -5,
      copperChange: 0,
      desc: "Buy Torch",
      notes: ""
    },
    {
      goldChange: 0,
      silverChange: -5,
      copperChange: 0,
      desc: "Buy Flint and steel",
      notes: ""
    },
    {
      goldChange: -5,
      silverChange: 0,
      copperChange: 0,
      desc: "Buy Lantern",
      notes: ""
    }
  ],
  spellsKnown: "Detect Magic, Mage Armor, Magic Missile, Sleep",
  languages: "Common, Diabolic, Elvish, Merran, Orcish, Primordial, Sylvan",
  creationMethod: "Random 1",
  coreRulesOnly: true,
  activeSources: [
    "SD"
  ],
  edits: []
};
