(() => {
'use strict';

/* =========================================================================
   Slitscanner — web edition
   A slit-scan camera by Eduardo Morais (www.eduardomorais.pt), after the
   Processing sketch and its LÖVE 11 port, dressed as Videolab hardware.

   The picture is a W × 720 canvas. Every source frame (or every Nth, with
   SPEED) copies a slit — 1 to 8 columns or rows of the source — into it:
     STATIC  a write head sweeps across a still picture
     SCROLL  the picture moves and the new band enters at one edge
   Sources: the camera (getUserMedia), a video file from the computer, or a
   moving test card. All drawing is Canvas 2D; nothing leaves the browser.
   ========================================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const store = {
  get(k, d) { try { const v = localStorage.getItem('slitscanner:' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('slitscanner:' + k, JSON.stringify(v)); } catch (e) {} }
};

const OUTPUTS = [
  { name: '4:3',  w: 960,  h: 720 },
  { name: '16:9', w: 1280, h: 720 },
  { name: '2:1',  w: 1440, h: 720 }
];
const WIDTHS = [1, 2, 4, 8];
const RATES = [0.25, 0.5, 1, 2, 4];
const RATE_CAP = ['¼×', '½×', '1×', '2×', '4×'];
const RES = [
  { name: '480', w: 640, h: 480 },
  { name: '720', w: 1280, h: 720 },
  { name: '1080', w: 1920, h: 1080 }
];
const MAX_STEPPING = 100;
const TEST_FPS = 30;
const SRC_MAX_W = 1920, SRC_MAX_H = 1080;

/* ---------------------------------------------------------------------
   STATE — settings are range-checked on load, so a stale or hand-edited
   store can never put the scanner in a state it can't run in
   --------------------------------------------------------------------- */
const saved = store.get('settings', {}) || {};
const int = (v, a, b, d) => (Number.isInteger(v) && v >= a && v <= b) ? v : d;
const num = (v, a, b, d) => (typeof v === 'number' && isFinite(v) && v >= a && v <= b) ? v : d;
const bool = (v, d) => typeof v === 'boolean' ? v : d;

const st = {
  source: 'test',
  still: false,
  stepping: int(saved.stepping, 1, MAX_STEPPING, 1),
  scroll: bool(saved.scroll, false),
  motion: saved.motion === 1 ? 1 : -1,          // -1 left, 1 right: which way the picture goes
  vertical: bool(saved.vertical, false),        // false reads a column, true a row
  widthIdx: int(saved.widthIdx, 0, 3, 0),
  slit: num(saved.slit, 0, 1, 0.5),             // slit position, fraction of the source
  out: int(saved.out, 0, 2, 1),
  vf: bool(saved.vf, true),
  osd: bool(saved.osd, true),
  mirror: bool(saved.mirror, false),
  flip: bool(saved.flip, false),
  rateIdx: int(saved.rateIdx, 0, 4, 2),
  loop: bool(saved.loop, true),
  res: int(saved.res, 0, 2, 1),
  deviceId: typeof saved.deviceId === 'string' ? saved.deviceId : null,
  snap: int(store.get('snap', 1), 1, 99999, 1),
  setup: false,
  clean: false
};
function persist() {
  store.set('settings', {
    stepping: st.stepping, scroll: st.scroll, motion: st.motion, vertical: st.vertical,
    widthIdx: st.widthIdx, slit: st.slit, out: st.out, vf: st.vf, osd: st.osd,
    mirror: st.mirror, flip: st.flip, rateIdx: st.rateIdx, loop: st.loop, res: st.res, deviceId: st.deviceId
  });
}

/* ---------------------------------------------------------------------
   THE SLIT-SCAN BUFFER
   --------------------------------------------------------------------- */
const buf = document.createElement('canvas');
const bctx = buf.getContext('2d', { alpha: false });
const tmp = document.createElement('canvas');
const tctx = tmp.getContext('2d', { alpha: false });
let W = 0, H = 0;
let pos = 0;            // static mode: the write head (left edge of the next or last band)
let written = 0;        // columns laid down since the last clear, for FILL
let cycle = 0;          // source frames seen while scanning, for SPEED
let scanTime = 0;       // seconds spent scanning, for the timecode

function allocOutput() {
  const o = OUTPUTS[st.out];
  W = o.w; H = o.h;
  buf.width = W; buf.height = H; tmp.width = W; tmp.height = H;
  clearPicture();
}
function clearPicture() {
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.fillStyle = '#000'; bctx.fillRect(0, 0, W, H);
  pos = st.motion > 0 ? 0 : W;
  written = 0; cycle = 0; scanTime = 0;
  preroll = 0;
}
let preroll = 0;        // test-signal frames still to fast-forward at startup

/* the oriented source frame (mirror / flip applied), capped at 1920 × 1080 */
const srcC = document.createElement('canvas');
const sctx2 = srcC.getContext('2d', { alpha: false });
let srcW = 0, srcH = 0, srcReady = false;

function grabSource(el, w, h) {
  if (!w || !h) return false;
  const s = Math.min(1, SRC_MAX_W / w, SRC_MAX_H / h);
  const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
  if (srcC.width !== cw || srcC.height !== ch) { srcC.width = cw; srcC.height = ch; vfDirty = true; }
  sctx2.setTransform(st.mirror ? -1 : 1, 0, 0, st.flip ? -1 : 1, st.mirror ? cw : 0, st.flip ? ch : 0);
  sctx2.imageSmoothingEnabled = true; sctx2.imageSmoothingQuality = 'high';
  try { sctx2.drawImage(el, 0, 0, cw, ch); } catch (e) { sctx2.setTransform(1, 0, 0, 1, 0, 0); return false; }
  sctx2.setTransform(1, 0, 0, 1, 0, 0);
  if (srcW !== cw || srcH !== ch) { srcW = cw; srcH = ch; layoutViewfinder(); }
  srcReady = true;
  return true;
}

/* the band a slit of width n covers, kept inside the frame */
function slitBand(n) {
  const len = st.vertical ? srcH : srcW;
  const m = Math.max(1, Math.min(n, len));
  const a = clamp(Math.floor(st.slit * len) - Math.floor(m / 2), 0, len - m);
  return [a, m];
}

/* copy the slit into the picture with its left edge at dx */
function stampAt(dx, n) {
  bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = 'high';
  const [a] = slitBand(n);
  if (!st.vertical) {
    bctx.drawImage(srcC, a, 0, n, srcH, dx, 0, n, H);
  } else {
    // a row of the source, stood on its end: the source's first row lands
    // on the band's right edge and its left end at the top of the picture
    bctx.save();
    bctx.translate(dx + n, 0);
    bctx.rotate(Math.PI / 2);
    bctx.drawImage(srcC, 0, a, srcW, n, 0, 0, H, n);
    bctx.restore();
  }
}

function step() {
  if (!srcReady) return;
  const n = Math.max(1, Math.min(WIDTHS[st.widthIdx], st.vertical ? srcH : srcW, W));
  if (st.scroll) {
    tctx.drawImage(buf, 0, 0);
    bctx.imageSmoothingEnabled = false;
    if (st.motion < 0) { bctx.drawImage(tmp, n, 0, W - n, H, 0, 0, W - n, H); stampAt(W - n, n); }
    else { bctx.drawImage(tmp, 0, 0, W - n, H, n, 0, W - n, H); stampAt(0, n); }
  } else if (st.motion > 0) {
    if (pos + n > W) pos = 0;
    stampAt(pos, n); pos += n;
  } else {
    pos -= n;
    if (pos < 0) pos = W - n;
    stampAt(pos, n);
  }
  written += n;
}

/* every source frame lands here */
function onSourceFrame(el, w, h) {
  if (!grabSource(el, w, h)) return;
  if (st.still) return;
  cycle++;
  if (cycle % st.stepping === 0) step();
}

/* ---------------------------------------------------------------------
   TEST SIGNAL — Videolab's test card, 960 × 540, with a spinning wheel,
   a swinging ball and a running clock to give the slit something to record
   --------------------------------------------------------------------- */
const test = (() => {
  const TW = 960, TH = 540;
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const x = c.getContext('2d');
  const stc = document.createElement('canvas'); stc.width = TW; stc.height = TH;
  let built = false;
  const CX = 480, CY = 270, R = 236;

  function buildStatic() {
    const g = stc.getContext('2d');
    g.fillStyle = '#4b4f54'; g.fillRect(0, 0, TW, TH);
    g.strokeStyle = '#e4e6e8'; g.lineWidth = 2;
    g.beginPath();
    for (let gx = 60; gx < TW; gx += 60) { g.moveTo(gx, 0); g.lineTo(gx, TH); }
    for (let gy = 60; gy < TH; gy += 60) { g.moveTo(0, gy); g.lineTo(TW, gy); }
    g.stroke();
    g.fillStyle = '#fff';
    const tri = (p) => { g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[2], p[3]); g.lineTo(p[4], p[5]); g.closePath(); g.fill(); };
    tri([CX - 14, 0, CX + 14, 0, CX, 18]); tri([CX - 14, TH, CX + 14, TH, CX, TH - 18]);
    tri([0, CY - 14, 0, CY + 14, 18, CY]); tri([TW, CY - 14, TW, CY + 14, TW - 18, CY]);
    const box = (bx, by, bw, bh, bg) => { g.fillStyle = bg; g.fillRect(bx, by, bw, bh); };
    box(36, 78, 168, 120, '#1838ff');
    box(36, 222, 168, 120, '#b0109a');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 72px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillStyle = '#ff2a1a'; g.fillText('RGB', 120, 140);
    g.fillStyle = '#ffe600'; g.fillText('YUV', 120, 284);
    ['#f3cfb3', '#c98c63', '#7a4a2a'].forEach((col, i) => box(36 + i * 56, 366, 56, 96, col));
    g.fillStyle = '#1c1e20'; g.fillRect(756, 72, 168, 132);
    ['#6fa8dc', '#4f7d2e', '#d8c38a', '#f08a4b', '#7b4fa8', '#2fb8c2'].forEach((col, i) => box(756 + (i % 3) * 56, 222 + Math.floor(i / 3) * 60, 56, 60, col));
    const sky = g.createLinearGradient(0, 366, 0, 462);
    sky.addColorStop(0, '#163a78'); sky.addColorStop(1, '#a9d0f5');
    g.fillStyle = sky; g.fillRect(756, 366, 168, 96);
    g.save();
    g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#26292c'; g.fillRect(CX - R, CY - R, R * 2, R * 2);
    g.fillStyle = '#000'; g.fillRect(CX - R, 50, R * 2, 62);
    g.fillStyle = '#fff'; g.font = '700 44px "Barlow Condensed", "Arial Narrow", sans-serif';
    g.fillText('SLITSCANNER', CX, 83);
    const bars = ['#bfbfbf', '#bfbf00', '#00bfbf', '#00bf00', '#bf00bf', '#bf0000', '#0000bf'];
    const bw = (R * 2) / 7;
    bars.forEach((col, i) => { g.fillStyle = col; g.fillRect(CX - R + i * bw, 112, bw + 1, 110); });
    for (let i = 0; i < 11; i++) { const v = Math.round(i * 25.5); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(CX - R + i * (R * 2 / 11), 222, R * 2 / 11 + 1, 48); }
    const ramp = g.createLinearGradient(CX - R + 30, 0, CX + R - 30, 0);
    ramp.addColorStop(0, '#000'); ramp.addColorStop(1, '#fff');
    g.fillStyle = ramp; g.fillRect(CX - R, 270, R * 2, 42);
    g.fillStyle = '#000'; g.fillRect(CX - R, 312, R * 2, 60);
    [16, 10, 6, 4, 3, 2].forEach((p, i) => {
      const x0 = Math.round(270 + i * (62 + 9.6));
      g.fillStyle = '#fff';
      for (let xx = x0; xx < x0 + 62; xx += p) g.fillRect(xx, 316, Math.min(Math.ceil(p / 2), x0 + 62 - xx), 52);
    });
    g.fillStyle = '#000'; g.fillRect(CX - R, 372, R * 2, 52);
    g.fillStyle = '#fff';
    for (let yy = 374; yy < 422; yy += 2) g.fillRect(CX - R, yy, R, 1);
    for (let yy = 374; yy < 422; yy += 4) g.fillRect(CX, yy, R, 2);
    g.fillStyle = '#000'; g.fillRect(CX - R, 424, R * 2, 90);
    g.restore();
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2); g.stroke();
    built = true;
  }

  function dynamic(t) {
    const wx = 840, wy = 138, wr = 58, a0 = t * Math.PI * 1.5;
    x.fillStyle = '#0d0e0f'; x.beginPath(); x.arc(wx, wy, wr + 4, 0, Math.PI * 2); x.fill();
    x.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = a0 + i * Math.PI / 6;
      x.strokeStyle = i === 0 ? '#ff2a1a' : '#f2f2f2'; x.lineWidth = i === 0 ? 7 : 5;
      x.beginPath(); x.moveTo(wx + Math.cos(a) * 9, wy + Math.sin(a) * 9); x.lineTo(wx + Math.cos(a) * wr, wy + Math.sin(a) * wr); x.stroke();
    }
    x.fillStyle = '#f2f2f2'; x.beginPath(); x.arc(wx, wy, 8, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#f2f2f2'; x.lineWidth = 3; x.beginPath(); x.arc(wx, wy, wr + 2, 0, Math.PI * 2); x.stroke();
    const mm = Math.floor(t / 60), ss = t - mm * 60;
    x.fillStyle = '#fff'; x.font = '40px VT323, "Courier New", monospace';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(mm).padStart(2, '0') + ':' + ss.toFixed(3).padStart(6, '0'), CX, 446);
    // the ball swings across the whole card, so a central slit catches it twice a cycle
    const bx = CX + 410 * Math.sin(2 * Math.PI * t / 2.4), by = 486, br = 24;
    const grd = x.createRadialGradient(bx - 8, by - 8, 2, bx, by, br);
    grd.addColorStop(0, '#fff8b0'); grd.addColorStop(.45, '#ffd21a'); grd.addColorStop(1, '#e85a00');
    x.fillStyle = grd; x.beginPath(); x.arc(bx, by, br, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#111'; x.lineWidth = 2; x.stroke();
    // an amber line rising and falling inside the circle: a column slit turns
    // it into a sine wave; the edge tabs follow it for row slits
    const py = CY + 200 * Math.sin(2 * Math.PI * t / 3.1);
    const half = Math.sqrt(Math.max(0, R * R - (py - CY) * (py - CY)));
    x.fillStyle = '#ffb340'; x.fillRect(CX - half, py - 7, half * 2, 14);
    x.fillStyle = '#7a3d00'; x.fillRect(CX - half, py + 7, half * 2, 2);
    x.fillStyle = 'rgba(255,179,64,.92)'; x.fillRect(0, py - 5, 30, 10); x.fillRect(TW - 30, py - 5, 30, 10);
  }

  return {
    w: TW, h: TH, canvas: c,
    rebuild() { built = false; },
    frame(t) {
      if (!built) buildStatic();
      x.drawImage(stc, 0, 0); dynamic(t);
      return c;
    }
  };
})();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => test.rebuild());

/* ---------------------------------------------------------------------
   SOURCES
   --------------------------------------------------------------------- */
const pool = $('#media-pool');
const vid = document.createElement('video');
vid.muted = true; vid.playsInline = true; vid.preload = 'auto'; vid.loop = st.loop;
const cam = document.createElement('video');
cam.muted = true; cam.playsInline = true; cam.autoplay = true;
pool.append(vid, cam);

let srcGen = 0;
let camStream = null, camTrack = null, camCaps = {}, camInitial = {}, devices = [];
let fileURL = null, fileName = '', fileReady = false;
let frameDur = 0, lastMediaTime = null, pendingStep = false;
const HAS_RVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
let pollT = { file: -1, camera: -1 }, pollAcc = 0;

function watchVideo(el, kind) {
  const gen = srcGen;
  if (!HAS_RVFC) return;            // polled in the frame loop instead
  const cb = (now, meta) => {
    if (gen !== srcGen || st.source !== kind) return;
    videoFrame(el, kind, meta);
    el.requestVideoFrameCallback(cb);
  };
  el.requestVideoFrameCallback(cb);
}
function videoFrame(el, kind, meta) {
  if (!el.videoWidth) return;
  if (kind === 'file' && meta && typeof meta.mediaTime === 'number') {
    if (lastMediaTime !== null) {
      const d = meta.mediaTime - lastMediaTime;
      // the shortest forward gap seen is one frame (frames can be dropped, never halved)
      if (d > 0.004 && d < 0.25 && !vid.paused) frameDur = frameDur ? Math.min(frameDur, d) : d;
    }
    lastMediaTime = meta.mediaTime;
  }
  onSourceFrame(el, el.videoWidth, el.videoHeight);
}

function stopCamera() {
  if (camStream) camStream.getTracks().forEach(t => t.stop());
  camStream = null; camTrack = null; cam.srcObject = null;
}

function setSource(s) {
  if (s !== 'camera') stopCamera();
  if (s !== 'file') vid.pause();
  st.source = s; srcGen++; srcReady = false;
  pollT.file = -1; pollT.camera = -1;
  if (s === 'file') { applyFilePlayback(); watchVideo(vid, 'file'); }
  if (s === 'camera') watchVideo(cam, 'camera');
  layoutViewfinder();
  sync();
  renderPanel();
}

function applyFilePlayback() {
  vid.loop = st.loop;
  vid.playbackRate = RATES[st.rateIdx];
  if (st.source !== 'file') return;
  if (st.still) vid.pause();
  else vid.play().catch(() => {});
}

const IN_VIEWER = !!(window.claude && window.claude.use);

async function startCamera(opts = {}) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    message('NO CAMERA HERE', IN_VIEWER
      ? 'This view can\'t open a camera. Open the standalone Slitscanner page in a browser, or load a video file.'
      : 'This browser offers no camera on this page. Open it over https or from a file, or load a video file.', 8000);
    return false;
  }
  message('CAMERA', 'Asking for the camera…', 0);
  const r = RES[st.res];
  const base = { width: { ideal: r.w }, height: { ideal: r.h }, frameRate: { ideal: 30 } };
  const want = opts.deviceId !== undefined ? opts.deviceId : st.deviceId;
  let stream = null, err = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: want ? { ...base, deviceId: { exact: want } } : base, audio: false });
  } catch (e) {
    err = e;
    if (want && (e.name === 'OverconstrainedError' || e.name === 'NotFoundError' || e.name === 'NotReadableError')) {
      try { stream = await navigator.mediaDevices.getUserMedia({ video: base, audio: false }); err = null; } catch (e2) { err = e2; }
    }
  }
  if (!stream) {
    const n = err && err.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') {
      message('CAMERA BLOCKED', IN_VIEWER
        ? 'This view can\'t open a camera. Open the standalone Slitscanner page in a browser, or load a video file.'
        : 'Camera permission was refused. Allow the camera for this page in the browser, or load a video file.', 9000);
    } else if (n === 'NotFoundError' || n === 'OverconstrainedError') {
      message('NO CAMERA', 'No camera was found. Plug one in and press CAMERA again, or load a video file.', 8000);
    } else if (n === 'NotReadableError') {
      message('CAMERA BUSY', 'Another app is using the camera. Close it and press CAMERA again.', 8000);
    } else {
      message('CAMERA ERROR', 'The camera didn\'t start' + (err && err.message ? ': ' + err.message : '.'), 8000);
    }
    sync();
    return false;
  }
  stopCamera();
  camStream = stream;
  camTrack = stream.getVideoTracks()[0] || null;
  cam.srcObject = stream;
  try { await cam.play(); } catch (e) {}
  if (camTrack) {
    const set = camTrack.getSettings ? camTrack.getSettings() : {};
    if (set.deviceId) st.deviceId = set.deviceId;
    camTrack.addEventListener('ended', () => {
      if (st.source === 'camera' && camTrack && camTrack.readyState === 'ended') {
        message('CAMERA LOST', 'The camera stopped. Scanning the test signal instead.', 6000);
        setSource('test');
      }
    });
  }
  probeCamera(true);
  await listDevices();
  persist();
  setSource('camera');
  hideMsg();
  message('', 'Scanning ' + cameraLabel(), 3000, true);
  return true;
}

async function listDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    devices = all.filter(d => d.kind === 'videoinput');
  } catch (e) { devices = []; }
}
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', async () => { await listDevices(); renderPanel(); });
}
function cameraLabel() {
  if (!camTrack) return 'the camera';
  const id = camTrack.getSettings ? camTrack.getSettings().deviceId : null;
  const i = devices.findIndex(d => d.deviceId === id);
  const name = camTrack.label || (i >= 0 && devices[i].label) || '';
  return name ? name : 'camera ' + (i + 1);
}

/* camera image controls: the browser reports which ones a camera has */
const CAM_PROPS = [
  ['exposureCompensation', 'EXPOSURE ±', 'exposureMode'],
  ['exposureTime', 'SHUTTER', 'exposureMode'],
  ['iso', 'ISO', 'exposureMode'],
  ['brightness', 'BRIGHTNESS'],
  ['contrast', 'CONTRAST'],
  ['saturation', 'SATURATION'],
  ['sharpness', 'SHARPNESS'],
  ['colorTemperature', 'WHITE BAL', 'whiteBalanceMode'],
  ['focusDistance', 'FOCUS', 'focusMode'],
  ['zoom', 'ZOOM']
];
function probeCamera(keepInitial) {
  camCaps = {};
  if (!camTrack) return;
  try { camCaps = camTrack.getCapabilities ? camTrack.getCapabilities() || {} : {}; } catch (e) { camCaps = {}; }
  if (keepInitial) { try { camInitial = { ...(camTrack.getSettings() || {}) }; } catch (e) { camInitial = {}; } }
}
const camSettings = () => { try { return camTrack ? camTrack.getSettings() || {} : {}; } catch (e) { return {}; } };
const hasRange = (p) => { const c = camCaps[p]; return c && typeof c.min === 'number' && typeof c.max === 'number' && c.max > c.min; };
const hasAuto = (m) => Array.isArray(camCaps[m]) && camCaps[m].includes('continuous') && camCaps[m].includes('manual');
let camApply = Promise.resolve();
function camConstrain(c) {
  if (!camTrack || !camTrack.applyConstraints) return Promise.resolve(false);
  camApply = camApply.then(() => camTrack.applyConstraints({ advanced: [c] })).then(() => true, () => false);
  return camApply;
}

/* ---------------------------------------------------------------------
   VIDEO FILES
   --------------------------------------------------------------------- */
function isVideoFile(f) {
  return (f.type || '').startsWith('video/') || /\.(mp4|m4v|webm|mov|mkv|ogv|ogg|avi|3gp)$/i.test(f.name || '');
}
function loadFile(f) {
  if (!f) return;
  if (!isVideoFile(f)) { message('NOT A VIDEO', (f.name || 'That file') + ' isn\'t a video. Load an MP4, WebM or MOV file.', 7000); return; }
  if (fileURL) URL.revokeObjectURL(fileURL);
  fileURL = URL.createObjectURL(f);
  fileName = f.name || 'video';
  fileReady = false; frameDur = 0; lastMediaTime = null; pendingStep = false;
  message('LOADING', fileName, 0);
  vid.onloadeddata = () => {
    vid.onloadeddata = null;
    fileReady = true;
    setSource('file');
    hideMsg();
    message('', 'Loaded ' + fileName, 3500, true);
  };
  vid.onerror = () => {
    vid.onloadeddata = null;
    fileReady = false;
    message('CAN\'T PLAY THIS FILE', 'This browser can\'t decode ' + fileName + '. Try an MP4 (H.264) or WebM file.', 9000);
    if (st.source === 'file') setSource('test'); else sync();
  };
  vid.src = fileURL;
  vid.load();
}
vid.addEventListener('ended', () => {
  if (st.source === 'file' && !st.loop) { st.still = true; sync(); message('END OF TAPE', 'Press STILL to play again from the start.', 3500); }
});
vid.addEventListener('seeked', () => {
  if (st.source !== 'file' || !vid.videoWidth) return;
  if (pendingStep) {
    pendingStep = false;
    if (grabSource(vid, vid.videoWidth, vid.videoHeight)) step();
  } else if (vid.paused) {
    grabSource(vid, vid.videoWidth, vid.videoHeight);
  }
});
function frameStep(dir) {
  if (st.source !== 'file' || !fileReady) return;
  if (!st.still) { st.still = true; vid.pause(); sync(); }
  if (pendingStep) return;
  const d = frameDur || 1 / 30;
  const base = lastMediaTime !== null ? lastMediaTime : vid.currentTime;
  let k = Math.round(base / d) + dir;
  const last = Math.max(0, Math.floor((vid.duration || 0) / d) - 1);
  if (k < 0) k = st.loop ? last : 0;
  if (k > last) k = st.loop ? 0 : last;
  pendingStep = true;
  lastMediaTime = k * d;
  vid.currentTime = Math.min(k * d + d * 0.3, Math.max(0, (vid.duration || 0) - 0.001));
}
function rewind() {
  if (st.source !== 'file' || !fileReady) return;
  lastMediaTime = null;
  vid.currentTime = 0;
  message('', 'Back to the start of ' + fileName, 2500, true);
}
const fmtT = (t) => {
  if (!isFinite(t)) t = 0;
  const m = Math.floor(t / 60), s = t - m * 60;
  return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0');
};

/* ---------------------------------------------------------------------
   MONITOR + VIEWFINDER
   --------------------------------------------------------------------- */
const scr = $('#screen'), sctx = scr.getContext('2d', { alpha: false });
const screenWrap = $('#screen-wrap');
const vfEl = $('#vf'), vfc = $('#vfc'), vctx = vfc.getContext('2d', { alpha: false });
let vfDirty = true;

function fitCanvas(c, el) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.round(el.clientWidth * dpr)), h = Math.max(2, Math.round(el.clientHeight * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
}
let view = null;
function drawMonitor() {
  fitCanvas(scr, screenWrap);
  const SW = scr.width, SH = scr.height;
  sctx.fillStyle = '#000'; sctx.fillRect(0, 0, SW, SH);
  let cw = SW, ch = SW * H / W;
  if (ch > SH) { ch = SH; cw = SH * W / H; }
  const cx = (SW - cw) / 2, cy = (SH - ch) / 2;
  sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(buf, cx, cy, cw, ch);
  view = { cx, cy, cw, ch };
  // the write head of a static sweep: two small marks at the picture's edges
  if (st.osd && !st.clean && !st.scroll && srcReady) {
    const n = Math.min(WIDTHS[st.widthIdx], W);
    let hx = pos;
    if (st.motion > 0 && hx + n > W) hx = 0;
    const X = cx + hx * cw / W;
    const s = Math.max(5, SH / 70);
    sctx.fillStyle = '#ffb340';
    sctx.beginPath(); sctx.moveTo(X - s, cy); sctx.lineTo(X + s, cy); sctx.lineTo(X, cy + s * 1.3); sctx.closePath(); sctx.fill();
    sctx.beginPath(); sctx.moveTo(X - s, cy + ch); sctx.lineTo(X + s, cy + ch); sctx.lineTo(X, cy + ch - s * 1.3); sctx.closePath(); sctx.fill();
  }
}

function layoutViewfinder() {
  const sw = screenWrap.clientWidth, sh = screenWrap.clientHeight;
  if (!sw || !sh) return;
  const a = srcW && srcH ? srcW / srcH : 16 / 9;
  let h = Math.min(sh * 0.4, (sw * 0.27) / a);
  h = Math.max(h, Math.min(64, sh * 0.5));
  const w = h * a;
  vfEl.style.setProperty('--vf-w', Math.round(w) + 'px');
  vfEl.style.setProperty('--vf-a', a.toFixed(4));
  vfDirty = true;
}
function drawViewfinder() {
  if (vfEl.hidden) return;
  fitCanvas(vfc, vfEl);
  const VW = vfc.width, VH = vfc.height;
  vctx.fillStyle = '#000'; vctx.fillRect(0, 0, VW, VH);
  if (!srcReady) return;
  vctx.imageSmoothingEnabled = true;
  vctx.drawImage(srcC, 0, 0, VW, VH);
  const n = Math.min(WIDTHS[st.widthIdx], st.vertical ? srcH : srcW);
  const [a, m] = slitBand(n);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const lw = Math.max(2 * dpr, (st.vertical ? VH / srcH : VW / srcW) * m);
  vctx.fillStyle = 'rgba(255,59,47,.25)';
  vctx.strokeStyle = '#ff3b2f';
  vctx.shadowColor = 'rgba(255,59,47,.9)'; vctx.shadowBlur = 6 * dpr;
  if (!st.vertical) {
    const X = (a + m / 2) / srcW * VW;
    vctx.fillStyle = '#ff3b2f'; vctx.fillRect(X - lw / 2, 0, lw, VH);
  } else {
    const Y = (a + m / 2) / srcH * VH;
    vctx.fillStyle = '#ff3b2f'; vctx.fillRect(0, Y - lw / 2, VW, lw);
  }
  vctx.shadowBlur = 0;
}
function slitFromEvent(e) {
  const r = vfEl.getBoundingClientRect();
  const f = st.vertical ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
  setSlit(f);
}
function setSlit(f) {
  st.slit = clamp(f, 0, 1);
  persist(); syncPos();
}
function nudgeSlit(dir, big) {
  const len = (st.vertical ? srcH : srcW) || 1000;
  const px = big ? Math.max(1, Math.round(len / 20)) : 1;
  const cur = Math.floor(st.slit * len);
  setSlit((clamp(cur + dir * px, 0, len - 1) + 0.5) / len);
}
let vfDrag = null;
vfEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  vfDrag = e.pointerId;
  try { vfEl.setPointerCapture(e.pointerId); } catch (_) {}
  vfEl.classList.add('dragging');
  slitFromEvent(e);
});
vfEl.addEventListener('pointermove', (e) => { if (vfDrag === e.pointerId) slitFromEvent(e); });
const vfEnd = (e) => { if (vfDrag === e.pointerId) { vfDrag = null; vfEl.classList.remove('dragging'); } };
vfEl.addEventListener('pointerup', vfEnd);
vfEl.addEventListener('pointercancel', vfEnd);
vfEl.addEventListener('wheel', (e) => { e.preventDefault(); nudgeSlit(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1, e.shiftKey); }, { passive: false });

/* ---------------------------------------------------------------------
   MESSAGES, OSD AND VFD
   --------------------------------------------------------------------- */
const osdMsg = $('#osd-msg');
let msg = { text: '', at: -1e9 }, osdUntil = 0, tipText = '';
function message(title, body, ms = 2600, statusOnly = false) {
  msg = { text: body || title, at: performance.now() };
  if (statusOnly) return;
  osdMsg.innerHTML = '';
  if (title) { const s = document.createElement('strong'); s.textContent = title; osdMsg.append(s); }
  if (body) osdMsg.append(document.createTextNode(body));
  osdMsg.hidden = false;
  osdUntil = ms > 0 ? performance.now() + ms : Infinity;
}
function hideMsg() { osdMsg.hidden = true; osdUntil = 0; }

const pad2 = (v) => String(v).padStart(2, '0');
function timecode() {
  const t = scanTime;
  return pad2(Math.floor(t / 3600) % 100) + ':' + pad2(Math.floor(t / 60) % 60) + ':' + pad2(Math.floor(t) % 60) + ':' + pad2(Math.floor((t % 1) * 25));
}
const fillPct = () => Math.min(100, Math.floor(written / W * 100));
function sourceLabel() {
  if (st.source === 'camera') return 'CAMERA ' + (srcW ? srcW + '×' + srcH : '');
  if (st.source === 'file') return 'FILE ' + fileName;
  return 'TEST SIGNAL';
}
function scanLabel() {
  return (st.scroll ? 'SCROLL ' : 'STATIC ') + (st.motion < 0 ? '←' : '→') + ' ' + (st.vertical ? 'ROW' : 'COL') + ' ×' + WIDTHS[st.widthIdx] + '  1:' + st.stepping;
}
function statusLine() {
  if (tipText) return tipText;
  if (msg.text && performance.now() - msg.at < 5000) return msg.text;
  if (st.still) return 'Still';
  if (st.source === 'camera') return 'Scanning ' + cameraLabel();
  if (st.source === 'file') return 'Scanning ' + fileName;
  return 'Scanning the test signal';
}
const osdTL = $('#osd-tl'), osdTR = $('#osd-tr'), osdBL = $('#osd-bl');
let osdKey = '';
function updateOSD() {
  const tl = [sourceLabel(), scanLabel()];
  const tr = [timecode(), 'FILL ' + fillPct() + '%'];
  if (st.still) tr.push('STILL');
  let bl = '';
  if (st.source === 'file' && fileReady) bl = (vid.paused ? '❚❚ ' : '▶ ') + fmtT(vid.currentTime) + ' / ' + fmtT(vid.duration) + '  ' + RATE_CAP[st.rateIdx];
  const key = tl.join('|') + tr.join('|') + bl;
  if (key === osdKey) return;
  osdKey = key;
  const fill = (el, lines, cls) => {
    el.replaceChildren(...lines.filter(Boolean).map((t, i) => { const e = document.createElement('i'); e.textContent = t; if (cls && i > 0) e.className = cls; return e; }));
  };
  fill(osdTL, tl, 'w');
  fill(osdTR, tr);
  fill(osdBL, [bl]);
}
const tcEl = $('#tc'), vfdSt = $('#vfd-st'), vfdFill = $('#vfd-fill'), vfdSpeed = $('#vfd-speed');
function updateVFD() {
  tcEl.textContent = timecode();
  vfdFill.textContent = 'FILL ' + fillPct() + '%';
  vfdSpeed.textContent = '1:' + st.stepping;
  const s = statusLine().toUpperCase();
  if (vfdSt.textContent !== s) vfdSt.textContent = s;
  $('#tally').classList.toggle('on', !st.still && srcReady);
}
const tapeFill = $('#tape-fill'), tapeHead = $('#tape-head'), tapeName = $('#tape-name'), tapeTime = $('#tape-time'), cassette = $('#cassette');
function updateTape() {
  const loaded = fileReady;
  cassette.classList.toggle('loaded', loaded);
  if (!loaded) {
    tapeFill.style.width = '0%';
    tapeName.textContent = 'INSERT VIDEO FILE';
    tapeTime.textContent = 'DROP OR CLICK';
    return;
  }
  const f = vid.duration ? clamp(vid.currentTime / vid.duration, 0, 1) : 0;
  tapeFill.style.width = (f * 100).toFixed(2) + '%';
  tapeHead.style.left = (f * 100).toFixed(2) + '%';
  tapeName.textContent = fileName.toUpperCase();
  tapeTime.textContent = st.source === 'file' ? fmtT(vid.currentTime) + ' / ' + fmtT(vid.duration) : 'PRESS FILE TO SCAN';
}

/* ---------------------------------------------------------------------
   KEYS
   --------------------------------------------------------------------- */
const press = (id, on) => { const k = $('#' + id); if (k) k.setAttribute('aria-pressed', on ? 'true' : 'false'); };
const DIR_L = '<path d="M14 8H3M7 3.5 2.5 8 7 12.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
const DIR_R = '<path d="M2 8h11M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
function syncPos() {
  const len = st.vertical ? srcH : srcW;
  $('#pos-lbl').textContent = 'POSITION ' + (len ? Math.floor(st.slit * len) : Math.round(st.slit * 100) + '%');
}
function sync() {
  press('k-cam', st.source === 'camera');
  press('k-file', st.source === 'file');
  press('k-test', st.source === 'test');
  press('k-setup', st.setup);
  press('k-still', st.still);
  press('k-loop', st.loop);
  press('k-vf', st.vf);
  press('k-osd', st.osd);
  press('k-full', !!document.fullscreenElement);
  OUTPUTS.forEach((o, i) => press('k-out' + i, st.out === i));
  $('#speed-lbl').textContent = 'SPEED 1:' + st.stepping;
  $('#k-slower').disabled = st.stepping >= MAX_STEPPING;
  $('#k-faster').disabled = st.stepping <= 1;
  $('#mode-cap').textContent = st.scroll ? 'SCROLL' : 'STATIC';
  $('#dir-ico').innerHTML = st.motion < 0 ? DIR_L : DIR_R;
  const bar = $('#axis-bar');
  if (st.vertical) { bar.setAttribute('x', '1.5'); bar.setAttribute('y', '7'); bar.setAttribute('width', '13'); bar.setAttribute('height', '2'); }
  else { bar.setAttribute('x', '7'); bar.setAttribute('y', '2.5'); bar.setAttribute('width', '2'); bar.setAttribute('height', '11'); }
  $('#axis-lbl').textContent = st.vertical ? 'SLIT ROW' : 'SLIT COL';
  $('#width-cap').textContent = '×' + WIDTHS[st.widthIdx];
  $('#rate-cap').textContent = RATE_CAP[st.rateIdx];
  $('#g-tape').hidden = st.source !== 'file';
  $('#panel').hidden = !st.setup;
  vfEl.hidden = !st.vf;
  $('#osd').hidden = !st.osd;
  $('#tray-next').textContent = snapName();
  [['an-cam', st.source === 'camera'], ['an-file', st.source === 'file'], ['an-test', st.source === 'test'],
   ['an-still', st.still], ['an-scroll', st.scroll], ['an-row', st.vertical], ['an-mir', st.mirror || st.flip]]
    .forEach(([id, on]) => $('#' + id).classList.toggle('on', on));
  document.body.classList.toggle('clean', st.clean);
  syncPos();
  osdKey = '';
  if (typeof updateVFD === 'function' && tcEl) updateVFD();
}

/* actions: every key and shortcut goes through one of these */
const A = {
  camera() { startCamera(); },
  file() {
    if (fileReady && st.source !== 'file') { setSource('file'); message('', 'Scanning ' + fileName, 3000, true); }
    else $('#file').click();
  },
  test() { setSource('test'); message('', 'Scanning the test signal', 2500, true); },
  setup() { st.setup = !st.setup; if (st.setup && st.source === 'camera') probeCamera(false); sync(); renderPanel(); if (st.setup) requestAnimationFrame(() => $('#panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' })); },
  still() {
    st.still = !st.still;
    if (st.source === 'file') { if (st.still) vid.pause(); else { pendingStep = false; vid.play().catch(() => {}); } }
    sync();
  },
  slower() { if (st.stepping < MAX_STEPPING) { st.stepping++; persist(); sync(); } },
  faster() { if (st.stepping > 1) { st.stepping--; persist(); sync(); } },
  clear() { clearPicture(); message('', 'Picture cleared', 2000, true); },
  mode() { st.scroll = !st.scroll; persist(); sync(); message(st.scroll ? 'SCROLL' : 'STATIC', st.scroll ? 'The picture moves; new slits enter at the edge.' : 'A head sweeps across a still picture.', 1800); },
  dir() { st.motion = -st.motion; persist(); sync(); },
  axis() { st.vertical = !st.vertical; persist(); sync(); vfDirty = true; },
  width() { st.widthIdx = (st.widthIdx + 1) % WIDTHS.length; persist(); sync(); },
  posl(big) { nudgeSlit(-1, big); },
  posr(big) { nudgeSlit(1, big); },
  vf() { st.vf = !st.vf; persist(); sync(); if (st.vf) layoutViewfinder(); },
  osd() { st.osd = !st.osd; persist(); sync(); },
  full() {
    const mon = $('#monitor');
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (mon.requestFullscreen) mon.requestFullscreen().catch(() => A.clean());
    else A.clean();
  },
  clean() { st.clean = !st.clean; if (st.clean) message('CLEAN FEED', 'Esc or a tap returns', 1600); sync(); requestAnimationFrame(relayout); },
  help() { openHelp(0); },
  snap() { snap(); },
  out(i) { if (st.out === i) return; st.out = i; persist(); allocOutput(); sync(); relayout(); message('OUTPUT ' + OUTPUTS[i].name, OUTPUTS[i].w + ' × ' + OUTPUTS[i].h, 1800); },
  rew() { rewind(); },
  fback() { frameStep(-1); },
  ffwd() { frameStep(1); },
  rate() { st.rateIdx = (st.rateIdx + 1) % RATES.length; persist(); vid.playbackRate = RATES[st.rateIdx]; sync(); message('', 'Playback rate ' + RATE_CAP[st.rateIdx], 2000, true); },
  loop() { st.loop = !st.loop; vid.loop = st.loop; persist(); sync(); },
  mirror() { st.mirror = !st.mirror; persist(); sync(); renderPanel(); },
  flip() { st.flip = !st.flip; persist(); sync(); renderPanel(); }
};

/* a key runs on press; the repeating ones keep going while held */
const HOLD = new Set(['slower', 'faster', 'posl', 'posr', 'fback', 'ffwd']);
function bindKey(id, act) {
  const k = $('#' + id); if (!k) return;
  let viaPointer = false, t1 = 0, t2 = 0;
  const stop = () => { clearTimeout(t1); clearInterval(t2); k.classList.remove('down'); };
  if (HOLD.has(act)) {
    k.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || k.disabled) return;
      viaPointer = true; k.classList.add('down');
      A[act](e.shiftKey);
      let n = 0;
      t1 = setTimeout(() => { t2 = setInterval(() => { if (k.disabled) return stop(); A[act](e.shiftKey || n++ > 25); }, act === 'fback' || act === 'ffwd' ? 90 : 60); }, 420);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => k.addEventListener(ev, stop));
  }
  k.addEventListener('click', (e) => {
    if (HOLD.has(act) && viaPointer) { viaPointer = false; k.blur(); return; }
    A[act](e.shiftKey);
    if (e.detail > 0) k.blur();       // a pointer click leaves focus free for the shortcuts
  });
}
[['k-cam', 'camera'], ['k-file', 'file'], ['k-test', 'test'], ['k-setup', 'setup'], ['k-still', 'still'],
 ['k-slower', 'slower'], ['k-faster', 'faster'], ['k-clear', 'clear'], ['k-mode', 'mode'], ['k-dir', 'dir'],
 ['k-axis', 'axis'], ['k-width', 'width'], ['k-posl', 'posl'], ['k-posr', 'posr'], ['k-vf', 'vf'], ['k-osd', 'osd'],
 ['k-full', 'full'], ['k-clean', 'clean'], ['k-help', 'help'], ['k-snap', 'snap'], ['k-rew', 'rew'],
 ['k-fback', 'fback'], ['k-ffwd', 'ffwd'], ['k-rate', 'rate'], ['k-loop', 'loop']].forEach(([id, a]) => bindKey(id, a));
OUTPUTS.forEach((o, i) => $('#k-out' + i).addEventListener('click', (e) => { A.out(i); if (e.detail > 0) e.currentTarget.blur(); }));

/* hovering a key puts what it does on the VFD */
document.addEventListener('pointerover', (e) => {
  const el = e.target.closest && e.target.closest('[data-tip]');
  tipText = el && e.pointerType === 'mouse' ? el.dataset.tip : '';
});
$$('[data-tip]').forEach(el => { if (!el.title) el.title = el.dataset.tip; if (el.tagName === 'BUTTON' && !el.getAttribute('aria-label')) el.setAttribute('aria-label', el.dataset.tip); });

/* the cassette: load a file, or scrub the loaded one */
const fileInput = $('#file');
fileInput.addEventListener('change', () => { const f = fileInput.files && fileInput.files[0]; fileInput.value = ''; loadFile(f); });
let scrub = null;
function scrubTo(e) {
  const r = $('.slot', cassette).getBoundingClientRect();
  const f = clamp((e.clientX - r.left) / r.width, 0, 1);
  if (vid.duration) { lastMediaTime = null; vid.currentTime = f * vid.duration; }
}
cassette.addEventListener('pointerdown', (e) => {
  if (!fileReady || e.button !== 0) return;
  e.preventDefault();
  if (st.source !== 'file') setSource('file');
  scrub = e.pointerId;
  try { cassette.setPointerCapture(e.pointerId); } catch (_) {}
  scrubTo(e);
});
cassette.addEventListener('pointermove', (e) => { if (scrub === e.pointerId) scrubTo(e); });
const scrubEnd = (e) => { if (scrub === e.pointerId) scrub = null; };
cassette.addEventListener('pointerup', scrubEnd);
cassette.addEventListener('pointercancel', scrubEnd);
cassette.addEventListener('click', (e) => {
  if (fileReady && e.detail > 0) { cassette.blur(); return; }
  fileInput.click();
});

/* drop a video anywhere on the page */
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; screenWrap.classList.add('dragover'); message('DROP A VIDEO', 'Release to load it', 0); });
document.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
document.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; if (--dragDepth <= 0) { dragDepth = 0; screenWrap.classList.remove('dragover'); hideMsg(); } });
document.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; screenWrap.classList.remove('dragover'); hideMsg();
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  loadFile(f);
});

/* clean feed: a tap returns */
$('#screen-host').addEventListener('click', () => { if (st.clean) A.clean(); });
document.addEventListener('fullscreenchange', () => { sync(); requestAnimationFrame(relayout); });

/* ---------------------------------------------------------------------
   SNAPSHOTS — numbered PNGs at the full output size
   --------------------------------------------------------------------- */
const snapName = () => 'slitscan_' + String(st.snap).padStart(4, '0') + '.png';
let dlPromise = null, snapping = false;
async function snap() {
  if (snapping) return;
  snapping = true;
  const name = snapName();
  try {
    const blob = await new Promise(r => buf.toBlob(r, 'image/png'));
    if (!blob) { message('NOT SAVED', 'The picture couldn\'t be encoded.', 5000); return; }
    if (IN_VIEWER) {
      dlPromise = dlPromise || window.claude.use('downloads');
      const dl = await dlPromise;
      if (!dl) { message('SAVING UNAVAILABLE', 'This view can\'t save files. Open the standalone page to save snapshots.', 7000); return; }
      try { await dl.save({ filename: name, data: blob }); }
      catch (e) {
        const c = e && e.code;
        message('NOT SAVED', c === 'declined' ? 'The save was declined.' : c === 'rate_limited' ? 'A save is already waiting for an answer.' : 'This view couldn\'t save the file.', 4000);
        return;
      }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    st.snap++; store.set('snap', st.snap);
    flashAt = performance.now();
    message('SNAP', name, 1800);
    sync();
  } finally { snapping = false; }
}
let flashAt = -1e9;

/* ---------------------------------------------------------------------
   SETUP PANEL
   --------------------------------------------------------------------- */
const panelBody = $('#panel-body');
function mkKey(label, opts = {}) {
  const b = document.createElement('button');
  b.className = 'key' + (opts.dark ? ' dark' : '') + (opts.small ? ' small' : '');
  if (opts.id) b.id = opts.id;
  if (opts.pressed !== undefined) { b.setAttribute('aria-pressed', opts.pressed ? 'true' : 'false'); const l = document.createElement('i'); l.className = 'led'; b.append(l); }
  const s = document.createElement('span'); s.textContent = label; b.append(s);
  if (opts.c2) { const c = document.createElement('span'); c.className = 'c2'; c.textContent = opts.c2; b.append(c); }
  if (opts.tip) { b.title = opts.tip; b.dataset.tip = opts.tip; }
  if (opts.disabled) b.disabled = true;
  b.addEventListener('click', (e) => { opts.on && opts.on(e); if (e.detail > 0) b.blur(); });
  return b;
}
function mkGroup(title, children, cls) {
  const g = document.createElement('div'); g.className = 'pgrp' + (cls ? ' ' + cls : '');
  const k = document.createElement('div'); k.className = 'grp-keys'; k.append(...children);
  const t = document.createElement('div'); t.className = 'gt'; t.textContent = title;
  g.append(k, t);
  return g;
}
function mkNote(html) { const p = document.createElement('p'); p.className = 'pnote'; p.innerHTML = html; return p; }
function mkReadout(text, id) { const r = document.createElement('div'); r.className = 'readout'; r.textContent = text; if (id) r.id = id; return r; }

function renderPanel() {
  if (!st.setup) return;
  $('#panel-name').textContent = st.source === 'camera' ? 'CAMERA' : st.source === 'file' ? 'VIDEO FILE' : 'TEST SIGNAL';
  const parts = [];
  parts.push(mkGroup('IMAGE', [
    mkKey('MIRROR', { id: 'p-mirror', pressed: st.mirror, tip: 'Flip the source left to right', on: () => A.mirror() }),
    mkKey('FLIP', { id: 'p-flip', pressed: st.flip, tip: 'Flip the source upside down', on: () => A.flip() })
  ]));
  if (st.source === 'test') {
    parts.push(mkNote('The test card is <b>960 × 540</b> at <b>30 frames a second</b>. The wheel, the swinging ball, the amber bars at the edges and the running clock give the slit something to record. Press <b>CAMERA</b> or <b>FILE</b> to scan something of your own.'));
  } else if (st.source === 'file') {
    const fps = frameDur ? (1 / frameDur).toFixed(frameDur > 0.03 ? 2 : 1) + ' FPS' : 'FPS UNKNOWN';
    parts.push(mkGroup('FILE', [mkReadout(fileName.toUpperCase() + '  ' + vid.videoWidth + '×' + vid.videoHeight + '  ' + fmtT(vid.duration) + '  ' + fps, 'p-fileinfo')]));
    parts.push(mkNote('Every frame the browser shows lays down one slit, so a slower <b>RATE</b> drops fewer frames on a slow computer. With <b>STILL</b> on, the <b>FRAME</b> keys step one frame at a time and lay down exactly one slit each. Drag on the cassette to scrub; scrubbing while scanning records the scrub. The file never leaves this computer.'));
  } else {
    // camera
    const cur = camSettings();
    const devKeys = devices.slice(0, 6).map((d, i) => mkKey('CAM ' + (i + 1), {
      dark: true, pressed: d.deviceId === cur.deviceId, tip: d.label || 'Camera ' + (i + 1),
      on: () => { if (d.deviceId !== cur.deviceId) startCamera({ deviceId: d.deviceId }); }
    }));
    if (devKeys.length) parts.push(mkGroup('DEVICE', devKeys));
    parts.push(mkGroup('REQUEST', RES.map((r, i) => mkKey(r.name, {
      dark: true, pressed: st.res === i, tip: 'Ask the camera for ' + r.w + ' × ' + r.h,
      on: () => { if (st.res !== i) { st.res = i; persist(); startCamera(); } }
    }))));
    const asked = RES[st.res];
    parts.push(mkGroup('CAMERA', [mkReadout((cameraLabel() || '').toUpperCase().slice(0, 40) + '  ASKED ' + asked.w + '×' + asked.h + '  GOT ' + (cur.width || cam.videoWidth) + '×' + (cur.height || cam.videoHeight), 'p-caminfo')]));
    const faders = document.createElement('div'); faders.className = 'faders';
    let count = 0;
    CAM_PROPS.forEach(([p, label, mode]) => {
      if (!hasRange(p)) return;
      count++;
      const c = camCaps[p];
      const f = document.createElement('div'); f.className = 'fader';
      const head = document.createElement('div'); head.className = 'fader-head';
      const l = document.createElement('span'); l.className = 'lbl'; l.textContent = label;
      const v = document.createElement('span'); v.className = 'fader-val';
      const fmt = (x) => Math.abs(c.max - c.min) >= 20 ? Math.round(x) : (+x).toFixed(2);
      const val = typeof cur[p] === 'number' ? cur[p] : (c.min + c.max) / 2;
      v.textContent = fmt(val);
      head.append(l, v);
      const r = document.createElement('input');
      r.type = 'range'; r.className = 'fd'; r.id = 'fd-' + p;
      r.min = c.min; r.max = c.max; r.step = c.step || (c.max - c.min) / 100; r.value = val;
      r.setAttribute('aria-label', label);
      let autoK = null;
      r.addEventListener('input', () => {
        v.textContent = fmt(+r.value);
        const cons = { [p]: +r.value };
        if (mode && hasAuto(mode)) { cons[mode] = 'manual'; if (autoK) autoK.setAttribute('aria-pressed', 'false'); }
        camConstrain(cons);
      });
      f.append(head, r);
      if (mode && hasAuto(mode)) {
        autoK = mkKey('AUTO', { small: true, dark: true, pressed: cur[mode] === 'continuous', tip: 'Let the camera set ' + label.toLowerCase(),
          on: async () => {
            const on = autoK.getAttribute('aria-pressed') !== 'true';
            await camConstrain({ [mode]: on ? 'continuous' : 'manual' });
            renderPanel();
          } });
        head.insertBefore(autoK, v);
      }
      faders.append(f);
    });
    if (count) {
      parts.push(faders);
      parts.push(mkGroup('SETTINGS', [
        mkKey('RESTORE', { dark: true, tip: 'Put back the values from when the camera started', on: async () => {
          const c = {};
          CAM_PROPS.forEach(([p, , mode]) => { if (hasRange(p) && typeof camInitial[p] === 'number') c[p] = camInitial[p]; if (mode && hasAuto(mode) && camInitial[mode]) c[mode] = camInitial[mode]; });
          await camConstrain(c); renderPanel(); message('', 'Camera settings restored', 2500, true);
        } }),
        mkKey('PROBE', { dark: true, tip: 'Ask the camera again which controls it has', on: () => { probeCamera(false); renderPanel(); message('', 'Camera probed', 2000, true); } })
      ]));
    } else {
      parts.push(mkNote('This camera reports <b>no adjustable image controls</b> to the browser. Chrome and Edge expose them for most webcams; Firefox and Safari expose none.'));
    }
  }
  panelBody.replaceChildren(...parts);
  $$('[data-tip]', panelBody).forEach(el => el.setAttribute('aria-label', el.dataset.tip));
}

/* ---------------------------------------------------------------------
   KEYBOARD
   --------------------------------------------------------------------- */
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (help.open) {
    if (e.key === 'Escape') { closeHelp(); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { helpGo(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { helpGo(-1); e.preventDefault(); }
    return;
  }
  const onButton = t && t.tagName === 'BUTTON';
  const k = e.key;
  let act = null, arg;
  switch (k) {
    case ' ': if (onButton) return; act = 'still'; break;
    case 'c': case 'C': act = 'camera'; break;
    case 't': case 'T': act = 'test'; break;
    case 'l': case 'L': act = 'file'; break;
    case 'Tab': if (document.activeElement && document.activeElement !== document.body) return; act = 'setup'; break;
    case 'u': case 'U': act = 'setup'; break;
    case 'PageDown': act = 'slower'; break;
    case 'PageUp': act = 'faster'; break;
    case 'r': case 'R': act = 'clear'; break;
    case 'm': case 'M': act = 'mode'; break;
    case 'd': case 'D': act = 'dir'; break;
    case 'a': case 'A': act = 'axis'; break;
    case 'w': case 'W': act = 'width'; break;
    case 'ArrowLeft': case 'ArrowUp': if (onButton) return; act = 'posl'; arg = e.shiftKey; break;
    case 'ArrowRight': case 'ArrowDown': if (onButton) return; act = 'posr'; arg = e.shiftKey; break;
    case 'v': case 'V': act = 'vf'; break;
    case 'o': case 'O': act = 'osd'; break;
    case 'f': case 'F': act = 'full'; break;
    case 'h': case 'H': act = 'clean'; break;
    case 'Escape': if (st.clean) act = 'clean'; else if (st.setup) act = 'setup'; break;
    case 'F1': case '?': act = 'help'; break;
    case 's': case 'S': act = 'snap'; break;
    case 'Home': act = 'rew'; break;
    case ',': case '<': act = 'fback'; break;
    case '.': case '>': act = 'ffwd'; break;
    case 'p': case 'P': if (st.source === 'file') act = 'rate'; break;
    case '1': case '2': case '3': act = 'out'; arg = +k - 1; break;
  }
  if (!act) return;
  if (e.repeat && !HOLD.has(act)) return;
  e.preventDefault();
  A[act](arg);
});

/* ---------------------------------------------------------------------
   LAYOUT — pick the arrangement that gives the picture the most room
   --------------------------------------------------------------------- */
const root = document.documentElement;
const app = $('#app'), monitor = $('#monitor'), deck = $('#deck');
let layoutMode = '';
function relayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const side = (vw >= 940 && vw / vh >= 1.22) || (vh < 560 && vw > vh && vw >= 560);
  layoutMode = side ? 'side' : 'stack';
  root.classList.toggle('side', side);
  root.classList.toggle('short', vh < 560);
  monitor.style.setProperty('--m', W + ' / ' + H);
  const asp = W / H;
  if (side) {
    // the deck takes what the picture can't use, between its narrowest and widest
    root.style.setProperty('--deck-w', '340px');
    monitor.style.setProperty('--mon-w', '100%');
    const col = $('.mon-col');
    {
      const cW = monitor.offsetWidth - screenWrap.clientWidth;
      const cH = monitor.offsetHeight - screenWrap.clientHeight + 14;
      const picW = (col.clientHeight - cH) * asp + cW;
      const spare = vw - 32 - 18 - picW;
      const deckW = clamp(Math.round(spare), vh < 560 ? 280 : 330, 420);
      root.style.setProperty('--deck-w', deckW + 'px');
    }
    const areaW = col.clientWidth, areaH = col.clientHeight;
    const chromeW = monitor.offsetWidth - screenWrap.clientWidth;
    const chromeH = monitor.offsetHeight - screenWrap.clientHeight + 14;
    const w = Math.min(areaW, (areaH - chromeH) * asp + chromeW);
    monitor.style.setProperty('--mon-w', Math.max(200, Math.floor(w)) + 'px');
  } else if (vw <= 620) {
    monitor.style.removeProperty('--mon-w');
  } else {
    monitor.style.setProperty('--mon-w', '100%');
    const panel = $('#panel');
    const ph = panel.hidden ? 0 : panel.offsetHeight + 16;
    const deckH = deck.offsetHeight - ph;
    const contentW = app.clientWidth;
    const chromeW = monitor.offsetWidth - screenWrap.clientWidth;
    const chromeH = monitor.offsetHeight - screenWrap.clientHeight + 14;
    const budget = vh - 18 - 24 - deckH - chromeH;
    const w = Math.max(Math.min(contentW, 520), budget * asp + chromeW);
    monitor.style.setProperty('--mon-w', Math.floor(Math.min(contentW, w)) + 'px');
  }
  root.style.setProperty('--sticky-h', getComputedStyle(monitor).position === 'sticky' ? monitor.offsetHeight + 'px' : '0px');
  layoutViewfinder();
  vfDirty = true;
}
let relayoutQueued = false;
const queueRelayout = () => { if (relayoutQueued) return; relayoutQueued = true; requestAnimationFrame(() => { relayoutQueued = false; relayout(); }); };
window.addEventListener('resize', queueRelayout);
new ResizeObserver(() => layoutViewfinder()).observe(screenWrap);

/* ---------------------------------------------------------------------
   HELP — a guided tour; the room dims and the part explained is cut out
   --------------------------------------------------------------------- */
const TOUR = [
  { sel: '#monitor', topic: 'The monitor', title: 'A picture made of slits',
    body: '<p>A slit-scan camera doesn\'t take a picture all at once. Every frame of the source, it copies one thin <strong>slit</strong> into this picture, so the picture is time laid out in space.</p><p>Still things become streaks. Moving things are stretched, squeezed or bent by how fast they cross the slit.</p>' },
  { sel: '#vf', topic: 'Viewfinder', title: 'Place the slit',
    body: '<p>The inset shows the live source, with the slit in red. <strong>Drag</strong> on it to move the slit, or turn the <strong>mouse wheel</strong> over it.</p><p>The arrow keys move it one pixel at a time; with <kbd>SHIFT</kbd> they take bigger steps. <kbd>V</kbd> hides the inset.</p>' },
  { sel: '[data-help=source]', topic: 'Source', title: 'What the slit reads',
    body: '<p><strong>CAMERA</strong> <kbd>C</kbd> scans a webcam. <strong>FILE</strong> <kbd>L</kbd> scans a video from your computer; the file is played here and never uploaded. <strong>TEST SIGNAL</strong> <kbd>T</kbd> is a moving test card that needs nothing.</p><p><strong>SETUP</strong> <kbd>U</kbd> picks the camera and its resolution, mirrors or flips the source, and holds the camera\'s image controls.</p>' },
  { sel: '#cassette', topic: 'Tape', title: 'Load and scrub a file',
    body: '<p>Click the cassette, or drop a video anywhere on the page, to load it. Once loaded, the cassette is the tape: <strong>drag along it to scrub</strong>.</p><p>The <strong>TAPE</strong> keys appear while a file plays: rewind <kbd>HOME</kbd>, step one frame <kbd>,</kbd> <kbd>.</kbd> (each step lays down one slit), playback rate <kbd>P</kbd> and loop.</p>' },
  { sel: '[data-help=transport]', topic: 'Transport', title: 'Freeze, pace and wipe',
    body: '<p><strong>STILL</strong> <kbd>SPACE</kbd> freezes the scan, and pauses a file.</p><p><strong>SPEED</strong> <kbd>PG UP</kbd> <kbd>PG DN</kbd> lays down one slit every N frames: 1:1 is every frame, 1:10 every tenth, which stretches a longer stretch of time across the picture. Hold the keys to repeat.</p><p><strong>CLEAR</strong> <kbd>R</kbd> wipes the picture and resets the timecode.</p>' },
  { sel: '[data-help=scan]', topic: 'Scan', title: 'How the slit is laid down',
    body: '<p><strong>STATIC</strong> sweeps a write head over a still picture; <strong>SCROLL</strong> moves the whole picture and new slits enter at the edge <kbd>M</kbd>.</p><p><strong>DIRECTION</strong> <kbd>D</kbd> is which way the picture goes, in both modes. <strong>SLIT</strong> <kbd>A</kbd> reads a column of the source, or a row stood on its end. <strong>WIDTH</strong> <kbd>W</kbd> copies 1, 2, 4 or 8 lines per step, so a sweep fills faster and fine smears turn into bands.</p>' },
  { sel: '#vfd-box', topic: 'Display', title: 'The VFD',
    body: '<p>Lamps for the source and modes, the time spent scanning, the speed as 1:N and how much of the picture has been filled. Point at any key and the bottom line says what it does and its shortcut.</p>' },
  { sel: '[data-help=output]', topic: 'Output', title: 'Picture size',
    body: '<p>The picture is always 720 pixels tall. <strong>4:3</strong>, <strong>16:9</strong> and <strong>2:1</strong> make it 960, 1280 or 1440 wide <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>; a wider picture holds more time in one sweep. Changing it clears the picture.</p>' },
  { sel: '[data-help=snap]', topic: 'Snapshot', title: 'Save the picture',
    body: '<p>The green <strong>SNAP</strong> key <kbd>S</kbd> saves the picture as a PNG at its full size. Files are numbered from <strong>slitscan_0001.png</strong>, and the count carries on the next time you open the page.</p>' },
  { sel: '[data-help=display]', topic: 'Display', title: 'Showing it',
    body: '<p><strong>VIEWFINDER</strong> <kbd>V</kbd> and <strong>OSD</strong> <kbd>O</kbd> show or hide the inset and the on-screen text. <strong>FULL</strong> <kbd>F</kbd> fills the screen with the monitor. <strong>CLEAN</strong> <kbd>H</kbd> shows the picture alone, for projecting; <kbd>ESC</kbd> or a tap brings the deck back.</p>' }
];
const help = { open: false, i: 0 };
const helpEl = $('#help');
function openHelp(i) {
  if (st.clean) { st.clean = false; sync(); }
  help.open = true; help.i = i; helpEl.hidden = false; renderHelp();
}
function closeHelp() { help.open = false; helpEl.hidden = true; }
function helpGo(d) {
  const n = help.i + d;
  if (n < 0) return;
  if (n >= TOUR.length) { closeHelp(); return; }
  help.i = n; renderHelp();
}
function visibleTarget(sel) {
  const el = $(sel);
  if (!el || el.hidden || !el.offsetParent && getComputedStyle(el).position !== 'fixed') return null;
  return el;
}
function renderHelp() {
  const s = TOUR[help.i];
  const el = visibleTarget(s.sel);
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  $('#help-topic').textContent = s.topic;
  $('#help-title').textContent = s.title;
  $('#help-body').innerHTML = s.body;
  $('#help-dots').replaceChildren(...TOUR.map((_, j) => { const d = document.createElement('i'); if (j === help.i) d.className = 'on'; return d; }));
  $('#help-prev').disabled = help.i === 0;
  $('#help-next').textContent = help.i === TOUR.length - 1 ? 'Done' : 'Next';
  requestAnimationFrame(() => placeHelp(el));
}
function placeHelp(el) {
  const holes = $('#help-holes'), rings = $('#help-rings'), panel = $('#help-panel');
  holes.replaceChildren(); rings.replaceChildren();
  if (!el) { panel.style.left = panel.style.width = panel.style.top = panel.style.transform = ''; panel.className = 'help-panel at-bottom'; return; }
  const r = el.getBoundingClientRect(), p = 6;
  const NS = 'http://www.w3.org/2000/svg';
  const hole = document.createElementNS(NS, 'rect');
  hole.setAttribute('x', r.left - p); hole.setAttribute('y', r.top - p);
  hole.setAttribute('width', r.width + 2 * p); hole.setAttribute('height', r.height + 2 * p);
  hole.setAttribute('rx', 8); hole.setAttribute('fill', '#000');
  holes.append(hole);
  const ring = document.createElement('div'); ring.className = 'ring';
  Object.assign(ring.style, { left: (r.left - p) + 'px', top: (r.top - p) + 'px', width: (r.width + 2 * p) + 'px', height: (r.height + 2 * p) + 'px' });
  rings.append(ring);
  const vw = window.innerWidth, vh = window.innerHeight;
  const right = vw - r.right, left = r.left;
  panel.style.left = panel.style.width = panel.style.top = panel.style.transform = '';
  if (Math.max(left, right) >= 330) {
    // room beside the target: the panel goes over the other column
    const room = Math.max(left, right) - 32;
    const w = Math.min(560, room);
    const x = right >= left ? r.right + 16 + (room - w) / 2 : (left - 16 - w) / 2 + 0;
    panel.className = 'help-panel';
    Object.assign(panel.style, { left: Math.round(right >= left ? x : Math.max(16, x)) + 'px', width: Math.round(w) + 'px', transform: 'none' });
    const ph = panel.offsetHeight;
    panel.style.top = Math.round(clamp(r.top + r.height / 2 - ph / 2, 16, Math.max(16, vh - ph - 16))) + 'px';
    return;
  }
  const above = r.top, below = vh - r.bottom;
  panel.className = 'help-panel ' + (below >= above ? 'at-bottom' : 'at-top');
}
$('#help-x').addEventListener('click', closeHelp);
$('#help-prev').addEventListener('click', () => helpGo(-1));
$('#help-next').addEventListener('click', () => helpGo(1));
$('#help-dim').addEventListener('click', closeHelp);
window.addEventListener('resize', () => { if (help.open) requestAnimationFrame(() => placeHelp(visibleTarget(TOUR[help.i].sel))); });

/* ---------------------------------------------------------------------
   FRAME LOOP
   --------------------------------------------------------------------- */
let clock = 0, testClock = 0, testAcc = 0, lastNow = performance.now(), feedPaused = false, uiT = 0;
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
  lastNow = now;
  clock += dt;
  if (!feedPaused && preroll > 0 && st.source === 'test' && !st.still) {
    // fast-forward the test signal so the first picture is a full one
    const t0 = performance.now();
    while (preroll > 0 && performance.now() - t0 < 9) {
      testClock += 1 / TEST_FPS; scanTime += 1 / TEST_FPS;
      onSourceFrame(test.frame(testClock), test.w, test.h);
      preroll--;
    }
    if (preroll <= 0) message('', 'Pre-roll done', 2500, true);
  } else if (!feedPaused) {
    if (st.source === 'test') {
      testAcc += dt;
      if (testAcc >= 1 / TEST_FPS || !srcReady) {
        testAcc = testAcc % (1 / TEST_FPS);
        testClock += 1 / TEST_FPS;
        onSourceFrame(test.frame(testClock), test.w, test.h);
      }
    } else if (!HAS_RVFC) {
      // no frame callbacks: a file is sampled on a 30 fps grid of its own
      // clock; a camera when the decoder counts a new frame, or 30 times a
      // second where it counts none
      const kind = st.source, el = kind === 'file' ? vid : cam;
      if (el.readyState >= 2 && el.videoWidth && !(kind === 'file' && el.paused)) {
        let fresh = false;
        if (kind === 'file') {
          const k = Math.floor(el.currentTime * 30 + 1e-6);
          fresh = k !== pollT.file; pollT.file = k;
        } else {
          let n = 0;
          try { n = el.getVideoPlaybackQuality ? el.getVideoPlaybackQuality().totalVideoFrames : 0; } catch (e) { n = 0; }
          if (n > 0) { fresh = n !== pollT.camera; pollT.camera = n; }
          else { pollAcc += dt; if (pollAcc >= 1 / 30) { pollAcc %= 1 / 30; fresh = true; } }
        }
        if (fresh) videoFrame(el, kind, null);
      }
    }
    const producing = st.source === 'test' || (st.source === 'camera' && cam.readyState >= 2) || (st.source === 'file' && !vid.paused);
    if (!st.still && srcReady && producing) scanTime += dt;
  }
  drawMonitor();
  const fl = (now - flashAt) / 260;
  if (fl < 1) { sctx.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - fl)).toFixed(3) + ')'; sctx.fillRect(0, 0, scr.width, scr.height); }
  if (st.vf && !st.clean) drawViewfinder();
  if (osdUntil && now > osdUntil) hideMsg();
  if (now - uiT > 90) {
    uiT = now;
    if (st.osd) updateOSD();
    updateVFD();
    updateTape();
  }
  requestAnimationFrame(frame);
}

/* test hooks: the headless suite reaches the engine through these */
window.__slit = {
  st, A, step, clearPicture, allocOutput, relayout, renderPanel, sync, setSource, loadFile,
  get buf() { return buf; }, get srcC() { return srcC; }, get pos() { return pos; }, get written() { return written; },
  get vid() { return vid; }, get cam() { return cam; }, get frameDur() { return frameDur; },
  get layout() { return layoutMode; }, get fileReady() { return fileReady; },
  inject(canvas) { feedPaused = true; grabSource(canvas, canvas.width, canvas.height); },
  resume() { feedPaused = false; },
  status: () => statusLine(), slitBand
};

allocOutput();
// a first visit opens on a full picture of the test signal, not a black screen
preroll = Math.ceil(W / Math.min(WIDTHS[st.widthIdx], W)) * st.stepping;
sync();
relayout();
requestAnimationFrame(relayout);
requestAnimationFrame(frame);
})();
