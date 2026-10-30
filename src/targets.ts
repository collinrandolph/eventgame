// Where does a goal point? Turns a condition into the locations an actor
// would have to visit for it, from the systems' props: an `at` names a place,
// a barrier sits on a link, an item lies somewhere, a clue or fact comes from a
// known fixture, machine or person. Used to steer life-level searches (A*).

import { locationOf } from "./engine.js";
import type { Cond, State } from "./types.js";
import type { World } from "./world.js";

function lit(ref: string): string | null {
  return ref.startsWith("#") ? ref.slice(1) : null;
}

/** Locations of a thing or person, or both ends of a barrier's link. */
function placesOf(w: World, s: State, id: string): string[] {
  if (w.locations.has(id)) return [id];
  const t = w.things.get(id);
  if (t?.kind === "barrier") {
    const c = w.def.connections.find((x) => x.barrier === id);
    return c ? [c.a, c.b] : [];
  }
  const at = locationOf(s, id);
  return at ? [at] : [];
}

/** Where a clue or fact can be had: things or people whose props yield it. */
function sourcesOf(w: World, s: State, token: string): string[] {
  const out: string[] = [];
  for (const [id, t] of Object.entries(s.things)) {
    const p = t.props;
    if ([p.reveals, p.observe, p.inspect, p.yieldsClue, p.yieldsFact].includes(token)) out.push(...placesOf(w, s, id));
  }
  for (const [id, p] of Object.entries(s.people)) if (p.props.tells === token) out.push(p.location);
  return out;
}

export function goalTargets(w: World, s: State, c: Cond, self: string | null): string[] {
  const out = new Set<string>();
  const ref = (r: string) => (r === "self" || r === "actor" ? self : lit(r));
  const walk = (x: Cond): void => {
    if ("all" in x) x.all.forEach(walk);
    else if ("any" in x) x.any.forEach(walk);
    else if ("at" in x) {
      const place = ref(x.at[1]);
      if (place) out.add(place);
      const who = ref(x.at[0]);
      if (who && who !== self) placesOf(w, s, who).forEach((l) => out.add(l)); // fetch it first
    } else if ("holds" in x) {
      const item = ref(x.holds[1]);
      if (item) placesOf(w, s, item).forEach((l) => out.add(l));
    } else if ("prop" in x) {
      const id = ref(x.prop[0]);
      if (id) placesOf(w, s, id).forEach((l) => out.add(l));
    } else if ("knows" in x) sourcesOf(w, s, x.knows).forEach((l) => out.add(l));
    else if ("fact" in x) sourcesOf(w, s, x.fact).forEach((l) => out.add(l));
  };
  walk(c);
  return [...out];
}
