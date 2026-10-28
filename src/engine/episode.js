// Episode builder (Step C + PART 1B): turns a scripted episode from
// content/episodes.json into expedition-shaped state. Story scenes become
// "story" rooms carrying approach choices; combat scenes reuse the combat engine.
import { getContent } from "./content.js";

export function buildEpisodeExpedition(episode) {
  const monsters = getContent().monsters;
  const byId = new Map(monsters.map((m) => [m.id, m]));

  const rooms = episode.scenes.map((sc) => {
    if (sc.kind === "combat") {
      const m = byId.get(sc.monsterId);
      return {
        id: sc.id,
        kind: "combat",
        name: sc.flavour,
        flavour: sc.flavour,
        level: sc.level || 1,
        event: {
          type: "combat",
          monsterTemplate: m,
          monsterName: m ? m.name : sc.monsterId,
          scenePrompt: sc.prompt,
          scene: { onGood: sc.onGood, onBad: sc.onBad },
        },
      };
    }
    return {
      id: sc.id,
      kind: "story",
      name: sc.flavour,
      flavour: sc.flavour,
      level: 1,
      event: {
        type: "story",
        choices: sc.choices || [],
        conditional: sc.conditional || null,
        scene: { flavour: sc.flavour },
      },
    };
  });

  return {
    seed: String(Math.floor(Math.random() * 1e9)),
    deckId: "episode:" + episode.id,
    deckName: episode.name,
    episodeId: episode.id,
    episodeName: episode.name,
    mode: "episode",
    rooms,
    current: 0,
    flags: {},
  };
}
