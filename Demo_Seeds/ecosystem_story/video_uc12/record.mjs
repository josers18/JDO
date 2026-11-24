#!/usr/bin/env node
// Records the UC-12 "Campaign responders" demo (ReactRetailV2 Growth page, viewed as Justin Chen, org jdo-oe0sdd) from a
// timed talk track: demo.mp4 (4K, silent), timing.json and narration.srt. Usage:
//   node record.mjs --track TALK_TRACK_VIDEO.md [--out ./video-out] [--voice clips.json] [--measured timing.json]
// Ported from the narrated-demo-video skill's reference recorder. Logs in with a one-time frontdoor URL
// from `sf org open --url-only` (never printed), and clears what the demo writes before and after a take:
// the "Follow up:" Task that Approve creates on the featured customer.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "../../../React-Headless/force-app/main/default/uiBundles/ReactRetail/node_modules/playwright/index.mjs";
import { HELD, applyMeasuredTiming, applyVoiceTiming, parseTalkTrack, toSrt } from "./talkTrack.mjs";

const ORG = "jdo-oe0sdd";
const HERO = "001am00002A9gmzAAB"; // Autumn L Cabrera, top responder in Justin Chen's book
const VIEW_AS = "Justin Chen";
const APP_URL = "https://storm-16a17dc388fbe6--c.demo.my.salesforce.app";
const PAGE_PATH = "/app/c__ReactRetailV2"; // Today, the banker's home page; the track navigates to Growth

// The layout the viewer sees is 2400x1350 CSS px (so long replies and the whole inspector fit); it is
// rendered with CSS zoom into a 3840x2160 window so every frame is captured sharp at 4K.
const LAYOUT = { width: 2400, height: 1350 };
const CAPTURE = { width: 3840, height: 2160 };
const ZOOM = CAPTURE.width / LAYOUT.width;
const FPS = 30;
const JPEG_QUALITY = 92;
const VIDEO_BITRATE = "24M";
const SCROLL_SETTLE_MS = 700;
const TYPE_DELAY_MS = 25;
const LOAD_TIMEOUT_MS = 90_000;
const DRAFT_TIMEOUT_MS = 120_000;

function args() {
  const a = process.argv.slice(2);
  const get = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const track = get("--track");
  if (!track) throw new Error("--track <path> is required");
  const voice = get("--voice");
  const measured = get("--measured");
  return { track: resolve(track), out: resolve(get("--out", "./video-out")), voice: voice && resolve(voice), measured: measured && resolve(measured) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


/**
 * Injected into every page: zooms the layout to the 4K capture window, hides the presenter chrome (top
 * bar, icon rail, dev badge) and draws, in one #rec-root layer: a cursor that follows the real mouse and
 * a ripple on each press; whatever `window.__recState` holds (tracked every frame so it follows scrolling):
 * an underline or ring per target, a numbered note with an arrow (point), or a dimmed spotlight, a camera
 * push-in and a callout card with an arrow (spot); plus the story slide and the closing card.
 */
function overlay({ zoom }) {
  const AMBER = "rgb(240,150,0)";
  const css = `
    html { zoom: ${zoom}; scrollbar-width: none; }
    #root { transition: transform 1250ms cubic-bezier(.45,0,.2,1); }
    /* Presenter chrome, recording only: session banner, Agentforce chat launcher, left nav, top bar. */
    sf-session-banner, lightning-out-application, .acc-container { display: none !important; }
    body.sf-session-banner-active { padding-top: 0 !important; }
    #rec-root, #rec-root * { pointer-events: none; box-sizing: border-box; }
    #rec-root { font-family: var(--brand-font-heading, system-ui), system-ui, sans-serif; }
    #rec-cursor { position: fixed; left: 0; top: 0; width: 34px; height: 34px; z-index: 2147483647;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,.35)); transition: opacity 250ms ease; }
    /* While something is marked the cursor steps aside, so it never sits on the words. */
    #rec-cursor.away { opacity: 0; }
    .rec-ripple { position: fixed; z-index: 2147483646; width: 56px; height: 56px; margin: -28px 0 0 -28px;
      border-radius: 50%; border: 4px solid rgba(255,176,32,.95); animation: rec-ripple 650ms ease-out forwards; }
    @keyframes rec-ripple { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.6); opacity: 0 } }
    /* Panels get one ring; phrases get an underline that draws in over a faint highlighter wash. */
    .rec-ring { position: fixed; z-index: 2147483641; border-radius: 10px; border: 3px solid rgba(240,150,0,.95); animation: rec-fade 300ms ease-out both; }
    .rec-line { position: fixed; z-index: 2147483641; height: 4px; border-radius: 2px; background: ${AMBER}; transform-origin: left center; animation: rec-draw 450ms ease-out both; }
    .rec-mark { position: fixed; z-index: 2147483641; border-radius: 3px; background: rgba(255,196,60,.18); animation: rec-fade 450ms ease-out both; }
    @keyframes rec-draw { from { transform: scaleX(0) } to { transform: scaleX(1) } }
    @keyframes rec-fade { from { opacity: 0 } to { opacity: 1 } }
    @keyframes rec-pop { from { opacity: 0; transform: translateY(12px) scale(.97) } to { opacity: 1; transform: none } }
    @keyframes rec-dash { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }
    #rec-dim { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 2147483640; opacity: 0; transition: opacity 500ms ease; }
    #rec-dim.on { opacity: 1; }
    #rec-arrows { position: fixed; inset: 0; width: 100%; height: 100%; z-index: 2147483642; overflow: visible; }
    #rec-arrows path.go { stroke-dasharray: 1; animation: rec-dash 550ms 150ms ease-out both; }
    #rec-arrows path.ghost { stroke-dasharray: .012 .03; opacity: .45; }
    /* point: an amber sticky note with its number, beside the words it explains. */
    .rec-note { position: fixed; z-index: 2147483643; max-width: 520px; display: flex; gap: 14px; align-items: flex-start;
      background: #fff7e0; border: 2.5px solid #ffb020; border-radius: 16px; padding: 16px 22px 16px 16px;
      color: #2a1d00; font-weight: 600; font-size: 27px; line-height: 1.3; box-shadow: 0 14px 36px rgba(8,22,45,.22);
      animation: rec-pop 380ms ease-out both; transition: opacity 300ms ease; }
    .rec-note .n { flex: none; width: 40px; height: 40px; border-radius: 50%; background: ${AMBER}; color: #fff;
      display: grid; place-items: center; font-weight: 800; font-size: 22px; margin-top: -1px; }
    .rec-note.ghost { opacity: .42; animation: none; }
    /* spot: a white callout card over the dimmed, zoomed-in screen. */
    #rec-callout { position: fixed; z-index: 2147483643; width: 620px; background: #fff; color: #0b1f3a; border-radius: 18px;
      border-top: 8px solid ${AMBER}; padding: 26px 32px 28px; box-shadow: 0 24px 60px rgba(8,22,45,.38); animation: rec-pop 450ms 250ms ease-out both; }
    #rec-callout .k { font-weight: 800; font-size: 17px; letter-spacing: .16em; text-transform: uppercase; color: #b86e00; }
    #rec-callout .h { font-weight: 750; font-size: 40px; line-height: 1.12; margin-top: 10px; }
    #rec-callout ul { margin: 16px 0 0; padding: 0; list-style: none; }
    #rec-callout li { position: relative; padding-left: 28px; margin-top: 10px; font-weight: 500; font-size: 26px; line-height: 1.3; color: #33475f; }
    #rec-callout li::before { content: ""; position: absolute; left: 4px; top: 13px; width: 10px; height: 10px; border-radius: 50%; background: ${AMBER}; }
    /* The story slide: brand navy, a headline, and a timeline whose steps arrive one by one. */
    #rec-slide { position: fixed; inset: 0; z-index: 2147483645; overflow: hidden; color: #fff; padding: 150px 170px;
      background: radial-gradient(circle at 72% 28%, #0b4a8f, #032d60 62%); transition: opacity 700ms ease; }
    #rec-slide.out { opacity: 0; }
    #rec-slide::after { content: ""; position: absolute; inset: -20%; background: radial-gradient(circle at 30% 70%, rgba(255,176,32,.10), transparent 45%);
      animation: rec-drift 18s ease-in-out both; }
    @keyframes rec-drift { from { transform: translate(-4%, 3%) } to { transform: translate(4%, -3%) } }
    #rec-slide .k { font-weight: 700; font-size: 27px; letter-spacing: .16em; text-transform: uppercase; color: #ffc45a; animation: rec-pop 600ms 100ms both; }
    #rec-slide h1 { font-weight: 750; font-size: 96px; line-height: 1.05; margin: 22px 0 16px; max-width: 1700px; animation: rec-pop 700ms 300ms both; }
    #rec-slide h1 em { font-style: normal; color: #ffb020; white-space: nowrap; }
    #rec-slide .sub { font-size: 38px; opacity: .82; animation: rec-pop 700ms 600ms both; }
    #rec-slide .tl { position: absolute; left: 170px; right: 170px; top: 720px; display: flex; gap: 40px; }
    #rec-slide .tl::before { content: ""; position: absolute; left: 0; right: 0; top: 42px; height: 5px; background: rgba(255,255,255,.22);
      transform-origin: left; animation: rec-draw 1600ms 900ms ease-out both; }
    #rec-slide .st { flex: 1; position: relative; animation: rec-pop 600ms ease-out both; }
    #rec-slide .dot { width: 88px; height: 88px; border-radius: 50%; background: #fff; color: #032d60; display: grid; place-items: center; font-weight: 800; font-size: 32px; }
    #rec-slide .st.now .dot { background: #ffb020; animation: rec-pulse 1.8s ease-in-out infinite; }
    @keyframes rec-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,176,32,.5) } 50% { box-shadow: 0 0 0 22px rgba(255,176,32,0) } }
    #rec-slide .t { font-weight: 750; font-size: 30px; color: #ffc45a; margin-top: 30px; letter-spacing: .04em; }
    #rec-slide .d { font-weight: 500; font-size: 35px; line-height: 1.3; margin-top: 10px; max-width: 470px; }
    #rec-slide .foot { position: absolute; left: 170px; bottom: 120px; font-weight: 500; font-size: 32px; opacity: .72; animation: rec-fade 800ms 3s both; }
    #rec-card { position: fixed; inset: 0; z-index: 2147483645; display: grid; place-items: center; place-content: center; opacity: 0;
      background: rgba(10,25,45,.86); color: #fff; font-weight: 600; font-size: 64px; line-height: 1.25; text-align: center; padding: 0 12%;
      transition: opacity 900ms ease; }
    #rec-card .sub { display: block; margin-top: 28px; font-size: 44px; font-weight: 500; color: #f5b942; }`;
  window.__recState = { targets: [] };
  window.__recCam = { s: 1, tx: 0, ty: 0 };
  const z = (v) => v / zoom;
  const app = () => document.getElementById("root");
  // Every target's boxes in CSS px: one per line for a text range, one for an element.
  const boxesOf = (t) => {
    const rs = t instanceof Range ? [...t.getClientRects()].filter((r) => r.width > 2) : [t.getBoundingClientRect()];
    return rs.map((r) => ({ l: z(r.left), t: z(r.top), r: z(r.right), b: z(r.bottom) }));
  };
  const union = (bs) => (bs.length ? bs.reduce((u, b) => ({ l: Math.min(u.l, b.l), t: Math.min(u.t, b.t), r: Math.max(u.r, b.r), b: Math.max(u.b, b.b) })) : null);
  const W = () => innerWidth / zoom;
  const H = () => innerHeight / zoom;

  /** spot: push the camera in on the targets (at most 1.45x), leaving room for the callout on the open side. */
  window.__recAim = () => {
    const u = union(window.__recState.targets.flatMap(boxesOf));
    const a = app();
    if (!u || !a) return;
    const c = window.__recCam;
    const [ul, ur, ut, ub] = [(u.l - c.tx) / c.s, (u.r - c.tx) / c.s, (u.t - c.ty) / c.s, (u.b - c.ty) / c.s];
    const s = Math.max(1, Math.min(1.45, (W() * 0.5) / (ur - ul), (H() * 0.62) / (ub - ut)));
    const cx = (ul + ur) / 2;
    const cy = (ut + ub) / 2;
    const tx = Math.min(0, Math.max(W() - s * W(), (cx < W() / 2 ? W() * 0.34 : W() * 0.66) - s * cx));
    const ty = Math.min(0, Math.max(H() - s * H(), H() * 0.48 - s * cy));
    window.__recCam = { s, tx, ty };
    // The window scrolls here: pin the transform origin to the viewport's top-left so the maths above holds.
    a.style.transformOrigin = `0 ${-z(a.getBoundingClientRect().top)}px`;
    a.style.transform = s === 1 && !tx && !ty ? "" : `translate(${tx}px, ${ty}px) scale(${s})`;
  };
  window.__recUnaim = () => {
    const a = app();
    const was = window.__recCam.s !== 1 || window.__recCam.tx || window.__recCam.ty;
    window.__recCam = { s: 1, tx: 0, ty: 0 };
    if (a) a.style.transform = "";
    return Boolean(was);
  };

  const mount = () => {
    if (document.getElementById("rec-root")) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    const el = (tag, id, cls) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; return e; };
    const svg = (tag, attrs = {}) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
    const root = el("div", "rec-root");
    const cursor = el("div", "rec-cursor");
    cursor.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 2l15 11.5-6.6.9 3.9 7.4-3 1.6-3.9-7.5L4 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    const dim = svg("svg", { id: "rec-dim" });
    const hole = svg("path", { "fill-rule": "evenodd", fill: "rgba(8,22,45,.58)" });
    dim.appendChild(hole);
    const arrows = svg("svg", { id: "rec-arrows" });
    arrows.innerHTML = `<defs><marker id="rec-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${AMBER}"/></marker></defs>`;
    const marks = el("div");
    const notes = el("div");
    root.append(dim, marks, arrows, notes, el("div", "rec-card"), cursor);
    document.body.appendChild(root);
    // Event and getBoundingClientRect coordinates are device px, but fixed boxes inside the zoomed
    // <html> are laid out in CSS px, so every overlay position divides by the zoom.
    addEventListener("mousemove", (e) => { cursor.style.transform = `translate(${z(e.clientX) - 5}px, ${z(e.clientY) - 3}px)`; }, true);
    addEventListener("mousedown", (e) => {
      const r = el("div", null, "rec-ripple");
      r.style.left = `${z(e.clientX)}px`;
      r.style.top = `${z(e.clientY)}px`;
      root.appendChild(r);
      setTimeout(() => r.remove(), 700);
    }, true);

    const PAD = 6;
    const GAP = 64;
    const area = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
    // Where a box of size w x h goes beside `u`: the open side (off screen is out; covering the targets'
    // own blocks costs most), chosen once and then kept, so the note never jumps sides mid-scroll.
    const place = (u, w, h, avoid, side) => {
      const cy = Math.min(Math.max((u.t + u.b) / 2 - h / 2, 24), H() - h - 24);
      const cx = Math.min(Math.max((u.l + u.r) / 2 - w / 2, 24), W() - w - 24);
      const at = {
        right: { l: u.r + GAP, t: cy }, left: { l: u.l - GAP - w, t: cy },
        below: { l: cx, t: u.b + GAP * 0.7 }, above: { l: cx, t: u.t - GAP * 0.7 - h },
      };
      const box = (k) => ({ l: at[k].l, t: at[k].t, r: at[k].l + w, b: at[k].t + h, side: k });
      if (side) return box(side);
      const fits = (b) => b.l >= 16 && b.t >= 16 && b.r <= W() - 16 && b.b <= H() - 16;
      const ranked = Object.keys(at).map(box).map((b, i) => ({ b, cost: (fits(b) ? 0 : 1e9) + avoid.reduce((n, a) => n + area(a, b), 0) + i }));
      return ranked.sort((x, y) => x.cost - y.cost)[0].b;
    };
    // A curved arrow from the facing edge of `box` to the nearest edge of `u`.
    const arrowPath = (box, u) => {
      const [bx, by] = [(box.l + box.r) / 2, (box.t + box.b) / 2];
      const tx = Math.min(Math.max(bx, u.l + 8), u.r - 8);
      const ty = Math.min(Math.max(by, u.t + 4), u.b - 4);
      const s = { right: [box.l, by], left: [box.r, by], below: [bx, box.t], above: [bx, box.b] }[box.side];
      const e = box.side === "right" ? [u.r + 10, ty] : box.side === "left" ? [u.l - 10, ty] : box.side === "below" ? [tx, u.b + 10] : [tx, u.t - 10];
      const [dx, dy] = [e[0] - s[0], e[1] - s[1]];
      const c = [s[0] + dx / 2 - dy * 0.22, s[1] + dy / 2 + dx * 0.22];
      return `M${s[0]} ${s[1]} Q${c[0]} ${c[1]} ${e[0]} ${e[1]}`;
    };
    const blockOf = (t) => (t instanceof Range ? t.startContainer.parentElement?.closest("p, li, td, section, div") : t);

    let built = null;
    let shapes = [];
    let parts = [];
    const follow = () => {
      const st = window.__recState;
      if (built !== st) {
        built = st;
        marks.replaceChildren();
        notes.replaceChildren();
        for (const p of arrows.querySelectorAll("path.arrow")) p.remove();
        shapes = st.targets.map((t) => ({ t, range: t instanceof Range, els: [] }));
        parts = [];
        const add = (info, ghost) => {
          const box = info.spot ? el("div", "rec-callout") : el("div", null, `rec-note${ghost ? " ghost" : ""}`);
          if (info.spot) {
            box.innerHTML = `<div class="k"></div><div class="h"></div><ul></ul>`;
            box.querySelector(".k").textContent = info.spot.kicker ?? "";
            box.querySelector(".h").textContent = info.spot.headline;
            for (const b of info.spot.bullets ?? []) { const li = el("li"); li.textContent = b; box.querySelector("ul").appendChild(li); }
          } else {
            const n = el("span", null, "n");
            n.textContent = String(info.n);
            const tx = el("span");
            tx.textContent = info.text;
            box.append(n, tx);
          }
          notes.appendChild(box);
          const path = svg("path", { class: `arrow ${ghost ? "ghost" : "go"}`, fill: "none", stroke: AMBER, "stroke-width": "5", "stroke-linecap": "round", pathLength: "1", "marker-end": "url(#rec-head)" });
          arrows.appendChild(path);
          parts.push({ info, box, path, ghost, side: null, born: performance.now() });
        };
        if (st.ghost) add(st.ghost, true);
        if (st.spot) add({ spot: st.spot, targets: st.targets }, false);
        else if (st.note) add({ ...st.note, targets: st.targets }, false);
        dim.classList.toggle("on", Boolean(st.spot));
      }
      const hs = [];
      for (const sh of shapes) {
        const rects = boxesOf(sh.t);
        const need = sh.range ? rects.length * 2 : 1;
        while (sh.els.length < need) {
          const e = el("div", null, sh.range ? (sh.els.length % 2 ? "rec-line" : "rec-mark") : "rec-ring");
          marks.appendChild(e);
          sh.els.push(e);
        }
        while (sh.els.length > need) sh.els.pop().remove();
        rects.forEach((b, k) => {
          hs.push(b);
          if (sh.range) {
            Object.assign(sh.els[2 * k].style, { left: `${b.l - 3}px`, top: `${b.t}px`, width: `${b.r - b.l + 6}px`, height: `${b.b - b.t}px` });
            Object.assign(sh.els[2 * k + 1].style, { left: `${b.l}px`, top: `${b.b + 1}px`, width: `${b.r - b.l}px` });
          } else {
            Object.assign(sh.els[0].style, { left: `${b.l - PAD}px`, top: `${b.t - PAD}px`, width: `${b.r - b.l + 2 * PAD}px`, height: `${b.b - b.t + 2 * PAD}px` });
          }
        });
      }
      if (st.spot) {
        const P = 12;
        hole.setAttribute("d", `M0 0H${W()}V${H()}H0Z` + hs.map((b) => `M${b.l - P} ${b.t - P}H${b.r + P}V${b.b + P}H${b.l - P}Z`).join(""));
      }
      let live = null;
      for (const p of [...parts].reverse()) {
        const u = union(p.info.targets.flatMap(boxesOf));
        // visibility, not display: a display:none box measures 0x0, which made a hidden ghost "fit"
        // on the next frame, reappear, overlap again and blink.
        if (!u) { p.box.style.visibility = p.path.style.visibility = "hidden"; continue; }
        const avoid = p.info.targets.map(blockOf).filter(Boolean).flatMap(boxesOf);
        const b = place(u, p.box.offsetWidth, p.box.offsetHeight, [...avoid, ...hs], p.side);
        // Lock the side once the camera has settled (a spot's first frames are mid push-in).
        if (!p.info.spot || performance.now() - p.born > 1100) p.side = b.side;
        // A ghost note that would sit under the live one, or over what is marked now, is dropped.
        const hidden = p.ghost && ((live && area(live, b) > 0) || hs.some((h) => area(h, b) > 0));
        p.box.style.visibility = p.path.style.visibility = hidden ? "hidden" : "";
        Object.assign(p.box.style, { left: `${b.l}px`, top: `${b.t}px` });
        p.path.setAttribute("d", arrowPath(b, u));
        if (!p.ghost) live = b;
      }
      cursor.classList.toggle("away", st.targets.length > 0 || Boolean(document.getElementById("rec-slide")));
      requestAnimationFrame(follow);
    };
    follow();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
}

/**
 * In-page: the newest visible match for `phrase` inside `scopeSel`, as a text Range over just those
 * words, so the overlay underlines the phrase instead of boxing its block (boxes overlapped when a
 * point named two nearby phrases).
 */
function findPhrase([scopeSel, phrase]) {
  const scope = scopeSel ? document.querySelector(scopeSel) : document.body;
  if (!scope) return null;
  const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  const hits = [...scope.querySelectorAll("*")].filter(
    (el) => !el.closest("#rec-root") && el.textContent.includes(phrase) && ![...el.children].some((c) => c.textContent.includes(phrase)) && vis(el),
  );
  const el = hits.at(-1);
  if (!el) return null;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const i = n.data.lastIndexOf(phrase);
    if (i >= 0) {
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + phrase.length);
      return r;
    }
  }
  // The phrase spans several text nodes (e.g. part of it is bold): underline the whole element's text.
  const r = document.createRange();
  r.selectNodeContents(el);
  return r;
}

/** A JPEG's [width, height] from its SOF marker. */
function jpegSize(buf) {
  for (let i = 2; i + 9 < buf.length; i += 2 + buf.readUInt16BE(i + 2)) {
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xc3) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
  }
  return [0, 0];
}

/**
 * In-page: scroll `el` into view inside its own scroll pane only if it isn't already fully visible
 * there, by the least distance ("nearest"), so highlights don't bounce the panes up and down.
 */
function revealIfHidden(el) {
  let pane = el.parentElement;
  while (pane && !(/(auto|scroll)/.test(getComputedStyle(pane).overflowY) && pane.scrollHeight > pane.clientHeight)) pane = pane.parentElement;
  const box = el.getBoundingClientRect();
  const view = pane ? pane.getBoundingClientRect() : { top: 0, bottom: innerHeight };
  if (box.top >= view.top && box.bottom <= view.bottom) return false;
  // Taller than the pane: bring its top in; otherwise the nearest edge.
  el.scrollIntoView({ behavior: "smooth", block: box.height > view.bottom - view.top ? "start" : "nearest", inline: "nearest" });
  return true;
}

// Where the pointer is now, so each move glides from the last spot.
const mouse = { x: CAPTURE.width / 2, y: CAPTURE.height / 2 };

/**
 * Move like a hand: a gentle arc (not a ruler line), eased in and out, timed by distance (Fitts-ish),
 * overshooting a touch on long moves and settling back onto the target.
 */
async function glide(page, x, y) {
  const { x: x0, y: y0 } = mouse;
  const dist = Math.hypot(x - x0, y - y0);
  if (dist < 2) return;
  const ms = Math.min(1100, 350 + dist * 0.35);
  const steps = Math.max(12, Math.round(ms / 16));
  const bend = (Math.random() < 0.5 ? -1 : 1) * Math.min(120, dist * 0.12);
  const cx = (x0 + x) / 2 + (-(y - y0) / dist) * bend, cy = (y0 + y) / 2 + ((x - x0) / dist) * bend;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  // Long moves land a few px past the target along the travel direction, then correct.
  const over = dist > 300 ? Math.min(14, dist * 0.015) : 0;
  const ex = x + ((x - x0) / dist) * over, ey = y + ((y - y0) / dist) * over;
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps), u = 1 - t;
    await page.mouse.move(u * u * x0 + 2 * u * t * cx + t * t * ex, u * u * y0 + 2 * u * t * cy + t * t * ey);
    await sleep(ms / steps);
  }
  if (over) { await sleep(70); await page.mouse.move(x, y, { steps: 6 }); }
  Object.assign(mouse, { x, y });
}

/** Scroll the element into view (smoothly, inside its own scroll pane) and glide the cursor to it. */
async function moveTo(page, loc) {
  await loc.waitFor({ state: "visible", timeout: 8_000 });
  const reveal = revealIfHidden.toString();
  if (await loc.evaluate((el, f) => new Function(`return (${f})`)()(el), reveal)) await sleep(SCROLL_SETTLE_MS);
  const box = await loc.boundingBox();
  if (!box) return;
  const x = box.x + Math.min(box.width / 2, 160);
  const y = box.y + Math.min(box.height / 2, 60);
  await glide(page, x, y);
}

/** Glide to the element, pause like a hand would, then press where the cursor already is (no snap to center). */
async function click(page, loc) {
  await moveTo(page, loc);
  await sleep(120);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
}

// Regions to search for phrases, and named elements, on the responders page.
const SCOPES = {
  summary: null, text: null,
  today: "main",
  page: '[data-retail-growth="responders"]',
  list: '[aria-label="Ranked responders"]',
  detail: ".biz-responder-detail",
  review: ".atlas-action-review",
};
const NAMED = {
  brief: '[aria-label="Your book at a glance"]',
  priorities: '[aria-label="Ranked priorities"]',
  nav: 'nav[aria-label="Main navigation"]',
  growth: 'nav[aria-label="Main navigation"] a[href$="/growth"]',
  tabs: ".r3-product-controls",
  page: '[data-retail-growth="responders"]',
  chips: ".biz-responders .biz-modes",
  list: '[aria-label="Ranked responders"]',
  top: '[aria-label="Ranked responders"] li:first-child',
  detail: ".biz-responder-detail",
  facts: ".biz-responder-detail .atlas-retail-facts",
  formula: ".biz-responder-detail > .source-note",
  review: ".atlas-action-review",
  form: '[aria-label="Review Salesforce action"]',
  status: '.atlas-action-review [role="status"]',
};

/**
 * Resolve every target in the page (named element, or newest visible phrase in a scope), scroll the first
 * hidden one into view, and return { found, missing, moved }; the resolved targets are left in
 * window.__recPending for show() to put on screen.
 */
async function resolveTargets(page, targets) {
  return page.evaluate(
    ([targets, named, scopes, find, reveal]) => {
      const findPhrase = new Function(`return (${find})`)();
      const revealIfHidden = new Function(`return (${reveal})`)();
      const found = [];
      const missing = [];
      let moved = false;
      for (const target of targets) {
        let t = null;
        if (named[target]) t = [...document.querySelectorAll(named[target])].filter((e) => e.getBoundingClientRect().height > 0).at(-1) ?? null;
        else {
          const i = target.indexOf(":");
          if (target.slice(0, i) === "summary") {
            // The summary is a <textarea>, which has no text-node rects: mirror its text in an invisible div on top, range the matching sentence.
            const ta = document.querySelector('textarea[aria-label="Call summary"]');
            if (ta) {
              const host = ta.parentElement;
              host.style.position = "relative";
              let m = document.getElementById("rec-mirror");
              if (!m) { m = document.createElement("div"); m.id = "rec-mirror"; host.appendChild(m); }
              const cs = getComputedStyle(ta);
              Object.assign(m.style, { position: "absolute", left: ta.offsetLeft + "px", top: ta.offsetTop + "px", width: ta.offsetWidth + "px", height: ta.offsetHeight + "px", boxSizing: "border-box", padding: cs.padding, border: cs.border, font: cs.font, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing, whiteSpace: "pre-wrap", overflowWrap: "break-word", color: "transparent", pointerEvents: "none", overflow: "hidden" });
              m.textContent = ta.value;
              const re = new RegExp(target.slice(i + 1), "i");
              for (const sm of ta.value.matchAll(/[^.!?]+[.!?]+/g)) {
                if (re.test(sm[0])) {
                  const lead = sm[0].length - sm[0].trimStart().length;
                  const r = document.createRange();
                  r.setStart(m.firstChild, sm.index + lead);
                  r.setEnd(m.firstChild, sm.index + sm[0].length);
                  t = r;
                  break;
                }
              }
            }
          } else t = findPhrase([scopes[target.slice(0, i)], target.slice(i + 1)]);
        }
        if (!t) { missing.push(target); continue; }
        if (!moved) moved = revealIfHidden(t instanceof Range ? t.startContainer.parentElement : t);
        found.push(t);
      }
      window.__recPending = found;
      return { found: found.length, missing, moved };
    },
    [targets, NAMED, SCOPES, findPhrase.toString(), revealIfHidden.toString()],
  );
}

// Per segment: the count of numbered notes so far, and the last note (it stays faintly up, ghosted, under the next).
const notes = { n: 0, last: null };
const CAMERA_MS = 1300;
/** Hold on the closing card after the last line, so the video never ends on the final word. */
const END_HOLD_MS = 3000;

/**
 * point: underline/ring every target, plus (with a caption) a numbered note and an arrow beside them.
 * spot: the same marks with the rest of the screen dimmed, the camera pushed in on them and a callout card.
 * Held for at least `seconds`, then left up until the next action. A target that isn't on screen is
 * skipped with a log line, never failing the take.
 */
async function highlight(page, action) {
  const t0 = Date.now();
  await clearHighlight(page);
  const { missing, moved } = await resolveTargets(page, action.targets);
  for (const m of missing) console.log(`  ${action.type}: "${m}" not on screen`);
  if (moved) await sleep(SCROLL_SETTLE_MS);
  let state;
  if (action.type === "spot") {
    state = { spot: { kicker: action.kicker, headline: action.headline, bullets: action.bullets } };
    notes.last = null;
  } else if (action.label) {
    const note = { n: ++notes.n, text: action.label };
    state = { note, ghost: notes.last };
    notes.last = { ...note, targets: [] };
  } else state = {};
  await page.evaluate((st) => {
    const targets = window.__recPending;
    if (st.ghost) st.ghost.targets = window.__recLastTargets ?? [];
    if (st.note) window.__recLastTargets = targets;
    window.__recState = { ...st, targets };
    if (st.spot) window.__recAim();
  }, state);
  const left = action.seconds * 1000 - (Date.now() - t0);
  if (left > 0) await sleep(left);
}

/** Take every mark down and pull the camera back out (waiting for it, so the next action reads at 1x). */
async function clearHighlight(page) {
  const zoomed = await page.evaluate(() => { window.__recState = { targets: [] }; return window.__recUnaim?.() ?? false; });
  if (zoomed) await sleep(CAMERA_MS);
}

/** slide: a full-screen story card (kicker, title, sub, a timeline that builds in, footer), up for `seconds`. */
async function slide(page, a) {
  await showSlide(page, a);
  await sleep(a.seconds * 1000);
}

/** Put the slide on screen (kept if it is already up, so the opening slide can go up before capture starts). */
async function showSlide(page, a) {
  await page.evaluate((a) => {
    const old = document.getElementById("rec-slide");
    if (old?.dataset.arg === a.arg) return;
    old?.remove();
    const s = document.createElement("div");
    s.id = "rec-slide";
    s.dataset.arg = a.arg;
    const esc = (t) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    // *words* in the title are picked out in amber; a step whose time starts with * is "now".
    const title = esc(a.title).replace(/\*(.+?)\*/g, "<em>$1</em>");
    const steps = a.steps.map((st, i) => {
      const now = st.when.startsWith("*");
      return `<div class="st${now ? " now" : ""}" style="animation-delay:${1.4 + i * 0.7}s"><div class="dot">${i + 1}</div><div class="t">${esc(st.when.replace(/^\*/, ""))}</div><div class="d">${esc(st.text)}</div></div>`;
    }).join("");
    s.innerHTML = `<div class="k">${esc(a.kicker)}</div><h1>${title}</h1><div class="sub">${esc(a.sub)}</div><div class="tl">${steps}</div><div class="foot">${esc(a.footer)}</div>`;
    document.getElementById("rec-root").appendChild(s);
  }, a);
}

/** Fade the story slide out, if one is up. */
async function hideSlide(page) {
  const up = await page.evaluate(() => {
    const s = document.getElementById("rec-slide");
    if (!s) return false;
    s.classList.add("out");
    setTimeout(() => s.remove(), 800);
    return true;
  });
  if (up) await sleep(800);
}

const sf = (...a) => JSON.parse(execFileSync("sf", [...a, "-o", ORG, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
const ids = (soql) => sf("data", "query", "-q", soql).result.records.map((r) => r.Id);

/** Off camera: delete the "Follow up:" Tasks that Approve wrote today on the featured customer. */
function reset() {
  const tasks = ids(`SELECT Id FROM Task WHERE WhatId = '${HERO}' AND Subject LIKE 'Follow up:%' AND CreatedDate = TODAY`);
  for (const id of tasks) sf("data", "delete", "record", "-s", "Task", "-i", id);
  console.log(`reset: ${tasks.length} tasks deleted`);
}

/** One-time frontdoor login straight onto the Growth page (the URL carries a session, so it is never logged). */
async function login(page) {
  // The frontdoor only serves core paths, so sign in to Lightning first, then open the App Domain.
  const url = sf("org", "open", "--url-only", "--path", "/lightning/page/home").result.url;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/lightning\.force\.com\/lightning/, { timeout: LOAD_TIMEOUT_MS });
  await page.goto(APP_URL + PAGE_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/salesforce\.app\/app\/c__ReactRetailV2/, { timeout: LOAD_TIMEOUT_MS });
  // The story is Justin Chen's book. Pick it in the "View as" selector, off camera.
  const opt = page.locator("option", { hasText: VIEW_AS }).first();
  await opt.waitFor({ state: "attached", timeout: LOAD_TIMEOUT_MS });
  await page.locator('select[aria-label="View the cockpit as"]').selectOption({ label: await opt.innerText() });
}

/** Today is ready when the priority queue has rows and the brief has stopped loading (best effort). */
async function openToday(page) {
  await page.locator('[aria-label="Ranked customer work"] button').first().waitFor({ timeout: LOAD_TIMEOUT_MS });
  await page.getByText("Loading source records…").first().waitFor({ state: "hidden", timeout: 30_000 }).catch(() => {});
  await sleep(1500);
  await page.evaluate(() => scrollTo({ top: 0 }));
}

/** The responders view is ready when the ranked list has rows (the list reads Data 360, so allow time). */
async function openResponders(page) {
  await page.locator(NAMED.top).waitFor({ timeout: LOAD_TIMEOUT_MS });
  await page.evaluate(() => scrollTo({ top: 0 }));
}

/** Click a main-nav link by its label and wait for the page heading to change. */
async function nav(page, label) {
  await page.evaluate(() => scrollTo({ top: 0, behavior: "smooth" }));
  await sleep(400);
  await click(page, page.locator(`${NAMED.nav} a`).filter({ hasText: new RegExp(`^${label}$`) }).first());
  if (label === "Growth") await page.getByRole("button", { name: "Campaign responders" }).waitFor({ timeout: LOAD_TIMEOUT_MS });
  await sleep(1200);
}

/** Click a Growth tab by its label (e.g. "Campaign responders") and wait for that view. */
async function tab(page, label) {
  await click(page, page.locator(`${NAMED.tabs} button`).filter({ hasText: label }).first());
  if (label === "Campaign responders") await openResponders(page);
  await sleep(600);
}

/** Click the campaign chip with this label (e.g. "Premier Checking"; "All" for the unfiltered list). */
async function chip(page, label) {
  await click(page, page.locator(`${NAMED.chips} button`).filter({ hasText: new RegExp(`^${label}\\b`) }).first());
  await sleep(1800);
}

/** Click the nth ranked responder (1-based) and wait for the detail pane to show that customer. */
async function row(page, n) {
  const btn = page.locator(`${NAMED.list} li:nth-child(${n}) button`);
  const name = await btn.locator("strong").innerText();
  await click(page, btn);
  await page.locator(`${NAMED.detail} h3`, { hasText: name }).waitFor({ timeout: LOAD_TIMEOUT_MS });
  await sleep(500);
}

/** Open the review form (the "Review recommended action" button). */
async function review(page) {
  await click(page, page.getByRole("button", { name: "Review recommended action" }));
  await page.locator(NAMED.form).waitFor({ timeout: LOAD_TIMEOUT_MS });
  await page.locator(NAMED.form).evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await sleep(SCROLL_SETTLE_MS);
}

/** Approve: click the form's submit button and wait for "Saved in Salesforce.". */
async function approve(page) {
  await click(page, page.locator(`${NAMED.form} button[type="submit"]`));
  const status = page.locator(NAMED.status).first();
  await status.waitFor({ timeout: LOAD_TIMEOUT_MS });
  const text = await status.innerText();
  if (!text.startsWith("Saved")) throw new Error(`approve: ${text}`);
  console.log(`  approve: ${text}`);
}

async function run(page, action) {
  const { type, arg } = action;
  // Any other action ends the current highlight; pauses don't change the screen, so it stays.
  if (!["point", "spot", "pause", "voice"].includes(type)) await clearHighlight(page);
  // The story slide goes at the first thing to watch.
  if (!["slide", "pause", "voice"].includes(type)) await hideSlide(page);
  switch (type) {
    case "nav":
      return nav(page, arg);
    case "tab":
      return tab(page, arg);
    case "chip":
      return chip(page, arg);
    case "row":
      return row(page, Number(arg));
    case "review":
      return review(page);
    case "approve":
      return approve(page);
    case "reload":
      await page.goto(page.url(), { waitUntil: "domcontentloaded" });
      return openToday(page);
    case "voice":
      return; // a timing mark only: the main loop records when it was reached
    case "pause":
      return sleep(Number(arg) * 1000);
    case "point":
    case "spot":
      return highlight(page, action);
    case "slide":
      return slide(page, action);
    case "card":
      return page.evaluate((text) => {
        const card = document.getElementById("rec-card");
        const [head, sub] = text.split(" | "); // "headline | amber sub-line"
        card.textContent = head;
        if (sub) card.append(Object.assign(document.createElement("span"), { className: "sub", textContent: sub }));
        card.style.opacity = "1";
      }, arg);
    default:
      throw new Error(`unhandled action "${type}"`);
  }
}

async function main() {
  const { track, out, voice, measured } = args();
  const segments = parseTalkTrack(readFileSync(track, "utf8")); // fails on unknown actions before anything runs
  if (voice) applyVoiceTiming(segments, JSON.parse(readFileSync(voice, "utf8"))); // fails on stale clips, too
  if (measured && existsSync(measured)) applyMeasuredTiming(segments, JSON.parse(readFileSync(measured, "utf8")));
  mkdirSync(out, { recursive: true });
  reset();
  // CHROMIUM_PATH: an already-installed Chromium when the bundled Playwright build isn't downloaded.
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await browser.newContext({ viewport: CAPTURE });
  await ctx.addInitScript(overlay, { zoom: ZOOM });
  const page = await ctx.newPage();

  // 4K capture: Chrome's screencast frames (JPEG, device px) resampled to a constant FPS by wall clock,
  // piped into ffmpeg. Wall-clock pacing keeps the video in step with timing.json and the voice track.
  const videoPath = join(out, "demo.mp4");
  const encoder = process.platform === "darwin"
    ? ["-c:v", "h264_videotoolbox", "-b:v", VIDEO_BITRATE, "-maxrate", VIDEO_BITRATE, "-profile:v", "high"]
    : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "16"];
  const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    ...encoder, "-vf", `scale=${CAPTURE.width}:${CAPTURE.height}:flags=lanczos`, "-pix_fmt", "yuv420p", "-r", String(FPS), videoPath], { stdio: ["pipe", "inherit", "inherit"] });
  const ffDone = new Promise((res, rej) => ff.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)))));
  // Login and the Today page load before capture starts, so the video opens on the first segment.
  await login(page);
  await openToday(page);
  // A track that opens on a slide shows it from the very first frame.
  const opening = segments[0]?.actions[0];
  if (opening?.type === "slide") await showSlide(page, opening);
  const cdp = await ctx.newCDPSession(page);
  let latest = null;
  let offSize = 0;
  cdp.on("Page.screencastFrame", (f) => {
    latest = Buffer.from(f.data, "base64");
    // Chrome can shrink screencast frames under load; ffmpeg scales every frame back to CAPTURE, and
    // the count is reported so a soft take is visible.
    const [w, h] = jpegSize(latest);
    if (w !== CAPTURE.width || h !== CAPTURE.height) offSize++;
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: JPEG_QUALITY, maxWidth: CAPTURE.width, maxHeight: CAPTURE.height });
  const t0 = Date.now();
  let written = 0;
  const pump = setInterval(() => {
    const due = Math.floor(((Date.now() - t0) * FPS) / 1000);
    while (latest && written < due) { ff.stdin.write(latest); written++; }
  }, 1000 / FPS / 2);

  const timing = [];
  for (const seg of segments) {
    const start = Date.now();
    const startMs = start - t0;
    console.log(`${seg.id} ${seg.title}`);
    Object.assign(notes, { n: 0, last: null });
    let pointMs = 0;
    let voiceAtMs = 0;
    for (const action of seg.actions) {
      const a0 = Date.now();
      if (action.type === "voice") voiceAtMs = a0 - start;
      await run(page, action);
      if (HELD.has(action.type)) pointMs += Date.now() - a0;
    }
    const actionsMs = Date.now() - start;
    const remaining = seg.seconds * 1000 - (Date.now() - start);
    let overrunMs = 0;
    if (remaining > 0) await sleep(remaining);
    else {
      overrunMs = Math.round(-remaining);
      console.log(`${seg.id} overran by ${(overrunMs / 1000).toFixed(1)} s`);
    }
    timing.push({ id: seg.id, startMs, seconds: seg.seconds, overrunMs, actionsMs, pointMs, voiceAtMs });
  }
  await sleep(END_HOLD_MS); // let the last word and the closing card land before the video ends
  const totalMs = Date.now() - t0;

  clearInterval(pump);
  await cdp.send("Page.stopScreencast").catch(() => {});
  ff.stdin.end();
  await ffDone;
  await browser.close();
  reset();
  writeFileSync(join(out, "timing.json"), `${JSON.stringify(timing, null, 2)}\n`);
  writeFileSync(join(out, "narration.srt"), toSrt(segments, timing.map((t) => t.startMs + t.voiceAtMs)));
  if (offSize) console.log(`capture: ${offSize} of ${written} frames arrived smaller than ${CAPTURE.width}x${CAPTURE.height} and were scaled up`);
  console.log(`done: ${(totalMs / 1000).toFixed(1)} s, ${segments.length} cues, ${CAPTURE.width}x${CAPTURE.height} -> ${videoPath}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
