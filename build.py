#!/usr/bin/env python3
"""Inline src/ into two pages:
   dist/Slitscanner.html             the artifact body (the publisher adds the skeleton)
   dist/Slitscanner-standalone.html  a complete page that opens from disk
"""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
src = ROOT / "src"
css = (src / "app.css").read_text()
html = (src / "app.html").read_text()
js = (src / "app.js").read_text()

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:'
         'ital,wght@0,500;0,600;0,700;0,800;1,700&family=Barlow:wght@400;500;600&family=Share+Tech+Mono'
         '&family=VT323&display=swap">\n')
HEAD = ('<title>Slitscanner</title>\n'
        '<meta name="description" content="Slitscanner: a slit-scan camera for the camera, video files '
        'and a test card, by Eduardo Morais.">\n' + FONTS)
body = HEAD + "<style>\n" + css + "</style>\n" + html + "<script>\n" + js + "</script>\n"

dist = ROOT / "dist"
dist.mkdir(exist_ok=True)
(dist / "Slitscanner.html").write_text(body)

reset = (":root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);"
         "padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;padding:0}"
         "[hidden]{display:none!important}")
standalone = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
              '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
              f'<style>{reset}</style>\n' + HEAD + "</head><body>\n" +
              "<style>\n" + css + "</style>\n" + html + "<script>\n" + js + "</script>\n</body></html>\n")
(dist / "Slitscanner-standalone.html").write_text(standalone)
print("built", len(body), "bytes")
