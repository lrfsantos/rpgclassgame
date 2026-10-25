// Validator tests: valid content passes; duplicate ids, missing cross-references,
// and bad enums each fail with a message naming the file/problem.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";

const ROOT = "C:/Users/luiza/Documents/protogame";
const REAL = `${ROOT}/content`;
const FIX = "C:/Users/luiza/AppData/Local/Temp/opencode/content-fixtures";
mkdirSync(FIX, { recursive: true });
for (const f of ["classes.json", "skills.json", "monsters.json", "rooms.json", "vocabulary.json", "prompts.json"]) rmSync(`${FIX}/${f}`, { force: true });

let failures = 0;
function assert(cond, msg) { if (cond) console.log("ok:", msg); else { console.error("FAIL:", msg); failures++; } }

// Stub fetch: prefer fixture file if present, else real content.
globalThis.fetch = async (url) => {
  const name = url.replace("content/", "");
  const fixPath = `${FIX}/${name}`;
  const realPath = `${REAL}/${name}`;
  let body, ok = true;
  try { body = readFileSync(fixPath, "utf8"); } catch (e) { body = readFileSync(realPath, "utf8"); }
  return { ok, status: 200, json: async () => JSON.parse(body) };
};

// Fresh loadContent per case (query-param busts the module cache).
let seq = 0;
async function freshLoad() {
  const base = ROOT.replace(/\\/g, "/");
  const mod = await import(`file:///${base}/src/engine/content.js?case=${seq++}`);
  return mod.loadContent();
}

function loadExpectError(contains, label) {
  return freshLoad().then(
    () => { console.error("FAIL: " + label + " (no error thrown)"); failures++; },
    (e) => assert(e.message.includes(contains), `${label} names "${contains}"`)
  );
}

// 1. Valid content passes.
await freshLoad();
console.log("ok: valid content loads");

// 2. Duplicate class id.
const classes = JSON.parse(readFileSync(`${REAL}/classes.json`, "utf8"));
const dup = JSON.parse(JSON.stringify(classes));
dup.classes[1].id = dup.classes[0].id;
writeFileSync(`${FIX}/classes.json`, JSON.stringify(dup));
await loadExpectError("classes.json", "duplicate class id fails");

// 3. Missing cross-reference: class references unknown skill.
const classes2 = JSON.parse(readFileSync(`${REAL}/classes.json`, "utf8"));
const bad = JSON.parse(JSON.stringify(classes2));
bad.classes[0].skillIds = ["ghost-skill-x", ...bad.classes[0].skillIds.slice(1)];
writeFileSync(`${FIX}/classes.json`, JSON.stringify(bad));
await loadExpectError("ghost-skill-x", "unknown skill cross-ref fails");

// 4. Bad enum in skills.
const skills = JSON.parse(readFileSync(`${REAL}/skills.json`, "utf8"));
const badSkill = JSON.parse(JSON.stringify(skills));
badSkill.skills[0].effect = "explode";
writeFileSync(`${FIX}/skills.json`, JSON.stringify(badSkill));
await loadExpectError("skills.json", "bad skill effect fails");
writeFileSync(`${FIX}/classes.json`, "{}"); // ensure classes.json no longer breaks other cases
writeFileSync(`${FIX}/skills.json`, "{}");

console.log(failures ? `\n${failures} FAILURES` : "\nALL VALIDATOR TESTS PASSED");
process.exitCode = failures ? 1 : 0;
