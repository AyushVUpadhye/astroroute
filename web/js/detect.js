// From-scratch BLS transit search + vetting checks. Owner: Abhijeet. See docs/PLAN.md "Interfaces".
const todo = (n) => { throw new Error(`detect.${n} not implemented`); };
export function bls(time, flux, opts = {}) { todo("bls"); }
export function fold(time, flux, period, t0) { todo("fold"); }
export function vet(time, flux, best) { todo("vet"); }
