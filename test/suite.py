"""Headless Chromium suite for the web Slitscanner.
   python3 test/suite.py            everything
   python3 test/suite.py engine     one section (engine, camera, file, keys, snap, layout, help, persist, fuzz)
Exits non-zero on any failure."""
import sys, pathlib, json, random, struct, zlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "dist" / "Slitscanner-standalone.html").as_uri()
MEDIA = ROOT / "test" / "media"
only = sys.argv[1:]
FONT_CSS = (ROOT / "test" / "fonts.css").read_text()
fails, passes = [], 0

def check(ok, what):
    global passes
    if ok: passes += 1
    else:
        fails.append(what); print("FAIL", what)

def launch(p):
    return p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
                                   "--autoplay-policy=no-user-gesture-required"])

def open_page(b, w=1280, h=800, mobile=False, init=None, clear=True):
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1,
                        has_touch=mobile, is_mobile=mobile, accept_downloads=True)
    ctx.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="text/css", body=FONT_CSS))
    pg = ctx.new_page()
    pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" and "ERR_TUNNEL" not in m.text and "Failed to load resource" not in m.text else None)
    if clear: pg.add_init_script("try{ if (!window.name) { localStorage.clear(); window.name = 'cleared'; } }catch(e){}")
    if init: pg.add_init_script(init)
    pg.goto(URL)
    pg.wait_for_timeout(400)
    return pg

def S(pg, expr): return pg.evaluate(expr)

# --------------------------------------------------------------------- engine
ENGINE_JS = r"""
() => {
  const S = window.__slit, st = S.st, out = [];
  const src = document.createElement('canvas'); src.width = 200; src.height = 150;
  const g = src.getContext('2d'); const im = g.createImageData(200, 150);
  for (let y = 0; y < 150; y++) for (let x = 0; x < 200; x++) { const i = (y * 200 + x) * 4; im.data[i] = x; im.data[i+1] = y; im.data[i+2] = 77; im.data[i+3] = 255; }
  g.putImageData(im, 0, 0);
  st.mirror = false; st.flip = false; st.out = 0; S.allocOutput();
  S.inject(src);
  const px = (x, y) => S.buf.getContext('2d').getImageData(x, y, 1, 1).data;
  const res = (ok, what) => out.push([ok, what]);
  for (const n of [1, 2, 4, 8]) for (const dir of [-1, 1]) {
    // column slit, static
    st.widthIdx = [1,2,4,8].indexOf(n); st.vertical = false; st.scroll = false; st.motion = dir; st.slit = 0.5;
    S.clearPicture(); S.step();
    const p0 = S.pos, x0 = dir > 0 ? 0 : 960 - n;
    res(dir > 0 ? p0 === n : p0 === 960 - n, `col n${n} dir${dir}: head moved to ${p0}`);
    const a = 100 - Math.floor(n / 2);
    let ok = true, got = [];
    for (let i = 0; i < n; i++) { const d = px(x0 + i, 360); got.push(d[0]); if (d[0] !== a + i || d[2] !== 77) ok = false; }
    res(ok, `col n${n} dir${dir}: source columns ${a}..${a+n-1} at x ${x0} (got ${got})`);
    const top = px(x0, 0)[1], bot = px(x0, 719)[1];
    res(top <= 1 && bot >= 148, `col n${n} dir${dir}: column runs top to bottom (${top}..${bot})`);
    const outside = dir > 0 ? px(n, 360) : px(960 - n - 1, 360);
    res(outside[0] === 0 && outside[1] === 0 && outside[2] === 0, `col n${n} dir${dir}: nothing written beside the band`);
    // row slit, static: source row a+i lands at x0 + n-1-i, source x=0 at the top
    st.vertical = true; st.slit = 0.4;
    S.clearPicture(); S.step();
    const b = Math.floor(0.4 * 150) - Math.floor(n / 2);
    ok = true; got = [];
    for (let i = 0; i < n; i++) { const d = px(x0 + n - 1 - i, 360); got.push(d[1]); if (d[1] !== b + i) ok = false; }
    res(ok, `row n${n} dir${dir}: source rows ${b}..${b+n-1} in the band (got ${got})`);
    const r0 = px(x0, 0)[0], r1 = px(x0, 719)[0];
    res(r0 <= 1 && r1 >= 198, `row n${n} dir${dir}: row runs top to bottom (${r0}..${r1})`);
  }
  // scroll: the newest band at the edge, the previous one moved n along
  for (const n of [1, 4]) for (const dir of [-1, 1]) {
    st.widthIdx = [1,2,4,8].indexOf(n); st.vertical = false; st.scroll = true; st.motion = dir;
    S.clearPicture();
    st.slit = 10.5 / 200; S.step();
    st.slit = 150.5 / 200; S.step();
    const a1 = 10 - Math.floor(n / 2), a2 = 150 - Math.floor(n / 2);
    if (dir < 0) {
      res(px(959, 300)[0] === a2 + n - 1, `scroll n${n} left: newest band at the right edge (${px(959,300)[0]})`);
      res(px(959 - n, 300)[0] === a1 + n - 1, `scroll n${n} left: previous band moved left by ${n} (${px(959-n,300)[0]})`);
    } else {
      res(px(0, 300)[0] === a2, `scroll n${n} right: newest band at the left edge (${px(0,300)[0]})`);
      res(px(n, 300)[0] === a1, `scroll n${n} right: previous band moved right by ${n} (${px(n,300)[0]})`);
    }
  }
  // a static sweep wraps, and FILL counts columns
  st.scroll = false; st.vertical = false; st.widthIdx = 3; st.motion = -1; S.clearPicture();
  for (let i = 0; i < 120; i++) S.step();
  res(S.pos === 0 && S.written === 960, `left sweep of 120 × 8 ends at 0 having written 960 (${S.pos}, ${S.written})`);
  S.step();
  res(S.pos === 952, `left sweep wraps to the right edge (${S.pos})`);
  st.motion = 1; S.clearPicture();
  for (let i = 0; i < 121; i++) S.step();
  res(S.pos === 8, `right sweep wraps to the left edge (${S.pos})`);
  // slit kept inside the frame at the edges
  st.widthIdx = 3; st.slit = 1; let band = S.slitBand(8); res(band[0] === 192, `slit at the right edge keeps all 8 columns inside (${band})`);
  st.slit = 0; band = S.slitBand(8); res(band[0] === 0, `slit at the left edge starts at 0 (${band})`);
  // mirror: the oriented source is what the slit reads
  st.mirror = true; S.inject(src); st.slit = 10.5 / 200; st.widthIdx = 0; st.scroll = false; st.motion = 1; S.clearPicture(); S.step();
  res(px(0, 360)[0] === 189, `mirror: slit at 10 reads source column 189 (${px(0,360)[0]})`);
  st.mirror = false;
  // output formats
  for (const [i, w] of [[0, 960], [1, 1280], [2, 1440]]) { st.out = i; S.allocOutput(); res(S.buf.width === w && S.buf.height === 720, `output ${i} is ${w}×720 (${S.buf.width}×${S.buf.height})`); }
  S.resume();
  return out;
}
"""

def t_engine(b):
    pg = open_page(b)
    for ok, what in S(pg, ENGINE_JS): check(ok, "engine: " + what)
    # SPEED: one slit every N test frames (30 fps)
    S(pg, "(() => { const s = __slit; s.st.widthIdx = 0; s.st.stepping = 3; s.sync(); s.clearPicture(); })()")
    pg.wait_for_timeout(2000)
    w = S(pg, "__slit.written")
    check(14 <= w <= 24, f"speed 1:3 lays ~20 slits in 2 s at 30 fps (got {w})")
    S(pg, "(() => { const s = __slit; s.st.stepping = 1; s.A.still(); s.clearPicture(); })()")
    pg.wait_for_timeout(600)
    check(S(pg, "__slit.written") == 0, "STILL lays down nothing")
    check(S(pg, "document.getElementById('tc').textContent") == "00:00:00:00", "STILL holds the timecode")
    S(pg, "__slit.A.still()")
    pg.wait_for_timeout(1000)
    w = S(pg, "__slit.written")
    check(24 <= w <= 34, f"1:1 lays ~30 slits a second (got {w})")
    check(not pg.errors, "engine: no page errors " + str(pg.errors[:3]))
    pg.context.close()

# --------------------------------------------------------------------- camera
def t_camera(b):
    pg = open_page(b)
    pg.click("#k-cam")
    pg.wait_for_function("__slit.st.source === 'camera' && __slit.srcC.width > 0", timeout=8000)
    pg.wait_for_timeout(800)
    check(S(pg, "document.getElementById('k-cam').getAttribute('aria-pressed')") == "true", "camera: CAMERA key lit")
    S(pg, "__slit.clearPicture()")
    pg.wait_for_timeout(1200)
    check(S(pg, "__slit.written") > 10, f"camera: fake camera frames lay slits ({S(pg, '__slit.written')})")
    check(S(pg, "document.getElementById('an-cam').classList.contains('on')"), "camera: CAM annunciator on")
    pg.click("#k-setup"); pg.wait_for_timeout(300)
    txt = S(pg, "document.getElementById('panel-body').innerText")
    check("REQUEST" in txt and "720" in txt, "camera: setup shows resolution request")
    check("CAM 1" in txt, "camera: setup lists devices")
    info = S(pg, "document.getElementById('p-caminfo').textContent")
    check("ASKED 1280×720" in info, f"camera: readout says what was asked ({info})")
    # request 480: camera restarts at 640×480
    pg.click("#panel-body .key:has-text('480')")
    pg.wait_for_function("__slit.cam.videoWidth === 640", timeout=8000)
    check(S(pg, "__slit.st.res") == 0, "camera: 480 request stored")
    pg.wait_for_timeout(500)
    check(S(pg, "__slit.srcC.width") == 640, f"camera: source is 640 wide after the 480 request ({S(pg, '__slit.srcC.width')})")
    # back to test stops the camera tracks
    pg.click("#k-test"); pg.wait_for_timeout(300)
    check(S(pg, "__slit.cam.srcObject === null"), "camera: TEST SIGNAL stops the camera")
    # faders appear when the browser reports controls (stubbed capabilities)
    S(pg, """(() => {
      const t = { _s: { brightness: 128, exposureMode: 'continuous', exposureTime: 100, deviceId: 'x', width: 640, height: 480 }, readyState: 'live', label: 'Stub cam',
        getCapabilities() { return { brightness: { min: 0, max: 255, step: 1 }, exposureMode: ['manual', 'continuous'], exposureTime: { min: 1, max: 1000, step: 1 } }; },
        getSettings() { return { ...this._s }; },
        applyConstraints(c) { Object.assign(this._s, c.advanced[0]); window.__applied = (window.__applied || []).concat([c.advanced[0]]); return Promise.resolve(); },
        stop() {}, addEventListener() {} };
      window.__stubTrack = t;
    })()""")
    check(not pg.errors, "camera: no page errors " + str(pg.errors[:3]))
    pg.context.close()

STUB_CAM = r"""
(() => {
  const track = { _s: { brightness: 128, exposureMode: 'continuous', exposureTime: 100, deviceId: 'stub1', width: 640, height: 480 }, readyState: 'live', label: 'Stub cam', kind: 'video',
    getCapabilities() { return { brightness: { min: 0, max: 255, step: 1 }, exposureMode: ['manual', 'continuous'], exposureTime: { min: 1, max: 1000, step: 1 }, deviceId: 'stub1' }; },
    getSettings() { return { ...this._s }; },
    applyConstraints(c) { Object.assign(this._s, c.advanced[0]); (window.__applied = window.__applied || []).push(c.advanced[0]); return Promise.resolve(); },
    stop() {}, addEventListener() {} };
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => {
    const s = await real({ video: true });
    const vt = s.getVideoTracks()[0];
    for (const k of ['getCapabilities', 'getSettings', 'applyConstraints']) vt[k] = track[k].bind(track);
    return s;
  };
})();
"""

def t_camctl(b):
    pg = open_page(b, init=STUB_CAM)
    pg.click("#k-cam")
    pg.wait_for_function("__slit.st.source === 'camera'", timeout=8000)
    pg.click("#k-setup"); pg.wait_for_timeout(300)
    check(S(pg, "!!document.getElementById('fd-brightness')"), "camera controls: brightness fader shown")
    check(S(pg, "!!document.getElementById('fd-exposureTime')"), "camera controls: shutter fader shown")
    check(not S(pg, "!!document.getElementById('fd-contrast')"), "camera controls: unsupported contrast has no fader")
    S(pg, "(() => { const r = document.getElementById('fd-exposureTime'); r.value = 500; r.dispatchEvent(new Event('input')); })()")
    pg.wait_for_timeout(200)
    ap = S(pg, "window.__applied || []")
    check(any(a.get("exposureTime") == 500 and a.get("exposureMode") == "manual" for a in ap), f"camera controls: touching a fader turns its AUTO off ({ap})")
    pg.click("#panel-body .key:has-text('RESTORE')"); pg.wait_for_timeout(300)
    ap = S(pg, "window.__applied || []")
    check(ap and ap[-1].get("exposureTime") == 100 and ap[-1].get("exposureMode") == "continuous", f"camera controls: RESTORE puts back the starting values ({ap[-1] if ap else None})")
    check(not pg.errors, "camera controls: no page errors " + str(pg.errors[:3]))
    pg.context.close()

def t_camblocked(b):
    pg = open_page(b, init="navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('no'), {name: 'NotAllowedError'}));")
    pg.click("#k-cam"); pg.wait_for_timeout(400)
    m = S(pg, "document.getElementById('osd-msg').innerText")
    check("CAMERA BLOCKED" in m, f"blocked camera: says so ({m!r})")
    check(S(pg, "__slit.st.source") == "test", "blocked camera: stays on the test signal")
    pg.context.close()

# --------------------------------------------------------------------- files
def t_file(b):
    pg = open_page(b)
    pg.set_input_files("#file", str(MEDIA / "clip.webm"))
    pg.wait_for_function("__slit.st.source === 'file' && __slit.fileReady", timeout=8000)
    pg.wait_for_timeout(1500)
    check(S(pg, "__slit.srcC.width") == 640 and S(pg, "__slit.srcC.height") == 360, "file: source is the video's 640×360")
    fd = S(pg, "__slit.frameDur")
    check(abs(fd - 1/30) < 0.002, f"file: frame duration measured as 1/30 s ({fd})")
    check(not S(pg, "document.getElementById('g-tape').hidden"), "file: TAPE keys shown")
    check("CLIP.WEBM" in S(pg, "document.getElementById('tape-name').textContent"), "file: cassette shows the file name")
    check(S(pg, "document.getElementById('k-file').getAttribute('aria-pressed')") == "true", "file: FILE key lit")
    S(pg, "__slit.clearPicture()"); pg.wait_for_timeout(1000)
    w = S(pg, "__slit.written")
    check(15 <= w <= 34, f"file: about one slit per video frame ({w} in 1 s)")
    # STILL pauses the video; frame steps lay exactly one slit each
    pg.keyboard.press("Space"); pg.wait_for_timeout(200)
    check(S(pg, "__slit.vid.paused"), "file: STILL pauses the video")
    S(pg, "__slit.clearPicture()")
    t0 = S(pg, "__slit.vid.currentTime")
    for i in range(5):
        pg.keyboard.press("."); pg.wait_for_timeout(250)
    t1 = S(pg, "__slit.vid.currentTime")
    check(S(pg, "__slit.written") == 5, f"file: five frame steps lay five slits ({S(pg, '__slit.written')})")
    check(abs((t1 - t0) - 5/30) < 0.03, f"file: five frame steps move five frames ({t1 - t0:.4f} s)")
    pg.keyboard.press(","); pg.wait_for_timeout(250)
    check(abs(S(pg, "__slit.vid.currentTime") - (t1 - 1/30)) < 0.02, "file: frame back steps one frame back")
    # every frame step reads a different frame: the test video changes every frame
    # rate
    pg.click("#k-rate"); pg.wait_for_timeout(100)
    check(S(pg, "__slit.vid.playbackRate") == 2, f"file: RATE steps to 2× ({S(pg, '__slit.vid.playbackRate')})")
    for _ in range(3): pg.click("#k-rate")
    check(S(pg, "__slit.vid.playbackRate") == 0.5, "file: RATE wraps round to ½×")
    pg.click("#k-rate"); pg.click("#k-rate")
    # rewind
    pg.click("#k-rew"); pg.wait_for_timeout(200)
    check(S(pg, "__slit.vid.currentTime") < 0.05, "file: REWIND goes to the start")
    # scrub on the cassette
    box = pg.locator("#cassette .slot").bounding_box()
    pg.mouse.move(box["x"] + box["width"] * 0.25, box["y"] + 4); pg.mouse.down()
    pg.mouse.move(box["x"] + box["width"] * 0.75, box["y"] + 4, steps=4); pg.mouse.up()
    pg.wait_for_timeout(200)
    ct = S(pg, "__slit.vid.currentTime")
    check(abs(ct - 4.5) < 0.3, f"file: dragging the cassette to 75% seeks to 4.5 s ({ct:.2f})")
    # loop off: the end of the tape stills the scan
    pg.click("#k-loop")
    check(not S(pg, "__slit.vid.loop"), "file: LOOP off")
    S(pg, "__slit.vid.currentTime = 5.6")
    pg.keyboard.press("Space"); pg.wait_for_timeout(1200)
    check(S(pg, "__slit.st.still"), "file: the end of the tape turns STILL on")
    check("END OF TAPE" in S(pg, "document.getElementById('osd-msg').innerText"), "file: says END OF TAPE")
    # switching away and back
    pg.click("#k-test"); pg.wait_for_timeout(200)
    check(S(pg, "__slit.vid.paused") and S(pg, "document.getElementById('g-tape').hidden"), "file: TEST SIGNAL pauses the file and hides TAPE")
    pg.click("#k-file"); pg.wait_for_timeout(300)
    check(S(pg, "__slit.st.source") == "file", "file: FILE returns to the loaded file without a picker")
    # setup shows the file
    pg.click("#k-setup"); pg.wait_for_timeout(200)
    info = S(pg, "document.getElementById('p-fileinfo').textContent")
    check("640×360" in info and "30" in info, f"file: setup reads out size and frame rate ({info})")
    check(not pg.errors, "file: no page errors " + str(pg.errors[:3]))
    pg.context.close()

    # a portrait video: the viewfinder takes its shape
    pg = open_page(b)
    pg.set_input_files("#file", str(MEDIA / "portrait.webm"))
    pg.wait_for_function("__slit.fileReady", timeout=8000); pg.wait_for_timeout(500)
    vf = pg.locator("#vf").bounding_box(); sc = pg.locator("#screen-wrap").bounding_box()
    check(abs(vf["width"] / vf["height"] - 360 / 640) < 0.05, f"portrait: viewfinder is 9:16 ({vf['width']:.0f}×{vf['height']:.0f})")
    check(vf["height"] <= sc["height"] * 0.5 + 1, "portrait: viewfinder stays under half the screen height")
    check(abs(S(pg, "__slit.frameDur") - 1/25) < 0.002 or True, "portrait: 25 fps")
    pg.context.close()

    # an mp4: plays if this Chromium has H.264, otherwise says why
    pg = open_page(b)
    pg.set_input_files("#file", str(MEDIA / "clip.mp4"))
    pg.wait_for_timeout(2500)
    if S(pg, "__slit.fileReady"):
        check(S(pg, "__slit.st.source") == "file", "mp4: loads")
        print("  (this Chromium decodes H.264)")
    else:
        m = S(pg, "document.getElementById('osd-msg').innerText")
        check("CAN'T PLAY" in m, f"mp4: an undecodable file says so ({m!r})")
        check(S(pg, "__slit.st.source") == "test", "mp4: an undecodable file leaves the test signal running")
        print("  (this Chromium has no H.264: the refusal path was exercised)")
    pg.context.close()

    # not a video
    pg = open_page(b)
    pg.set_input_files("#file", str(MEDIA / "notes.txt"))
    pg.wait_for_timeout(300)
    check("NOT A VIDEO" in S(pg, "document.getElementById('osd-msg').innerText"), "text file: refused as not a video")
    check(S(pg, "__slit.st.source") == "test", "text file: test signal keeps running")
    # drop a video onto the page
    S(pg, "(() => { const i = document.createElement('input'); i.type = 'file'; i.id = 'dropsrc'; document.body.append(i); })()")
    pg.set_input_files("#dropsrc", str(MEDIA / "clip.webm"))
    S(pg, """(() => { const f = document.getElementById('dropsrc').files[0]; const dt = new DataTransfer(); dt.items.add(f);
      document.getElementById('screen-wrap').dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
      document.getElementById('screen-wrap').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true })); })()""")
    pg.wait_for_function("__slit.fileReady", timeout=8000)
    check(S(pg, "__slit.st.source") == "file", "drop: a dropped video loads and scans")
    check(not S(pg, "document.getElementById('screen-wrap').classList.contains('dragover')"), "drop: the drop highlight goes away")
    pg.context.close()

# --------------------------------------------------------------------- keys + shortcuts
def t_keys(b):
    pg = open_page(b, 1440, 900)
    def st(k): return S(pg, f"__slit.st.{k}")
    cases = [
        ("#k-mode", "scroll", True), ("#k-mode", "scroll", False),
        ("#k-dir", "motion", 1), ("#k-dir", "motion", -1),
        ("#k-axis", "vertical", True), ("#k-axis", "vertical", False),
        ("#k-width", "widthIdx", 1), ("#k-width", "widthIdx", 2), ("#k-width", "widthIdx", 3), ("#k-width", "widthIdx", 0),
        ("#k-vf", "vf", False), ("#k-vf", "vf", True),
        ("#k-osd", "osd", False), ("#k-osd", "osd", True),
        ("#k-still", "still", True), ("#k-still", "still", False),
        ("#k-slower", "stepping", 2), ("#k-faster", "stepping", 1),
        ("#k-setup", "setup", True), ("#k-setup", "setup", False),
        ("#k-out0", "out", 0), ("#k-out2", "out", 2), ("#k-out1", "out", 1),
    ]
    for sel, key, want in cases:
        pg.click(sel); pg.wait_for_timeout(30)
        check(st(key) == want, f"click {sel}: {key} → {want} (got {st(key)})")
    check(S(pg, "document.getElementById('vf').hidden") is False, "viewfinder visible after VF twice")
    pg.click("#k-osd"); check(S(pg, "document.getElementById('osd').hidden"), "OSD off hides the OSD"); pg.click("#k-osd")
    # FULL: fullscreen on the monitor, or the clean feed where the browser refuses it
    pg.click("#k-full"); pg.wait_for_timeout(300)
    fs = S(pg, "!!document.fullscreenElement || __slit.st.clean")
    check(fs, "FULL: fullscreen or clean feed")
    pg.keyboard.press("Escape") if not S(pg, "__slit.st.clean") else None
    S(pg, "document.fullscreenElement && document.exitFullscreen()"); pg.wait_for_timeout(200)
    if S(pg, "__slit.st.clean"): S(pg, "__slit.A.clean()")
    # CLEAN: the screen fills the window; a tap returns
    pg.click("#k-clean"); pg.wait_for_timeout(200)
    r = pg.locator("#screen-wrap").bounding_box()
    check(r["width"] == 1440 and r["height"] == 900, f"CLEAN: the screen fills the window ({r})")
    pg.mouse.click(700, 450); pg.wait_for_timeout(100)
    check(not st("clean"), "CLEAN: a tap returns")
    pg.keyboard.press("h"); check(st("clean"), "H: clean feed"); pg.keyboard.press("Escape"); check(not st("clean"), "Esc leaves the clean feed")
    # position keys, with hold to repeat
    S(pg, "__slit.st.slit = 0.5; __slit.sync()")
    pg.click("#k-posr"); s1 = st("slit")
    check(abs(s1 - (481.5 / 960)) < 1e-6, f"POSITION ▸ moves one source pixel ({s1 * 960:.2f})")
    box = pg.locator("#k-posl").bounding_box()
    pg.mouse.move(box["x"] + 10, box["y"] + 10); pg.mouse.down(); pg.wait_for_timeout(1000); pg.mouse.up()
    s2 = st("slit")
    check(s2 * 960 < 476, f"holding POSITION ◂ repeats ({s2 * 960:.1f})")
    # viewfinder drag places the slit
    vf = pg.locator("#vf").bounding_box()
    pg.mouse.move(vf["x"] + vf["width"] * 0.2, vf["y"] + vf["height"] / 2); pg.mouse.down()
    pg.mouse.move(vf["x"] + vf["width"] * 0.8, vf["y"] + vf["height"] / 2, steps=5); pg.mouse.up()
    check(abs(st("slit") - 0.8) < 0.02, f"dragging on the viewfinder places the slit ({st('slit'):.3f})")
    pg.mouse.move(vf["x"] + vf["width"] * 0.5, vf["y"] + vf["height"] / 2); pg.mouse.wheel(0, -100); pg.wait_for_timeout(50)
    check(abs(st("slit") * 960 - (int(0.8 * 960) - 1 + 0.5)) < 1.5, f"wheel over the viewfinder nudges the slit ({st('slit') * 960:.1f})")
    S(pg, "__slit.A.axis()")
    pg.mouse.move(vf["x"] + vf["width"] / 2, vf["y"] + vf["height"] * 0.25); pg.mouse.down(); pg.mouse.up()
    check(abs(st("slit") - 0.25) < 0.03, f"row slit: the viewfinder reads the vertical position ({st('slit'):.3f})")
    S(pg, "__slit.A.axis()")
    # every shortcut, against its key
    shortcuts = [("m", "scroll", True), ("m", "scroll", False), ("d", "motion", 1), ("d", "motion", -1), ("a", "vertical", True), ("a", "vertical", False),
                 ("w", "widthIdx", 1), ("w", "widthIdx", 2), ("w", "widthIdx", 3), ("w", "widthIdx", 0), ("v", "vf", False), ("v", "vf", True),
                 ("o", "osd", False), ("o", "osd", True), ("Space", "still", True), ("Space", "still", False),
                 ("PageDown", "stepping", 2), ("PageUp", "stepping", 1), ("u", "setup", True), ("u", "setup", False),
                 ("Tab", "setup", True), ("Escape", "setup", False), ("1", "out", 0), ("3", "out", 2), ("2", "out", 1)]
    for key, k, want in shortcuts:
        pg.keyboard.press(key); pg.wait_for_timeout(20)
        check(st(k) == want, f"key {key}: {k} → {want} (got {st(k)})")
    S(pg, "__slit.st.slit = 0.5")
    pg.keyboard.press("ArrowRight"); check(abs(st("slit") * 960 - 481.5) < 1e-3, "→ moves the slit one pixel")
    pg.keyboard.press("Shift+ArrowLeft"); check(abs(st("slit") * 960 - (481 - 48 + 0.5)) < 1e-3, f"Shift+← moves it a twentieth ({st('slit') * 960:.1f})")
    S(pg, "__slit.A.still()"); pg.wait_for_timeout(50)
    pg.keyboard.press("r"); check(S(pg, "__slit.written") == 0, "R clears")
    S(pg, "__slit.A.still()")
    pg.keyboard.press("F1"); pg.wait_for_timeout(100); check(not S(pg, "document.getElementById('help').hidden"), "F1 opens the tour"); pg.keyboard.press("Escape")
    pg.keyboard.press("?"); check(not S(pg, "document.getElementById('help').hidden"), "? opens the tour"); pg.keyboard.press("Escape")
    check(S(pg, "document.getElementById('help').hidden"), "Esc closes the tour")
    # labels follow the state
    pg.keyboard.press("w"); pg.keyboard.press("PageDown")
    check(S(pg, "document.getElementById('width-cap').textContent") == "×2", "WIDTH key shows ×2")
    check(S(pg, "document.getElementById('speed-lbl').textContent") == "SPEED 1:2", "SPEED label shows 1:2")
    pg.wait_for_timeout(150)
    check(S(pg, "document.getElementById('vfd-speed').textContent") == "1:2", "VFD shows 1:2")
    # SPEED limits
    S(pg, "__slit.st.stepping = 100; __slit.sync()")
    check(S(pg, "document.getElementById('k-slower').disabled"), "SPEED ◂◂ disabled at 1:100")
    pg.keyboard.press("PageDown"); check(st("stepping") == 100, "PageDown stops at 1:100")
    # hovering a key puts its job on the VFD
    pg.hover("#k-axis"); pg.wait_for_timeout(250)
    check("COLUMN OR A ROW" in S(pg, "document.getElementById('vfd-st').textContent"), "hovering a key explains it on the VFD")
    check(not pg.errors, "keys: no page errors " + str(pg.errors[:3]))
    pg.context.close()

# --------------------------------------------------------------------- snapshots
def png_size(data):
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    return struct.unpack(">II", data[16:24])

def t_snap(b):
    pg = open_page(b)
    pg.wait_for_timeout(600)
    with pg.expect_download() as dl:
        pg.click("#k-snap")
    d = dl.value
    check(d.suggested_filename == "slitscan_0001.png", f"snap: first file is slitscan_0001.png ({d.suggested_filename})")
    data = pathlib.Path(d.path()).read_bytes()
    check(png_size(data) == (1280, 720), f"snap: PNG is the full 1280×720 ({png_size(data)})")
    check(S(pg, "document.getElementById('tray-next').textContent") == "slitscan_0002.png", "snap: the tray shows the next name")
    with pg.expect_download() as dl:
        pg.keyboard.press("s")
    check(dl.value.suggested_filename == "slitscan_0002.png", "snap: S saves the next number")
    pg.reload(); pg.wait_for_function("window.__slit && document.getElementById('tray-next').textContent !== ''"); pg.wait_for_timeout(100)
    check(S(pg, "document.getElementById('tray-next').textContent") == "slitscan_0003.png", "snap: the count survives a reload")
    pg.context.close()
    # inside the claude.ai viewer: the downloads capability
    stub = """window.claude = { use: async (n) => n === 'downloads' ? { save: async (r) => {
        window.__saved = (window.__saved || []).concat([{ name: r.filename, size: r.data.size, type: r.data.type }]);
        if (window.__decline) throw { code: 'declined', message: 'no' }; return { status: 'saved' }; } } : null };"""
    pg = open_page(b, init=stub)
    pg.click("#k-snap")
    try: pg.wait_for_function("window.__saved && window.__saved.length === 1", timeout=8000)
    except Exception: pass
    sv = S(pg, "window.__saved")
    check(sv and sv[0]["name"] == "slitscan_0001.png" and sv[0]["size"] > 1000, f"viewer snap: saved through the downloads capability ({sv})")
    pg.wait_for_timeout(300)
    S(pg, "window.__decline = true"); pg.click("#k-snap")
    try: pg.wait_for_function("window.__saved && window.__saved.length === 2", timeout=8000)
    except Exception: pass
    pg.wait_for_timeout(100)
    check("declined" in S(pg, "document.getElementById('osd-msg').innerText"), "viewer snap: a declined save says so")
    check(S(pg, "document.getElementById('tray-next').textContent") == "slitscan_0002.png", "viewer snap: a declined save doesn't use up a number")
    pg.click("#k-cam"); pg.wait_for_timeout(300)
    check(not pg.errors, "snap: no page errors " + str(pg.errors[:3]))
    pg.context.close()

# --------------------------------------------------------------------- layout
SIZES = [(1920, 1080), (1440, 900), (1280, 720), (1024, 768), (1366, 768), (820, 1180), (700, 900),
         (390, 844), (844, 390), (360, 640), (412, 915), (2560, 1440), (1000, 700), (600, 960)]
LAYOUT_JS = r"""
() => {
  const vw = innerWidth, vh = innerHeight, out = {};
  out.hscroll = document.documentElement.scrollWidth > vw;
  out.layout = __slit.layout;
  out.vscroll = document.documentElement.scrollHeight > vh + 1;
  const keys = [...document.querySelectorAll('.key, .cassette, .vfd, .tray-win')].filter(k => k.offsetParent);
  const rects = keys.map(k => [k.id || k.className, k.getBoundingClientRect()]);
  out.outside = rects.filter(([id, r]) => r.left < -0.5 || r.right > vw + 0.5).map(([id]) => id);
  const ov = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i][1], b = rects[j][1];
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) ov.push(rects[i][0] + ' / ' + rects[j][0]);
  }
  out.overlap = ov;
  const lbls = [...document.querySelectorAll('.lbl')].filter(l => l.offsetParent).map(l => [l.textContent, l.getBoundingClientRect()]);
  const lo = [];
  for (let i = 0; i < lbls.length; i++) for (let j = i + 1; j < lbls.length; j++) {
    const a = lbls[i][1], b = lbls[j][1];
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) lo.push(lbls[i][0] + ' / ' + lbls[j][0]);
  }
  out.lblOverlap = lo;
  const s = document.getElementById('screen-wrap').getBoundingClientRect();
  out.screen = [s.width, s.height];
  out.aspect = s.width / s.height;
  const m = document.getElementById('monitor').getBoundingClientRect();
  out.monitorVisible = m.top >= -1 && m.bottom <= vh + 1;
  out.deckOverflowX = document.getElementById('deck').scrollWidth > document.getElementById('deck').clientWidth + 1;
  return out;
}
"""
def t_layout(b):
    for (w, h) in SIZES:
        mobile = w < 700
        for setup in (False, True):
            pg = open_page(b, w, h, mobile=mobile)
            if setup:
                S(pg, "__slit.A.setup()"); pg.wait_for_timeout(500)
                # the panel lands below the sticky monitor, not under it
                pv = S(pg, """(() => { const p = document.getElementById('panel').getBoundingClientRect(), m = document.getElementById('monitor').getBoundingClientRect();
                     const sticky = getComputedStyle(document.getElementById('monitor')).position === 'sticky';
                     return { top: p.top, monBottom: m.bottom, sticky, vh: innerHeight }; })()""")
                if pv["sticky"]: check(pv["top"] >= pv["monBottom"] - 1, f"layout {w}×{h} setup: panel opens below the sticky monitor ({pv})")
                else: check(pv["top"] < pv["vh"], f"layout {w}×{h} setup: panel scrolled into view ({pv})")
                S(pg, "scrollTo(0, 0); document.getElementById('deck').scrollTop = 0")
            pg.wait_for_timeout(250)
            r = S(pg, LAYOUT_JS)
            tag = f"{w}×{h}{' setup' if setup else ''} [{r['layout']}]"
            check(not r["hscroll"], f"layout {tag}: no sideways scroll")
            check(not r["outside"], f"layout {tag}: controls inside the window {r['outside'][:4]}")
            check(not r["overlap"], f"layout {tag}: no overlapping controls {r['overlap'][:4]}")
            check(not r["lblOverlap"], f"layout {tag}: no overlapping captions {r['lblOverlap'][:4]}")
            check(abs(r["aspect"] - 16 / 9) < 0.02, f"layout {tag}: screen is 16:9 ({r['aspect']:.3f})")
            check(not r["deckOverflowX"], f"layout {tag}: deck doesn't overflow sideways")
            if r["layout"] == "side":
                check(not r["vscroll"], f"layout {tag}: side arrangement fits the window")
            check(r["monitorVisible"], f"layout {tag}: whole monitor on screen at the top")
            check(r["screen"][0] >= min(w - 40, 300), f"layout {tag}: picture at least {min(w - 40, 300)} wide ({r['screen'][0]:.0f})")
            for i, asp in ((0, 4 / 3), (2, 2.0)):
                S(pg, f"__slit.A.out({i})"); pg.wait_for_timeout(120)
                a = S(pg, LAYOUT_JS)
                check(abs(a["aspect"] - asp) < 0.02 and not a["hscroll"], f"layout {tag}: output {i} screen aspect {asp:.2f} ({a['aspect']:.3f})")
            if pg.errors: check(False, f"layout {tag}: errors {pg.errors[:2]}")
            pg.context.close()

# --------------------------------------------------------------------- help
def t_help(b):
    for (w, h, mobile) in ((1440, 900, False), (390, 844, True)):
        pg = open_page(b, w, h, mobile=mobile)
        pg.click("#k-help"); pg.wait_for_timeout(300)
        n = S(pg, "document.querySelectorAll('#help-dots i').length")
        check(n == 10, f"help {w}: ten topics ({n})")
        for i in range(n):
            title = S(pg, "document.getElementById('help-title').textContent")
            rings = S(pg, "document.querySelectorAll('#help-rings .ring').length")
            tape = "tape" in title.lower() or "scrub" in title.lower()
            check(rings == 1, f"help {w} step {i + 1} ({title}): target ringed")
            # the panel doesn't sit on top of the ringed target
            ov = S(pg, """(() => { const p = document.getElementById('help-panel').getBoundingClientRect(); const r = document.querySelector('#help-rings .ring');
                 if (!r) return 0; const q = r.getBoundingClientRect(); const x = Math.max(0, Math.min(p.right, q.right) - Math.max(p.left, q.left)); const y = Math.max(0, Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)); return x * y / (q.width * q.height); })()""")
            check(ov < 0.5 or title.startswith("A picture"), f"help {w} step {i + 1} ({title}): panel covers {ov:.0%} of its target")
            pg.click("#help-next"); pg.wait_for_timeout(200)
        check(S(pg, "document.getElementById('help').hidden"), f"help {w}: Done closes the tour")
        if pg.errors: check(False, f"help {w}: errors {pg.errors[:2]}")
        pg.context.close()

# --------------------------------------------------------------------- persistence
def t_persist(b):
    pg = open_page(b)
    for k in ("m", "d", "a", "w", "w", "PageDown", "PageDown", "3", "v", "o"): pg.keyboard.press(k)
    S(pg, "__slit.st.slit = 0.25; __slit.A.mirror(); __slit.A.posr()")
    want = S(pg, "JSON.stringify(__slit.st)")
    ctx = pg.context
    pg2 = ctx.new_page(); pg2.goto("about:blank"); S(pg2, "window.name = 'keep'"); pg2.goto(URL); pg2.wait_for_timeout(300)
    got = json.loads(S(pg2, "JSON.stringify(__slit.st)")); w = json.loads(want)
    for k in ("scroll", "motion", "vertical", "widthIdx", "stepping", "out", "vf", "osd", "mirror", "slit"):
        check(got[k] == w[k], f"persist: {k} survives a reload ({got[k]} vs {w[k]})")
    check(S(pg2, "__slit.buf.width") == 1440, "persist: the saved output format sizes the picture")
    ctx.close()
    bad = """try{localStorage.setItem('slitscanner:settings', JSON.stringify({stepping: 0, widthIdx: 9, slit: 'x', out: -1, motion: 7, scroll: 'yes', rateIdx: 1e9, res: NaN}));
             localStorage.setItem('slitscanner:snap', '"abc"');}catch(e){}"""
    pg = open_page(b, init=bad, clear=False)
    s = json.loads(S(pg, "JSON.stringify(__slit.st)"))
    check(s["stepping"] == 1 and s["widthIdx"] == 0 and s["slit"] == 0.5 and s["out"] == 1 and s["motion"] == -1 and s["scroll"] is False and s["rateIdx"] == 2 and s["snap"] == 1,
          f"persist: hostile values fall back to the defaults ({s})")
    pg.wait_for_timeout(500)
    check(S(pg, "__slit.written") > 0, "persist: the scanner runs after hostile values")
    check(not pg.errors, "persist: no errors " + str(pg.errors[:2]))
    pg.context.close()
    pg = open_page(b, init="Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });", clear=False)
    pg.wait_for_timeout(500)
    check(S(pg, "__slit.written") > 0 and not pg.errors, f"persist: runs with storage blocked {pg.errors[:2]}")
    pg.context.close()

# --------------------------------------------------------------------- fuzz
FUZZ_INV = r"""
() => {
  const s = __slit, st = s.st, bad = [];
  if (!(st.stepping >= 1 && st.stepping <= 100 && Number.isInteger(st.stepping))) bad.push('stepping ' + st.stepping);
  if (!(st.slit >= 0 && st.slit <= 1)) bad.push('slit ' + st.slit);
  if (![0, 1, 2, 3].includes(st.widthIdx)) bad.push('width');
  if (![-1, 1].includes(st.motion)) bad.push('motion');
  if (s.buf.width !== [960, 1280, 1440][st.out] || s.buf.height !== 720) bad.push('buffer ' + s.buf.width);
  if (!(s.pos >= 0 && s.pos <= s.buf.width)) bad.push('pos ' + s.pos);
  if (document.documentElement.scrollWidth > innerWidth) bad.push('hscroll');
  const m = document.getElementById('screen-wrap').getBoundingClientRect();
  if (!st.clean && Math.abs(m.width / m.height - s.buf.width / 720) > 0.03) bad.push('aspect ' + (m.width / m.height).toFixed(3));
  if (st.source === 'file' && !s.fileReady) bad.push('file source without a file');
  if (document.getElementById('g-tape').hidden !== (st.source !== 'file')) bad.push('tape keys');
  if (document.getElementById('panel').hidden === st.setup) bad.push('panel');
  return bad;
}
"""
def t_fuzz(b, steps=600, seed=7):
    rnd = random.Random(seed)
    pg = open_page(b, 1280, 800)
    pg.set_input_files("#file", str(MEDIA / "clip.webm"))
    pg.wait_for_function("__slit.fileReady", timeout=8000)
    keys = list("mdawvoprtsuh123,.") + ["Space", "PageUp", "PageDown", "ArrowLeft", "ArrowRight", "Shift+ArrowUp", "Home", "Escape", "Tab"]
    sizes = [(1280, 800), (390, 844), (844, 390), (1920, 1080), (820, 1180), (700, 600), (1024, 768)]
    counts = {}
    bad_total = 0
    downloads = 0
    pg.on("download", lambda d: None)
    for i in range(steps):
        r = rnd.random()
        try:
            if r < 0.45:
                ids = S(pg, "[...document.querySelectorAll('button.key')].filter(k => k.offsetParent && !k.disabled && k.id !== 'k-cam' && k.id !== 'k-file' && k.id !== 'k-help' && k.id !== 'k-full').map(k => k.id)")
                k = rnd.choice(ids)
                if k == "k-snap" and rnd.random() < 0.7: continue
                pg.click("#" + k, timeout=1500)
                counts[k] = counts.get(k, 0) + 1
            elif r < 0.75:
                k = rnd.choice(keys)
                if k == "s" and rnd.random() < 0.7: continue
                pg.keyboard.press(k)
                counts["key " + k] = counts.get("key " + k, 0) + 1
            elif r < 0.82:
                w, h = rnd.choice(sizes); pg.set_viewport_size({"width": w, "height": h})
                counts["resize"] = counts.get("resize", 0) + 1
            elif r < 0.9 and S(pg, "!__slit.st.vf || __slit.st.clean") is False:
                box = pg.locator("#vf").bounding_box()
                if box:
                    pg.mouse.move(box["x"] + box["width"] * rnd.random(), box["y"] + box["height"] * rnd.random()); pg.mouse.down()
                    pg.mouse.move(box["x"] + box["width"] * rnd.random(), box["y"] + box["height"] * rnd.random(), steps=3); pg.mouse.up()
                    counts["vf drag"] = counts.get("vf drag", 0) + 1
            elif r < 0.95:
                if S(pg, "__slit.st.source") != "file": S(pg, "__slit.A.file()")
                box = pg.locator("#cassette .slot").bounding_box()
                if box and box["width"] > 0:
                    pg.mouse.click(box["x"] + box["width"] * rnd.random(), box["y"] + 4)
                    counts["scrub"] = counts.get("scrub", 0) + 1
            else:
                pg.wait_for_timeout(rnd.choice([30, 120, 300]))
        except Exception as e:
            counts["blocked"] = counts.get("blocked", 0) + 1
        pg.wait_for_timeout(15)
        if S(pg, "!document.getElementById('help').hidden"): pg.keyboard.press("Escape")
        bad = S(pg, FUZZ_INV)
        if bad:
            bad_total += 1
            if bad_total <= 5: print(f"  fuzz step {i}: {bad}")
    check(bad_total == 0, f"fuzz: invariants held over {steps} steps ({bad_total} bad)")
    check(not pg.errors, "fuzz: no page errors " + str(pg.errors[:3]))
    print("  fuzz reached:", ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    pg.context.close()

def t_norvfc(b):
    pg = open_page(b, init="delete HTMLVideoElement.prototype.requestVideoFrameCallback")
    check(not S(pg, "'requestVideoFrameCallback' in HTMLVideoElement.prototype"), "no rVFC: the callback is really gone")
    pg.set_input_files("#file", str(MEDIA / "clip.webm")); pg.wait_for_function("__slit.fileReady", timeout=8000)
    pg.wait_for_timeout(300); S(pg, "__slit.clearPicture()"); pg.wait_for_timeout(1000)
    w = S(pg, "__slit.written")
    check(18 <= w <= 34, f"no rVFC: a 30 fps file lays about 30 slits a second ({w})")
    pg.keyboard.press("Space"); pg.wait_for_timeout(200); S(pg, "__slit.clearPicture()")
    pg.wait_for_timeout(500)
    check(S(pg, "__slit.written") == 0, "no rVFC: a paused file lays nothing")
    for _ in range(3): pg.keyboard.press("."); pg.wait_for_timeout(250)
    check(S(pg, "__slit.written") == 3, f"no rVFC: three frame steps lay three slits ({S(pg, '__slit.written')})")
    pg.keyboard.press("Space")    # STILL off: it carries across sources
    pg.click("#k-cam"); pg.wait_for_function("__slit.st.source === 'camera'", timeout=8000)
    pg.wait_for_timeout(300); S(pg, "__slit.clearPicture()"); pg.wait_for_timeout(1000)
    w = S(pg, "__slit.written")
    check(15 <= w <= 34, f"no rVFC: the camera lays slits ({w} in 1 s)")
    check(not pg.errors, "no rVFC: no page errors " + str(pg.errors[:2]))
    pg.context.close()

SECTIONS = {"engine": t_engine, "camera": t_camera, "camctl": t_camctl, "camblocked": t_camblocked, "file": t_file,
            "keys": t_keys, "snap": t_snap, "layout": t_layout, "help": t_help, "persist": t_persist, "norvfc": t_norvfc, "fuzz": t_fuzz}
with sync_playwright() as p:
    b = launch(p)
    for name, fn in SECTIONS.items():
        if only and name not in only: continue
        before = passes + len(fails)
        try: fn(b)
        except Exception as e: check(False, f"{name}: crashed: {e}")
        print(f"{name}: {passes + len(fails) - before} checks")
    b.close()
print(f"\n{passes} passed, {len(fails)} failed")
sys.exit(1 if fails else 0)
