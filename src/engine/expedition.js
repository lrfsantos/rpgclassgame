// Random Expedition: picks a themed deck and builds an 8-10 room run.
import { Dice, newSeed } from "./rng.js";
import { getContent } from "./content.js";

export function generateExpedition() {
  const { decks, monsters, monsterNames } = getContent();
  const dice = new Dice(newSeed());

  const deck = dice.pick(decks);
  const nonBoss = deck.rooms.filter((r) => !r.boss);
  const bossTemplate = deck.rooms.find((r) => r.boss);

  const order = dice.shuffle(nonBoss);
  const roomTemplates = [...order, bossTemplate];

  const rooms = roomTemplates.map((t) => ({
    id: t.id,
    kind: t.kind,
    name: t.kind === "combat" ? t.flavour : t.flavour,
    flavour: t.flavour,
    level: t.level,
    stat: t.stat,
    difficulty: t.difficulty,
    event: buildEvent(t, deck.id, monsters, monsterNames, dice),
  }));

  return {
    seed: newSeed(),
    deckId: deck.id,
    deckName: deck.name,
    rooms,
    current: 0,
  };
}

function buildEvent(template, deckId, monsters, monsterNames, dice) {
  switch (template.kind) {
    case "combat": {
      const pool = monsters.filter((m) => m.deck === deckId && (m.boss || m.level === template.level) && !(template.boss && !m.boss));
      const m = dice.pick(pool.length ? pool : monsters.filter((x) => x.deck === deckId && !x.boss));
      const name = dice.pick(monsterNames);
      return { type: "combat", monsterTemplate: m, monsterName: name };
    }
    case "challenge":
      return { type: "challenge", stat: template.stat, difficulty: template.difficulty };
    case "trap":
      return { type: "trap", stat: template.stat, difficulty: template.difficulty };
    case "treasure":
      return { type: "treasure" };
    case "rest":
      return { type: "rest" };
    case "event":
      return { type: "event" };
    default:
      return { type: "rest" };
  }
}
