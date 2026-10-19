"""Quick look: render the standalone page at a size, log console errors, save a screenshot.
usage: python3 test/shot.py WxH out.png [--file media] [--setup] [--wait ms]"""
import sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
page_url = (ROOT / "dist" / "Slitscanner-standalone.html").as_uri()
w, h = map(int, sys.argv[1].split("x"))
out = sys.argv[2]
args = sys.argv[3:]
mobile = w < 700
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, has_touch=mobile, is_mobile=mobile)
    ctx.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="text/css", body=(ROOT / "test" / "fonts.css").read_text()))
    pg = ctx.new_page()
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)))
    pg.goto(page_url)
    pg.wait_for_timeout(1500)
    print("fonts", pg.evaluate("[...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).join(', ')"))
    if "--file" in args:
        f = args[args.index("--file") + 1]
        pg.set_input_files("#file", str(ROOT / "test" / "media" / f))
        pg.wait_for_timeout(2500)
    if "--cam" in args:
        pg.click("#k-cam"); pg.wait_for_timeout(2000)
    if "--setup" in args:
        pg.evaluate("__slit.A.setup()"); pg.wait_for_timeout(500)
    if "--help" in args:
        pg.evaluate("__slit.A.help()"); pg.wait_for_timeout(600)
    if "--clean" in args:
        pg.evaluate("__slit.A.clean()"); pg.wait_for_timeout(600)
    wait = int(args[args.index("--wait") + 1]) if "--wait" in args else 2500
    pg.wait_for_timeout(wait)
    sw = pg.evaluate("[document.documentElement.scrollWidth, innerWidth, document.documentElement.scrollHeight, innerHeight, __slit.layout, __slit.status()]")
    print("scroll", sw)
    pg.screenshot(path=out, full_page="--full" in args)
    for e in errs: print("console:", e)
    b.close()
