import { test } from "node:test";
import assert from "node:assert/strict";
import { latestOnly } from "../web/js/ui.js";

// Resolve/reject a promise from outside, to control the order in which "fetches" finish.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// Same shape as main.js loadTarget(): start a load, await the data, apply it only if no newer
// load started meanwhile; on failure keep showing what is actually loaded.
function makeLoader(fetchData) {
  const state = { loaded: null, label: null, errors: [] };
  const loads = latestOnly();
  const load = async (slug) => {
    const isCurrent = loads();
    let data;
    try { data = await fetchData(slug); } catch (e) {
      if (isCurrent()) { state.errors.push(e.message); state.label = state.loaded; }
      return;
    }
    if (!isCurrent()) return;
    state.loaded = data; state.label = data;
  };
  return { state, load };
}

test("latestOnly: only the newest ticket is current", () => {
  const next = latestOnly();
  const a = next();
  assert.equal(a(), true);
  const b = next();
  assert.equal(a(), false);
  assert.equal(b(), true);
  // independent guards do not interfere
  const other = latestOnly()();
  assert.equal(other(), true);
  assert.equal(b(), true);
});

test("target switch: a slow older response does not overwrite the newer pick", async () => {
  const pending = { "kepler-17": deferred(), "tres-2": deferred() };
  const { state, load } = makeLoader((slug) => pending[slug].promise);
  const first = load("kepler-17"); // big file, slow
  const second = load("tres-2");   // picked right after, arrives first
  pending["tres-2"].resolve("tres-2");
  await second;
  pending["kepler-17"].resolve("kepler-17");
  await first;
  assert.equal(state.loaded, "tres-2");
  assert.equal(state.label, "tres-2");
});

test("target switch: in-order responses still apply the last pick", async () => {
  const pending = { a: deferred(), b: deferred() };
  const { state, load } = makeLoader((slug) => pending[slug].promise);
  const first = load("a"), second = load("b");
  pending.a.resolve("a"); await first;
  assert.equal(state.loaded, null); // "a" was superseded before it arrived
  pending.b.resolve("b"); await second;
  assert.equal(state.loaded, "b");
});

test("target switch: a failed newest load keeps naming the target that is loaded", async () => {
  const pending = { a: deferred(), b: deferred(), c: deferred() };
  const { state, load } = makeLoader((slug) => pending[slug].promise);
  const a = load("a"); pending.a.resolve("a"); await a;
  const b = load("b"), c = load("c");
  pending.b.reject(new Error("HTTP 404")); await b; // superseded failure: silent
  pending.c.reject(new Error("HTTP 500")); await c; // newest failure: reported, label reverts
  assert.equal(state.loaded, "a");
  assert.equal(state.label, "a");
  assert.deepEqual(state.errors, ["HTTP 500"]);
});
