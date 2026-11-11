(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const svg = (name, attrs = {}, parent) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    if (parent) parent.appendChild(node);
    return node;
  };
  const html = (name, attrs = {}, parent) => {
    const node = document.createElement(name);
    for (const key in attrs) {
      if (key === "text") node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    }
    if (parent) parent.appendChild(node);
    return node;
  };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = matchMedia("(max-width: 720px)");
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  $("#year").textContent = String(new Date().getFullYear());

  /* ------------------------------------------------------------------ *
   * Atlas: a small invented world where every project is an island.
   * ------------------------------------------------------------------ */
  function atlas() {
    const figure = $("#atlas");
    const stage = $(".atlas-stage", figure);
    if (!figure || !stage) return;

    const PLACES = [
      { id: "codeatlas", name: "CodeAtlas", seed: 7, tint: "#dbe4cd", wide: [262, 208, 80], tall: [190, 160, 78] },
      { id: "commontime", name: "CommonTime", seed: 23, tint: "#d3dbf6", wide: [548, 112, 56], tall: [430, 262, 56] },
      { id: "coachzilla", name: "CoachZilla", seed: 41, tint: "#cfdcc6", wide: [668, 318, 62], tall: [170, 388, 62] },
      { id: "roblox", name: "Untitled Experience", seed: 58, tint: "#c3cff5", wide: [900, 150, 60], tall: [425, 500, 60] },
      { id: "about", name: "About", seed: 90, tint: "#eae3cc", wide: [1000, 338, 42], tall: [185, 612, 44] },
    ];
    const LAYOUTS = {
      wide: { w: 1120, h: 470, start: [96, 86], compass: [1052, 66], step: 80, fs: 10, sea: [236, 436] },
      tall: { w: 600, h: 720, start: [470, 76], compass: [505, 652], step: 75, fs: 15, sea: null },
    };
    const byId = Object.fromEntries(PLACES.map((p) => [p.id, p]));
    const sections = PLACES.map((p) => document.getElementById(p.id));
    const links = Object.fromEntries(
      $$(".place", stage).map((a) => [a.dataset.place, a]),
    );
    const countLabel = $(".atlas-count", figure);

    let here = "start";
    let intent = null;
    let travelling = false;
    const visited = new Set();
    let view = null; // nodes for the current layout

    // Deterministic coastline: a circle bent by a few seeded sine waves.
    function random(seed) {
      return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function coast(seed) {
      const r = random(seed);
      return {
        stretch: 1.08 + r() * 0.3,
        waves: [2, 3, 5, 8].map((k, i) => ({
          k,
          amp: [0.15, 0.11, 0.06, 0.03][i] * (0.6 + r() * 0.7),
          phase: r() * Math.PI * 2,
        })),
      };
    }
    function outline(shape, cx, cy, radius, scale = 1, detail = 1) {
      const points = [];
      const n = 44;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        let m = 1;
        for (const w of shape.waves)
          m += w.amp * Math.sin(w.k * a + w.phase) * (w.k > 3 ? detail : 1);
        points.push([
          cx + Math.cos(a) * radius * scale * m * shape.stretch,
          cy + (Math.sin(a) * radius * scale * m) / Math.sqrt(shape.stretch),
        ]);
      }
      return points;
    }
    function smooth(points) {
      const n = points.length;
      const f = (v) => v.toFixed(1);
      let d = `M${f(points[0][0])} ${f(points[0][1])}`;
      for (let i = 0; i < n; i++) {
        const p0 = points[(i - 1 + n) % n];
        const p1 = points[i];
        const p2 = points[(i + 1) % n];
        const p3 = points[(i + 2) % n];
        d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(
          p2[0] - (p3[0] - p1[0]) / 6,
        )} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
      }
      return d + "Z";
    }
    function curve(a, b) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const bend = 0.16;
      const cx = (a[0] + b[0]) / 2 - dy * bend;
      const cy = (a[1] + b[1]) / 2 + dx * bend;
      return `M${a[0]} ${a[1]}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b[0]} ${b[1]}`;
    }
    function coords(id) {
      const [x, y] = byId[id].wide;
      const lon = Math.round((x / LAYOUTS.wide.w - 0.5) * 200);
      const lat = Math.round((0.5 - y / LAYOUTS.wide.h) * 100);
      return `${Math.abs(lat)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon)}°${lon >= 0 ? "E" : "W"}`;
    }
    const position = (id, key) =>
      id === "start" ? LAYOUTS[key].start : byId[id][key].slice(0, 2);

    function draw() {
      const key = narrow.matches ? "tall" : "wide";
      const L = LAYOUTS[key];
      if (view) view.root.remove();
      stage.classList.add("is-live");
      stage.style.aspectRatio = `${L.w} / ${L.h}`;

      const root = svg("svg", {
        viewBox: `0 0 ${L.w} ${L.h}`,
        "aria-hidden": "true",
        class: "atlas-map",
      });
      stage.prepend(root);

      // Sea and graticule
      const grid = svg("g", { class: "atlas-grid" }, root);
      for (let x = L.step; x < L.w; x += L.step) {
        svg("path", { d: `M${x} 0V${L.h}` }, grid);
        const lon = Math.round((x / L.w - 0.5) * 200);
        const label = svg("text", { x: x + 4, y: L.fs + 4, "font-size": L.fs }, grid);
        label.textContent = `${Math.abs(lon)}°${lon > 0 ? "E" : lon < 0 ? "W" : ""}`;
      }
      for (let y = L.step; y < L.h; y += L.step) {
        svg("path", { d: `M0 ${y}H${L.w}` }, grid);
        const lat = Math.round((0.5 - y / L.h) * 100);
        const label = svg("text", { x: 6, y: y - 5, "font-size": L.fs }, grid);
        label.textContent = `${Math.abs(lat)}°${lat >= 0 ? "N" : "S"}`;
      }
      if (L.sea) {
        const sea = svg(
          "text",
          { x: L.sea[0], y: L.sea[1], class: "atlas-sea", "font-size": L.fs + 3 },
          root,
        );
        sea.textContent = "OPEN SOURCE SEA";
      }

      // Suggested itinerary
      const stops = ["start", ...PLACES.map((p) => p.id)].map((id) => position(id, key));
      const itinerary = svg("g", { class: "atlas-itinerary" }, root);
      for (let i = 0; i < stops.length - 1; i++)
        svg("path", { d: curve(stops[i], stops[i + 1]) }, itinerary);

      // Compass
      const [cx, cy] = L.compass;
      const s = key === "tall" ? 1.5 : 1;
      const compass = svg(
        "g",
        { class: "atlas-compass", transform: `translate(${cx} ${cy}) scale(${s})` },
        root,
      );
      svg("circle", { r: 24 }, compass);
      svg("path", { d: "M0 -30V30M-30 0H30", class: "thin" }, compass);
      svg("path", { d: "M0 -22L5 0L0 22L-5 0Z" }, compass);
      svg("path", { d: "M0 -22L5 0H-5Z", class: "north" }, compass);
      svg("text", { y: -34, "text-anchor": "middle", "font-size": 10 }, compass).textContent = "N";

      // Islands
      const islands = {};
      const labelY = {};
      PLACES.forEach((place, index) => {
        const [x, y, r] = place[key];
        const shape = coast(place.seed);
        const shore = outline(shape, x, y, r);
        const d = smooth(shore);
        const group = svg("g", { class: "island", "data-place": place.id }, root);
        svg("path", { d, class: "shallows" }, group);
        svg("path", { d, class: "shelf" }, group);
        svg("path", { d, class: "land", fill: place.tint }, group);
        svg("path", { d: smooth(outline(shape, x - r * 0.04, y - r * 0.03, r, 0.66, 0.6)), class: "contour" }, group);
        svg("path", { d: smooth(outline(shape, x - r * 0.08, y - r * 0.06, r, 0.34, 0.3)), class: "contour" }, group);
        svg("circle", { cx: x, cy: y, r: key === "tall" ? 19 : 13, class: "pin-ring" }, group);
        svg("circle", { cx: x, cy: y, r: key === "tall" ? 13 : 9.5, class: "pin" }, group);
        const number = svg(
          "text",
          { x, y: y + (key === "tall" ? 4.5 : 3.2), "text-anchor": "middle", "font-size": key === "tall" ? 13 : 9, class: "pin-number" },
          group,
        );
        number.textContent = String(index + 1).padStart(2, "0");
        islands[place.id] = group;
        labelY[place.id] = Math.max(...shore.map((p) => p[1]));

        group.addEventListener("click", () => go(place.id));
        group.addEventListener("pointerenter", () => preview(place.id));
        group.addEventListener("pointerleave", () => preview(null));
      });

      // Start marker, live route, and traveller
      const [sx, sy] = L.start;
      const start = svg("g", { class: "atlas-start" }, root);
      svg("path", { d: `M${sx} ${sy - 7}L${sx + 7} ${sy}L${sx} ${sy + 7}L${sx - 7} ${sy}Z` }, start);
      svg("text", { x: sx + 14, y: sy + L.fs * 0.35, "font-size": L.fs + 1 }, start).textContent = "START";
      const route = svg("path", { class: "atlas-route" }, root);
      const traveller = svg("circle", { r: key === "tall" ? 8 : 5.5, class: "atlas-traveller" }, root);

      // HTML labels sit under each island so text stays crisp at any size.
      PLACES.forEach((place) => {
        const link = links[place.id];
        if (!link) return;
        link.style.left = `${(place[key][0] / L.w) * 100}%`;
        link.style.top = `${((labelY[place.id] + (key === "tall" ? 12 : 8)) / L.h) * 100}%`;
      });

      view = { key, root, islands, route, traveller };
      update();
    }

    function update() {
      if (!view) return;
      for (const place of PLACES) {
        const island = view.islands[place.id];
        island.classList.toggle("is-here", here === place.id);
        island.classList.toggle("is-visited", visited.has(place.id));
        links[place.id]?.classList.toggle("is-here", here === place.id);
        if (here === place.id) links[place.id]?.setAttribute("aria-current", "location");
        else links[place.id]?.removeAttribute("aria-current");
      }
      view.root.classList.toggle("at-start", here === "start");
      if (!travelling) {
        const [x, y] = position(here, view.key);
        view.traveller.setAttribute("cx", x);
        view.traveller.setAttribute("cy", y);
        view.traveller.classList.toggle("is-parked", here !== "start");
      }
      const seen = visited.size;
      countLabel.textContent =
        seen === 0
          ? "Five places to explore"
          : seen === PLACES.length
            ? "All five places explored"
            : `${seen} of ${PLACES.length} places explored`;
      locator.update();
    }

    function preview(id) {
      if (!view) return;
      for (const key in view.islands)
        view.islands[key].classList.toggle("is-hover", key === id);
      if (travelling) return;
      if (!id || id === here) {
        view.route.removeAttribute("d");
        return;
      }
      view.route.setAttribute("d", curve(position(here, view.key), position(id, view.key)));
      view.route.classList.remove("is-active");
    }

    function arrive(id) {
      travelling = false;
      here = id;
      intent = id;
      visited.add(id);
      view.route.removeAttribute("d");
      update();
      const target = document.getElementById(id);
      history.pushState(null, "", `#${id}`);
      target.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth", block: "start" });
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }

    function go(id) {
      if (travelling || !view) return;
      if (id === here || reduceMotion.matches) return arrive(id);
      travelling = true;
      const { route, traveller } = view;
      route.setAttribute("d", curve(position(here, view.key), position(id, view.key)));
      route.classList.add("is-active");
      traveller.classList.remove("is-parked");
      const length = route.getTotalLength();
      const duration = Math.min(900, 380 + length * 1.1);
      const began = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - began) / duration);
        const point = route.getPointAtLength(length * ease(t));
        traveller.setAttribute("cx", point.x);
        traveller.setAttribute("cy", point.y);
        if (t < 1) requestAnimationFrame(frame);
        else arrive(id);
      };
      requestAnimationFrame(frame);
    }

    for (const place of PLACES) {
      const link = links[place.id];
      if (!link) continue;
      link.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        go(place.id);
      });
      link.addEventListener("pointerenter", () => preview(place.id));
      link.addEventListener("pointerleave", () => preview(null));
      link.addEventListener("focus", () => preview(place.id));
      link.addEventListener("blur", () => preview(null));
      for (const node of $$(`[data-coords="${place.id}"]`)) node.textContent = coords(place.id);
    }

    // Floating locator: shows where you are once the map scrolls away.
    const locator = (() => {
      const node = html("a", { class: "locator", href: "#atlas", hidden: "" }, document.body);
      const W = LAYOUTS.wide;
      const mini = svg("svg", { viewBox: `0 0 ${W.w} ${W.h}`, "aria-hidden": "true" }, node);
      const dots = {};
      for (const place of PLACES) {
        const [x, y, r] = place.wide;
        dots[place.id] = svg("path", { d: smooth(outline(coast(place.seed), x, y, r * 1.25)) }, mini);
      }
      const text = html("span", {}, node);
      const name = html("b", {}, text);
      const where = html("small", {}, text);
      html("i", { text: "Map ↑", "aria-hidden": "true" }, node);
      let offMap = false;
      new IntersectionObserver(([entry]) => {
        offMap = !entry.isIntersecting;
        refresh();
      }).observe(figure);
      function refresh() {
        const show = offMap && here !== "start";
        node.hidden = !show;
        if (!show) return;
        for (const id in dots) dots[id].classList.toggle("is-here", id === here);
        name.textContent = byId[here].name;
        where.textContent = coords(here);
        node.setAttribute("aria-label", `You are at ${byId[here].name}. Back to the atlas map.`);
      }
      return { update: refresh };
    })();

    // Keep "you are here" in step with ordinary scrolling.
    let ticking = false;
    function track() {
      ticking = false;
      if (travelling) return;
      const line = innerHeight * 0.35;
      const rects = sections.map((s) => s.getBoundingClientRect());
      let hits = PLACES.filter((_, i) => rects[i].top <= line && rects[i].bottom > line);
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2)
        hits = [PLACES[PLACES.length - 1]];
      if (!hits.length) return;
      const ids = hits.map((p) => p.id);
      const next = ids.includes(intent) ? intent : ids.includes(here) ? here : ids[0];
      if (!ids.includes(intent)) intent = null;
      if (next !== here || !visited.has(next)) {
        here = next;
        visited.add(next);
        update();
      }
    }
    addEventListener(
      "scroll",
      () => {
        if (!ticking) {
          ticking = true;
          requestAnimationFrame(track);
        }
      },
      { passive: true },
    );

    narrow.addEventListener("change", draw);
    draw();
    track();
  }

  /* ------------------------------------------------------------------ *
   * CodeAtlas: a draggable import graph of the real backend modules.
   * ------------------------------------------------------------------ */
  function importGraph() {
    const figure = $(".code-map:not(.atlas)");
    const root = figure && $("svg", figure);
    if (!root) return;

    const BASE = "https://github.com/stingingend/CodeAtlas/blob/main/backend/app/";
    const W = 150;
    const H = 46;
    const FILES = {
      "main.py": { wide: [28, 167], tall: [145, 22] },
      "jobs.py": { wide: [228, 46], tall: [22, 122] },
      "ingestion.py": { wide: [228, 288], tall: [268, 122] },
      "parsing.py": { wide: [412, 167], tall: [145, 222] },
      "models.py": { wide: [582, 288], tall: [36, 330] },
      "database.py": { wide: [582, 46], tall: [254, 392] },
    };
    // Imports read from the CodeAtlas source (backend/app/*.py).
    const IMPORTS = [
      ["main.py", "jobs.py"],
      ["main.py", "ingestion.py"],
      ["main.py", "parsing.py"],
      ["main.py", "models.py"],
      ["main.py", "database.py"],
      ["jobs.py", "ingestion.py"],
      ["jobs.py", "parsing.py"],
      ["jobs.py", "models.py"],
      ["ingestion.py", "parsing.py"],
      ["ingestion.py", "models.py"],
      ["parsing.py", "models.py"],
      ["models.py", "database.py"],
    ];
    const BOX = { wide: [760, 380], tall: [440, 460] };

    const status = $(".figure-bottom span:last-child", figure);
    const legend = $(".figure-bottom span:first-child", figure);
    const hint = $("figcaption span:last-child", figure);
    legend.innerHTML = '<i aria-hidden="true"></i> IMPORTS <i class="dashed" aria-hidden="true"></i> IMPORTED BY';
    status.setAttribute("aria-live", "polite");
    root.setAttribute("role", "group");

    let selected = "main.py";
    let key = null;
    let pos = {};
    let nodes = {};
    let edges = [];

    function marker(defs, id, color) {
      const m = svg("marker", { id, markerWidth: 8, markerHeight: 8, refX: 6.5, refY: 3.5, orient: "auto" }, defs);
      svg("path", { d: "M0.5 0.5L6.5 3.5L0.5 6.5", fill: "none", stroke: color, "stroke-width": 1.3 }, m);
    }

    function build() {
      key = narrow.matches ? "tall" : "wide";
      hint.textContent = narrow.matches
        ? "TAP A FILE TO TRACE"
        : "CLICK TO TRACE · DRAG TO REARRANGE";
      const [bw, bh] = BOX[key];
      root.setAttribute("viewBox", `0 0 ${bw} ${bh}`);
      root.replaceChildren();
      svg("title", {}, root).textContent = "CodeAtlas import graph";
      svg("desc", {}, root).textContent =
        "Six backend files from CodeAtlas and the imports between them. Select a file to trace what it imports and what imports it.";
      const defs = svg("defs", {}, root);
      const pattern = svg("pattern", { id: "grid", width: 20, height: 20, patternUnits: "userSpaceOnUse" }, defs);
      svg("path", { d: "M20 0H0V20", fill: "none", stroke: "#cbd2cc", "stroke-width": 0.6 }, pattern);
      marker(defs, "arrow", "#2252d4");
      marker(defs, "arrow-quiet", "#a9b3a4");
      svg("rect", { width: bw, height: bh, fill: "url(#grid)" }, root);
      const edgeLayer = svg("g", { class: "graph-edges" }, root);

      pos = {};
      nodes = {};
      edges = IMPORTS.map(([from, to]) => ({ from, to, line: svg("line", {}, edgeLayer) }));

      for (const name in FILES) {
        pos[name] = [...FILES[name][key]];
        const group = svg(
          "g",
          { class: "graph-node", tabindex: 0, role: "button", "aria-label": `Trace ${name}` },
          root,
        );
        svg("rect", { width: W, height: H, rx: 2 }, group);
        svg("text", { x: 14, y: 29 }, group).textContent = name;
        const link = svg(
          "a",
          { href: BASE + name, target: "_blank", rel: "noreferrer", "aria-label": `Open ${name} on GitHub` },
          group,
        );
        svg("rect", { x: W - 36, y: 0, width: 36, height: H, class: "hit" }, link);
        svg("text", { x: W - 24, y: 29, class: "node-arrow" }, link).textContent = "↗";
        nodes[name] = group;

        group.addEventListener("click", (event) => {
          if (event.target.closest("a")) return;
          select(name);
        });
        group.addEventListener("keydown", (event) => {
          if (event.target !== group) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select(name);
          }
        });
        group.addEventListener("pointerdown", (event) => {
          if (event.pointerType === "touch" || event.button !== 0 || event.target.closest("a")) return;
          const matrix = root.getScreenCTM().inverse();
          const at = (e) => new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix);
          const origin = at(event);
          const [ox, oy] = pos[name];
          group.setPointerCapture(event.pointerId);
          group.classList.add("is-dragging");
          const move = (e) => {
            const p = at(e);
            pos[name] = [
              Math.max(4, Math.min(bw - W - 4, ox + p.x - origin.x)),
              Math.max(4, Math.min(bh - H - 4, oy + p.y - origin.y)),
            ];
            layout();
          };
          const up = () => {
            group.classList.remove("is-dragging");
            group.removeEventListener("pointermove", move);
            group.removeEventListener("pointerup", up);
            group.removeEventListener("pointercancel", up);
          };
          group.addEventListener("pointermove", move);
          group.addEventListener("pointerup", up);
          group.addEventListener("pointercancel", up);
        });
      }
      layout();
      select(selected);
    }

    // Trim a centre-to-centre line so it starts and ends on the box edges.
    function edgePoint(name, tx, ty, gap) {
      const cx = pos[name][0] + W / 2;
      const cy = pos[name][1] + H / 2;
      const dx = tx - cx;
      const dy = ty - cy;
      if (!dx && !dy) return [cx, cy];
      const t = Math.min((W / 2 + gap) / Math.abs(dx || 1e-6), (H / 2 + gap) / Math.abs(dy || 1e-6));
      return [cx + dx * Math.min(t, 1), cy + dy * Math.min(t, 1)];
    }

    function layout() {
      for (const name in nodes)
        nodes[name].setAttribute("transform", `translate(${pos[name][0].toFixed(1)} ${pos[name][1].toFixed(1)})`);
      for (const edge of edges) {
        const a = [pos[edge.from][0] + W / 2, pos[edge.from][1] + H / 2];
        const b = [pos[edge.to][0] + W / 2, pos[edge.to][1] + H / 2];
        const p1 = edgePoint(edge.from, b[0], b[1], 0);
        const p2 = edgePoint(edge.to, a[0], a[1], 5);
        edge.line.setAttribute("x1", p1[0].toFixed(1));
        edge.line.setAttribute("y1", p1[1].toFixed(1));
        edge.line.setAttribute("x2", p2[0].toFixed(1));
        edge.line.setAttribute("y2", p2[1].toFixed(1));
      }
    }

    function select(name) {
      selected = name;
      const out = IMPORTS.filter(([from]) => from === name).map(([, to]) => to);
      const into = IMPORTS.filter(([, to]) => to === name).map(([from]) => from);
      for (const file in nodes) {
        const node = nodes[file];
        node.classList.toggle("is-selected", file === name);
        node.classList.toggle("is-import", out.includes(file));
        node.classList.toggle("is-importer", into.includes(file));
        node.classList.toggle("is-dim", file !== name && !out.includes(file) && !into.includes(file));
        node.setAttribute("aria-pressed", String(file === name));
      }
      for (const edge of edges) {
        const kind = edge.from === name ? "out" : edge.to === name ? "in" : "quiet";
        edge.line.setAttribute("class", `edge-${kind}`);
        edge.line.setAttribute("marker-end", `url(#${kind === "quiet" ? "arrow-quiet" : "arrow"})`);
        if (kind !== "quiet") edge.line.parentNode.appendChild(edge.line);
      }
      const files = (n) => `${n} file${n === 1 ? "" : "s"}`;
      const parts = [];
      if (out.length) parts.push(`imports ${files(out.length)}`);
      if (into.length) parts.push(`imported by ${files(into.length)}`);
      status.textContent = `${name} ${parts.join(" · ")}`;
    }

    narrow.addEventListener("change", build);
    build();
  }

  /* ------------------------------------------------------------------ *
   * CommonTime: paint your availability against two sample replies.
   * ------------------------------------------------------------------ */
  function availability() {
    const visual = $(".calendar-visual");
    const art = visual && $(".calendar-art", visual);
    if (!art) return;

    const DAYS = [
      ["MON", "Monday"],
      ["TUE", "Tuesday"],
      ["WED", "Wednesday"],
      ["THU", "Thursday"],
      ["FRI", "Friday"],
    ];
    const TIMES = ["9 AM", "11 AM", "1 PM", "3 PM"];
    // Sample replies, as "day-time" indexes. Not real CommonTime data.
    const OTHERS = [
      ["0-0", "0-1", "1-1", "1-2", "2-2", "2-3", "3-0", "3-2", "4-1"],
      ["0-1", "1-2", "1-3", "2-0", "2-2", "3-2", "3-3", "4-1", "4-3"],
    ];
    const mine = new Set();
    const cells = {};

    visual.removeAttribute("role");
    visual.removeAttribute("aria-label");
    art.removeAttribute("aria-hidden");
    art.replaceChildren();
    art.classList.add("is-live");
    $(".visual-bar span:last-child", visual).textContent = "AVAILABILITY / TRY IT · SAMPLE DATA";

    const head = html("div", { class: "calendar-heading" }, art);
    html("span", {}, head).innerHTML = "Find a time. <strong>Make it happen.</strong>";
    const clear = html("button", { type: "button", class: "calendar-clear", text: "Clear", hidden: "" }, head);
    const status = html("p", { class: "calendar-status", "aria-live": "polite" }, art);
    const grid = html("div", { class: "calendar-grid", role: "group", "aria-label": "Your availability" }, art);

    html("span", {}, grid);
    for (const [short] of DAYS) html("span", { class: "day", text: short, "aria-hidden": "true" }, grid);

    let painting = null; // { value, origin } while dragging with a mouse
    TIMES.forEach((time, t) => {
      html("span", { class: "time", text: time, "aria-hidden": "true" }, grid);
      DAYS.forEach(([, day], d) => {
        const id = `${d}-${t}`;
        const count = OTHERS.filter((reply) => reply.includes(id)).length;
        const cell = html("button", { type: "button", class: `cell others-${count}`, "aria-pressed": "false" }, grid);
        cells[id] = { cell, count, label: `${day} ${time}` };
        cell.addEventListener("click", () => set(id, !mine.has(id)));
        cell.addEventListener("pointerdown", (event) => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          painting = { value: !mine.has(id), origin: id };
        });
        cell.addEventListener("pointerenter", () => {
          if (!painting || painting.origin === id) return;
          set(painting.origin, painting.value);
          set(id, painting.value);
        });
      });
    });
    addEventListener("pointerup", () => (painting = null));
    clear.addEventListener("click", () => {
      mine.clear();
      render();
      cells["0-0"].cell.focus();
    });

    function set(id, on) {
      if (on) mine.add(id);
      else mine.delete(id);
      render();
    }

    function render() {
      const matches = [];
      for (const id in cells) {
        const { cell, count, label } = cells[id];
        const on = mine.has(id);
        const match = on && count === OTHERS.length;
        if (match) matches.push(label);
        cell.classList.toggle("is-mine", on);
        cell.classList.toggle("is-match", match);
        cell.textContent = match ? "✓" : "";
        cell.setAttribute("aria-pressed", String(on));
        cell.setAttribute("aria-label", `${label}, ${count} of ${OTHERS.length} others free${match ? ", everyone is free" : ""}`);
      }
      clear.hidden = mine.size === 0;
      if (!mine.size) status.textContent = "Two people have replied. Mark the times you’re free.";
      else if (!matches.length) status.textContent = "No time works for all three yet. Try a darker square.";
      else
        status.textContent =
          `Everyone’s free ${matches[0]}` + (matches.length > 1 ? ` and ${matches.length - 1} more` : "") + ".";
    }
    render();
  }

  /* ------------------------------------------------------------------ *
   * CoachZilla: drive the sample route, with or without the refuel stop.
   * ------------------------------------------------------------------ */
  function busRoute() {
    const visual = $(".route-visual");
    const root = visual && $("svg", visual);
    const line = root && $("#route-line", root);
    if (!line) return;

    const ROUTE_KM = 480; // sample figures for the illustration
    const RANGE_KM = 340;
    const DRIVE_MS = 4200;
    const REFUEL_MS = 900;
    const length = line.getTotalLength();
    let stopAt = 0;
    for (let l = 0, best = Infinity; l <= length; l += 1) {
      const p = line.getPointAtLength(l);
      const gap = Math.hypot(p.x - 224, p.y - 145);
      if (gap < best) {
        best = gap;
        stopAt = l / length;
      }
    }
    const stopKm = Math.round(ROUTE_KM * stopAt);

    visual.classList.add("is-live");
    root.setAttribute("preserveAspectRatio", "xMidYMid slice");
    $(".visual-bar span:last-child", visual).textContent = "ROUTE / TRY IT · SAMPLE DATA";

    const done = svg("path", { d: line.getAttribute("d"), class: "route-done" });
    line.after(done);
    done.style.strokeDasharray = `0 ${length}`;
    const bus = svg("g", { class: "bus" }, root);
    svg("rect", { x: -13, y: -8, width: 26, height: 16, rx: 4 }, bus);
    svg("path", { d: "M-7 -4H7M-7 4H7", class: "bus-windows" }, bus);

    const panel = html("div", { class: "route-panel" }, visual);
    const drive = html("button", { type: "button", class: "route-drive", text: "▶ Drive route" }, panel);
    const toggle = html("label", { class: "route-toggle" }, panel);
    const refuel = html("input", { type: "checkbox", checked: "" }, toggle);
    toggle.append(" Refuel stop");
    const gauge = html("div", { class: "route-gauge", "aria-hidden": "true" }, panel);
    html("span", { text: "FUEL" }, gauge);
    const fill = html("i", {}, html("b", {}, gauge));
    const percent = html("span", { text: "100%" }, gauge);
    const status = html("p", { class: "route-status", "aria-live": "polite" }, panel);

    let run = 0;

    function place(fraction, fuel, out) {
      const at = length * fraction;
      const p = line.getPointAtLength(at);
      const a = line.getPointAtLength(Math.max(0, at - 1));
      const b = line.getPointAtLength(Math.min(length, at + 1));
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      bus.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
      bus.classList.toggle("is-out", !!out);
      done.style.strokeDasharray = `${at} ${length}`;
      fill.style.width = `${Math.max(0, fuel) * 100}%`;
      gauge.classList.toggle("is-low", fuel < 0.15);
      percent.textContent = `${Math.round(Math.max(0, fuel) * 100)}%`;
    }

    // State of the trip after `ms` of elapsed time.
    function trip(ms, withStop) {
      const stopMs = DRIVE_MS * stopAt;
      const stopExact = ROUTE_KM * stopAt;
      const kmAt = (t) => Math.min(ROUTE_KM, (t / DRIVE_MS) * ROUTE_KM);
      let km = kmAt(ms);
      let fuel = 1 - km / RANGE_KM;
      let refuelling = false;
      if (withStop && ms > stopMs) {
        const arriving = 1 - stopExact / RANGE_KM;
        if (ms < stopMs + REFUEL_MS) {
          refuelling = true;
          km = stopExact;
          fuel = arriving + (1 - arriving) * ((ms - stopMs) / REFUEL_MS);
        } else {
          km = kmAt(ms - REFUEL_MS);
          fuel = 1 - (km - stopExact) / RANGE_KM;
        }
      }
      const out = fuel <= 0;
      if (out) {
        fuel = 0;
        km = RANGE_KM;
      }
      return { km, fuel, out, arrived: km >= ROUTE_KM, refuelling };
    }

    function finish(state) {
      drive.textContent = "↻ Drive again";
      drive.disabled = false;
      refuel.disabled = false;
      status.textContent = state.out
        ? `Out of fuel ${Math.round(ROUTE_KM - state.km)} km short. Add the refuel stop.`
        : `Arrived: ${ROUTE_KM} km with ${Math.round(state.fuel * 100)}% fuel left.`;
    }

    function start() {
      const id = ++run;
      const withStop = refuel.checked;
      const total = DRIVE_MS + (withStop ? REFUEL_MS : 0);
      drive.disabled = true;
      refuel.disabled = true;
      if (reduceMotion.matches) {
        const state = trip(total, withStop);
        place(state.km / ROUTE_KM, state.fuel, state.out);
        return finish(state);
      }
      const began = performance.now();
      const frame = (now) => {
        if (id !== run) return;
        const state = trip(Math.min(total, now - began), withStop);
        place(state.km / ROUTE_KM, state.fuel, state.out);
        status.textContent = state.refuelling ? "Refuelling…" : `${Math.round(state.km)} km of ${ROUTE_KM} km`;
        if (state.out || state.arrived) return finish(state);
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }

    function reset() {
      run++;
      visual.classList.toggle("no-refuel", !refuel.checked);
      place(0, 1, false);
      drive.textContent = "▶ Drive route";
      drive.disabled = false;
      status.textContent = refuel.checked
        ? `${ROUTE_KM} km route · ${RANGE_KM} km tank`
        : `${ROUTE_KM} km route · ${RANGE_KM} km tank · no stop`;
    }

    drive.addEventListener("click", start);
    refuel.addEventListener("change", reset);
    reset();

    if (!reduceMotion.matches) {
      const seen = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          seen.disconnect();
          if (!drive.disabled && drive.textContent.startsWith("▶")) start();
        },
        { threshold: 0.7 },
      );
      seen.observe(visual);
    }
  }

  /* ------------------------------------------------------------------ *
   * Entry screen: a marble Atlantis under clear water. The pointer
   * sends ripples across the surface; "Dive in" zooms into the core.
   * ------------------------------------------------------------------ */
  const GATE_SHADER = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uCenter;
uniform float uScale;
uniform vec2 uMouse;
uniform float uGlow;
uniform float uEnter;
uniform vec4 uRip[12];
const float PI = 3.14159265;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    a *= 0.5;
  }
  return s;
}

// Height of the water surface: slow swell plus one ring per ripple.
float surface(vec2 p) {
  float h = 0.6 * (noise(p * 4.0 + vec2(uTime * 0.22, uTime * 0.17))
                 + noise(p * 7.0 - vec2(uTime * 0.15, -uTime * 0.2)));
  for (int i = 0; i < 12; i++) {
    vec4 r = uRip[i];
    float age = uTime - r.z;
    if (age > 0.0 && age < 5.0) {
      float d = length(p - r.xy);
      float w = d - age * 0.32;
      h += r.w * cos(w * 55.0) * exp(-w * w * 220.0) * exp(-age * 1.1) / (1.0 + d * 2.0);
    }
  }
  return h;
}

float band(float r, float a, float b, float aa) {
  return smoothstep(a - aa, a + aa, r) - smoothstep(b - aa, b + aa, r);
}

// Plato's plan: rings of water around a central island, and one canal out.
float channels(vec2 q, float aa) {
  float r = length(q);
  float c = band(r, 0.095, 0.150, aa) + band(r, 0.232, 0.300, aa) + band(r, 0.400, 0.485, aa);
  vec2 d = vec2(0.5547, -0.8321);
  float along = dot(q, d);
  float perp = abs(dot(q, vec2(-d.y, d.x)));
  float canal = (1.0 - smoothstep(0.017 - aa, 0.017 + aa, perp)) * smoothstep(0.12 - aa, 0.12 + aa, along);
  return clamp(max(c, canal), 0.0, 1.0);
}

vec3 marble(vec2 q) {
  vec2 w = q * 1.7 + vec2(3.7, 1.3);
  float n = fbm(w + 1.8 * vec2(fbm(w + vec2(1.7, 9.2)), fbm(w + vec2(8.3, 2.8))));
  float strength = smoothstep(0.35, 0.75, fbm(w * 0.6 + 11.0));
  float v = abs(sin((w.x * 0.9 + w.y * 1.6 + n * 4.2) * 1.7));
  float vein = (1.0 - smoothstep(0.0, 0.10, v)) * (0.35 + 0.65 * strength);
  float fine = (1.0 - smoothstep(0.0, 0.05, abs(sin((w.x * 2.3 - w.y * 1.1 + n * 7.0) * 2.3)))) * 0.25 * strength;
  vec3 col = mix(vec3(0.972, 0.970, 0.960), vec3(0.915, 0.922, 0.925), smoothstep(0.3, 0.8, n));
  return mix(col, vec3(0.70, 0.735, 0.76), clamp(vein * 0.6 + fine, 0.0, 1.0));
}

vec3 city(vec2 q, float aa) {
  vec3 col = marble(q);
  float r = length(q);
  float a = atan(q.y, q.x);
  float hair = aa * 1.5;

  // Engraved dial: hairlines and slowly turning tick marks.
  float e = 0.0;
  e += 1.0 - smoothstep(0.0, hair, abs(r - 0.535));
  e += 1.0 - smoothstep(0.0, hair, abs(r - 0.565));
  e += (1.0 - smoothstep(0.0, hair, abs(r - 0.190))) * 0.6;
  e += (1.0 - smoothstep(0.0, hair, abs(r - 0.350))) * 0.6;
  float f1 = fract((a + uTime * 0.03) / (2.0 * PI) * 180.0);
  e += (1.0 - smoothstep(0.08, 0.16, min(f1, 1.0 - f1))) * band(r, 0.535, 0.565, aa);
  float f2 = fract((a + uTime * 0.03) / (2.0 * PI) * 24.0);
  e += (1.0 - smoothstep(0.010, 0.022, min(f2, 1.0 - f2))) * band(r, 0.535, 0.590, aa);
  float f3 = fract((a - uTime * 0.02) / (2.0 * PI) * 72.0);
  e += step(0.5, f3) * (1.0 - smoothstep(0.0, hair, abs(r - 0.665))) * 0.8;
  col = mix(col, vec3(0.52, 0.59, 0.68), clamp(e, 0.0, 1.0) * 0.55);

  // Channels cut into the stone, with a shadowed and a lit wall.
  vec2 light = vec2(-0.006, 0.008);
  float c = channels(q, aa);
  float shadow = c * (1.0 - channels(q + light, aa));
  float lit = c * (1.0 - channels(q - light, aa));
  vec3 water = mix(vec3(0.36, 0.70, 0.88), vec3(0.16, 0.38, 0.86),
                   smoothstep(0.2, 0.75, fbm(q * 3.0 + uTime * 0.05)));
  col = mix(col, water, c * 0.86);
  col = mix(col, vec3(0.07, 0.20, 0.55), shadow * 0.55);
  col += lit * 0.16;

  // The core.
  vec3 blue = vec3(0.133, 0.322, 0.831);
  col = mix(col, blue, (1.0 - smoothstep(0.0, hair, abs(r - 0.045))) * 0.8);
  col = mix(col, blue, 1.0 - smoothstep(0.012 - aa, 0.012 + aa, r));
  col += vec3(0.25, 0.45, 1.0) * exp(-r * r * 700.0) * (0.22 + 0.10 * sin(uTime * 1.6));
  return col;
}

void main() {
  float m = min(uRes.x, uRes.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / m;
  float e = uEnter * uEnter * (3.0 - 2.0 * uEnter);
  float zoom = 1.0 - 0.96 * e;
  vec2 p = (uv - uCenter * (1.0 - e)) / uScale * zoom;
  float aa = 1.5 / m / uScale * zoom;

  float h = surface(p);
  float eps = 0.004;
  vec2 g = vec2(surface(p + vec2(eps, 0.0)) - h, surface(p + vec2(0.0, eps)) - h) / eps;

  // Look through the surface: ripples bend the view of the floor.
  vec2 q = p + g * 0.0009 * zoom - uMouse * 0.012 * uGlow;
  vec3 col = city(q, aa);

  // Caustic light, wave relief, and a soft glow under the pointer.
  vec2 cw = q * 4.0;
  float n1 = noise(cw + vec2(uTime * 0.25, -uTime * 0.2));
  float n2 = noise(cw * 1.7 - vec2(uTime * 0.2, uTime * 0.3) + 7.0);
  float caustic = pow(1.0 - abs(n1 - 0.5) * 2.0, 9.0) + pow(1.0 - abs(n2 - 0.5) * 2.0, 9.0);
  col += vec3(0.9, 1.0, 1.0) * caustic * 0.03;
  col += clamp(dot(g, vec2(-0.7, 0.7)), -40.0, 40.0) * 0.0022;
  float dm = length(p - uMouse);
  col += vec3(0.55, 0.75, 1.0) * exp(-dm * dm * 14.0) * 0.07 * uGlow;

  col *= vec3(0.975, 0.992, 1.0);
  col = mix(col * vec3(0.86, 0.90, 0.95), col, smoothstep(1.25, 0.25, length(uv)));
  col = mix(col, vec3(0.969, 0.965, 0.949), smoothstep(0.5, 1.0, e));
  gl_FragColor = vec4(col, 1.0);
}`;

  function gate() {
    const root = document.documentElement;
    const node = $("#gate");
    if (!node || !root.classList.contains("gate-on")) return;

    const page = $(".page");
    const canvas = $(".gate-canvas", node);
    const button = $(".gate-enter", node);
    const cursor = $(".gate-cursor", node);
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const RIPPLES = 12;
    const ripples = new Float32Array(RIPPLES * 4).fill(-100);
    let nextRipple = 0;
    let center = [0, 0];
    let scale = 0.8;
    let mouse = [0, 0];
    let glow = 0;
    const eased = { x: 0, y: 0, glow: 0 }; // smoothed pointer state sent to the shader
    let entering = 0; // timestamp when the dive began
    let frame = 0;
    let closed = false;

    page.inert = true;
    button.focus({ preventScroll: true });

    function close() {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(frame);
      node.classList.add("is-gone");
      page.inert = false;
      setTimeout(
        () => {
          node.remove();
          root.classList.remove("gate-on");
        },
        reduceMotion.matches ? 0 : 450,
      );
      const title = $("#intro-title");
      title.setAttribute("tabindex", "-1");
      title.focus({ preventScroll: true });
    }
    function enter() {
      if (entering || closed) return;
      node.classList.add("is-leaving");
      if (reduceMotion.matches || !uniforms) return close();
      entering = performance.now();
      addRipple(0, 0, 0.9);
    }

    button.addEventListener("click", enter);
    node.addEventListener("keydown", (event) => {
      if (event.key === "Escape") enter();
    });
    node.addEventListener("wheel", (event) => event.deltaY > 0 && enter(), { passive: true });

    // WebGL setup: one full-screen triangle and the fragment shader above.
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    let uniforms = null;
    if (gl) {
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
      };
      try {
        const program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}"));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, GATE_SHADER));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const corner = gl.getAttribLocation(program, "a");
        gl.enableVertexAttribArray(corner);
        gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
        uniforms = {};
        for (const name of ["uRes", "uTime", "uCenter", "uScale", "uMouse", "uGlow", "uEnter", "uRip"])
          uniforms[name] = gl.getUniformLocation(program, name);
      } catch (error) {
        console.error(error);
        uniforms = null;
      }
    }
    if (!uniforms) {
      node.classList.add("no-gl");
      canvas.remove();
      return;
    }

    const began = performance.now();
    const seconds = () => (performance.now() - began) / 1000;

    function resize() {
      const w = node.clientWidth;
      const h = node.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(2.4e6 / (w * h)));
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
      const aspect = w / h;
      if (aspect > 1.2) {
        center = [aspect / 2 - 0.3, 0]; // sits off the right edge, cropped
        scale = 0.95;
      } else {
        center = [0, Math.max(0.04, 0.5 / aspect - 0.58)];
        scale = 0.74;
      }
      if (reduceMotion.matches) draw();
    }

    // Screen pixels to the city's own coordinates.
    function toCity(x, y) {
      const w = node.clientWidth;
      const h = node.clientHeight;
      const m = Math.min(w, h);
      return [((x - w / 2) / m - center[0]) / scale, ((h / 2 - y) / m - center[1]) / scale];
    }
    function addRipple(x, y, strength) {
      ripples.set([x, y, seconds(), strength], nextRipple * 4);
      nextRipple = (nextRipple + 1) % RIPPLES;
    }

    let last = [0, 0, -1];
    let cursorAt = null;
    let cursorTo = null;
    node.addEventListener("pointermove", (event) => {
      const [x, y] = toCity(event.clientX, event.clientY);
      const now = seconds();
      mouse = [x, y];
      glow = 1;
      node.classList.add("has-moved");
      if (Math.hypot(x - last[0], y - last[1]) > 0.045 || now - last[2] > 0.35) {
        addRipple(x, y, 0.42);
        last = [x, y, now];
      }
      if (finePointer) {
        cursorTo = [event.clientX, event.clientY];
        if (!cursorAt) cursorAt = [...cursorTo];
        cursor.classList.toggle("is-over", !!event.target.closest(".gate-enter"));
      }
    });
    node.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".gate-enter")) return;
      addRipple(...toCity(event.clientX, event.clientY), 0.9);
    });
    node.addEventListener("pointerleave", () => (glow = 0));
    if (finePointer && !reduceMotion.matches) node.classList.add("has-cursor");

    function draw() {
      const t = seconds();
      let dive = 0;
      if (entering) {
        dive = Math.min(1, (performance.now() - entering) / 1300);
        if (dive >= 1) return close();
      } else if (t - last[2] > 1.6) {
        // Keep the water alive when nobody is touching it.
        const a = Math.random() * Math.PI * 2;
        const r = 0.1 + Math.random() * 0.5;
        addRipple(Math.cos(a) * r, Math.sin(a) * r, 0.3);
        last[2] = t - 0.4;
      }
      gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
      gl.uniform1f(uniforms.uTime, t);
      gl.uniform2f(uniforms.uCenter, center[0], center[1]);
      gl.uniform1f(uniforms.uScale, scale);
      eased.x += (mouse[0] - eased.x) * 0.18;
      eased.y += (mouse[1] - eased.y) * 0.18;
      eased.glow += (glow - eased.glow) * 0.06;
      gl.uniform2f(uniforms.uMouse, eased.x, eased.y);
      gl.uniform1f(uniforms.uGlow, eased.glow);
      gl.uniform1f(uniforms.uEnter, dive);
      gl.uniform4fv(uniforms.uRip, ripples);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (cursorAt && cursorTo) {
        cursorAt[0] += (cursorTo[0] - cursorAt[0]) * 0.22;
        cursorAt[1] += (cursorTo[1] - cursorAt[1]) * 0.22;
        cursor.style.transform = `translate3d(${cursorAt[0].toFixed(1)}px, ${cursorAt[1].toFixed(1)}px, 0)`;
      }
    }
    function loop() {
      if (closed) return;
      draw();
      if (!closed) frame = requestAnimationFrame(loop);
    }

    addEventListener("resize", () => !closed && resize());
    resize();
    if (reduceMotion.matches) draw();
    else loop();
  }

  for (const feature of [gate, atlas, importGraph, availability, busRoute]) {
    try {
      feature();
    } catch (error) {
      console.error(error);
    }
  }
})();
