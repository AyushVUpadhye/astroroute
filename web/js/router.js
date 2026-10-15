// Link model + Dijkstra best path + alternate path. Owner: Chirag. See docs/PLAN.md "Interfaces".
const todo = (n) => { throw new Error(`router.${n} not implemented`); };
export function buildLinks(snap, attenuationDb, opts = {}) { todo("buildLinks"); }
export function bestPath(links, src, dst, mode = "fastest") { todo("bestPath"); }
export function alternatePath(links, src, dst, best, mode = "fastest") { todo("alternatePath"); }
