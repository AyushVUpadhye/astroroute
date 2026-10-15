// Light/dark toggle for the UI chrome (top bar + sidebar). Default dark; ?light=1 or the button switches.
const btn = document.getElementById("theme-btn");
const read = () => { try { return localStorage.getItem("astroroute-theme"); } catch { return null; } };
const save = (v) => { try { localStorage.setItem("astroroute-theme", v); } catch {} };
function apply(light) {
  document.body.classList.toggle("light", light);
  if (btn) { btn.textContent = light ? "☾ Dark" : "☀ Light"; btn.setAttribute("aria-pressed", String(light)); }
}
apply(new URLSearchParams(location.search).get("light") === "1" || read() === "light");
btn?.addEventListener("click", () => { const l = !document.body.classList.contains("light"); apply(l); save(l ? "light" : "dark"); });
