// Space simulation: orbits, relays, debris swarm, jamming. Owner: Bhumika. See docs/PLAN.md "Interfaces".
const todo = (n) => { throw new Error(`sim.${n} not implemented`); };
export function createWorld(scenario = "default") { todo("createWorld"); }
export function step(world, dtHours) { todo("step"); }
export function snapshot(world) { todo("snapshot"); }
export function attenuationDb(snap, nodeA, nodeB) { todo("attenuationDb"); }
export function addDebris(world, x, y, kind) { todo("addDebris"); }
