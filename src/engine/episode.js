// Episode builder (Step C): turns a scripted episode from content/episodes.json
// into the same expedition-shaped state the engine already runs (rooms with
// events), so story scenes reuse the d20 + language-check machinery unchanged.
// Story scenes become challenge rooms with a scene-specific prompt + outcome;
// combat scenes become combat rooms referencing a monster from monsters.json.
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
          scene: { onGood: sc.onGood, onBad: sc.onBad, flags: sc.flags },
        },
      };
    }
    return {
      id: sc.id,
      kind: "challenge",
      name: sc.flavour,
      flavour: sc.flavour,
      level: 1,
      stat: sc.stat,
      difficulty: sc.difficulty,
      event: {
        type: "challenge",
        stat: sc.stat,
        difficulty: sc.difficulty,
        scenePrompt: sc.prompt,
        conditional: sc.conditional || null,
        scene: { onGood: sc.onGood, onBad: sc.onBad, flags: sc.flags },
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
