// Sidebar tabs: Network (route + events) / Detection. Sections keep running while hidden; switching fires a
// resize so main.js redraws the charts at their real size.
const side = document.querySelector("aside.side");
const cards = side ? [...side.querySelectorAll(":scope > section")] : [];
const TAB_OF = ["route", "route", "detect", "detect"]; // route card + event log share the first tab // order of the <section>s in index.html
const TABS = [["route", "Network"], ["detect", "Detection"]];
if (side && cards.length) {
  cards.forEach((c, i) => (c.dataset.tab = TAB_OF[i] || "route"));
  const bar = document.createElement("div");
  bar.className = "side-tabs"; bar.setAttribute("role", "tablist");
  for (const [id, label] of TABS) {
    const b = document.createElement("button");
    b.className = "side-tab"; b.dataset.tab = id; b.textContent = label; b.setAttribute("role", "tab");
    b.addEventListener("click", () => show(id));
    bar.append(b);
  }
  side.prepend(bar);
  function show(id) {
    cards.forEach((c) => (c.hidden = c.dataset.tab !== id));
    bar.querySelectorAll(".side-tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
    window.dispatchEvent(new Event("resize"));
  }
  window.showSideTab = show;
  show(new URLSearchParams(location.search).get("tab") || "route");
}
