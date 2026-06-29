"""
Comprehensive mobile visual analysis of rankenstein.pro
iPhone 14 Pro viewport: 393x852
Section-by-section viewport screenshots with annotations.
All screenshots capped under 1800px in both dimensions.
"""
from playwright.sync_api import sync_playwright
import time
import json

import os
SCREENSHOTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "screenshots")
URL = "https://rankenstein.pro/"  # Default; override via CLI if needed
VIEWPORT_W = 393
VIEWPORT_H = 852


def take_screenshots():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": VIEWPORT_W, "height": VIEWPORT_H},
            device_scale_factor=2,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            is_mobile=True,
            has_touch=True,
        )
        page = context.new_page()

        print("[1] Loading page...")
        page.goto(URL, wait_until="networkidle", timeout=30000)
        time.sleep(3)

        total_height = page.evaluate("document.body.scrollHeight")
        print(f"    Total page height: {total_height}px")

        # ============================================================
        # SCREENSHOT 1: Hero / above the fold (clean, no annotations)
        # ============================================================
        print("\n[2] Hero / above the fold (clean)...")
        page.evaluate("window.scrollTo(0, 0)")
        time.sleep(0.5)
        page.screenshot(path=f"{SCREENSHOTS_DIR}/mobile-01-hero.png", full_page=False)

        # ============================================================
        # SCREENSHOT 2: Hero with touch target annotations
        # ============================================================
        print("[3] Hero with touch target annotations...")
        touch_count = page.evaluate("""() => {
            let count = 0;
            document.querySelectorAll('a, button, input, select, textarea, [role="button"], [onclick]').forEach(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return;
                if (rect.width === 0 || rect.height === 0) return;
                if (rect.width < 44 || rect.height < 44) {
                    el.style.outline = '3px solid red';
                    el.style.outlineOffset = '2px';
                    count++;
                }
            });
            return count;
        }""")
        print(f"    Found {touch_count} small touch targets (<44px)")
        page.screenshot(path=f"{SCREENSHOTS_DIR}/mobile-02-hero-touch-annotated.png", full_page=False)

        # Clear annotations
        page.evaluate("""() => {
            document.querySelectorAll('*').forEach(el => {
                el.style.outline = '';
                el.style.outlineOffset = '';
            });
        }""")

        # ============================================================
        # SCREENSHOT 3: Navigation (try to open hamburger)
        # ============================================================
        print("[4] Mobile navigation...")
        page.evaluate("window.scrollTo(0, 0)")
        time.sleep(0.3)

        nav_info = page.evaluate("""() => {
            const selectors = [
                'button[class*="menu"]', 'button[class*="hamburger"]',
                'button[class*="toggle"]', 'button[class*="nav"]',
                'button[aria-label*="menu"]', 'button[aria-label*="Menu"]',
                '[class*="hamburger"]', '[class*="mobile-menu"]',
                '.menu-toggle', '#menu-toggle', '.navbar-toggler',
                'header button', 'nav button',
                '[class*="MenuToggle"]', '[class*="menu_toggle"]',
                'a[class*="menu"]', 'div[class*="burger"]',
            ];
            const results = [];
            selectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    results.push({
                        selector: sel,
                        tag: el.tagName,
                        class: el.className?.toString()?.substring(0, 80) || '',
                        id: el.id || '',
                        visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
                        display: style.display,
                        visibility: style.visibility,
                        w: Math.round(rect.width),
                        h: Math.round(rect.height),
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        html: el.outerHTML.substring(0, 200),
                    });
                });
            });
            return results;
        }""")
        print(f"    Found {len(nav_info)} potential nav toggles:")
        for ni in nav_info:
            vis = 'VISIBLE' if ni['visible'] else 'HIDDEN'
            print(f"      [{vis}] {ni['tag']}.{ni['class'][:40]} id={ni['id']} {ni['w']}x{ni['h']} at ({ni['x']},{ni['y']})")

        # Try clicking visible nav toggles
        opened_nav = False
        for ni in nav_info:
            if ni['visible'] and ni['w'] > 0:
                try:
                    print(f"    Trying to click: {ni['html'][:100]}...")
                    page.evaluate("""(html) => {
                        document.querySelectorAll('button, a, div').forEach(el => {
                            if (el.outerHTML.substring(0, 200) === html) {
                                el.click();
                            }
                        });
                    }""", ni['html'])
                    time.sleep(1)
                    page.screenshot(path=f"{SCREENSHOTS_DIR}/mobile-03-nav-open.png", full_page=False)
                    opened_nav = True
                    print("    Nav opened successfully!")
                    break
                except Exception as e:
                    print(f"    Click failed: {e}")

        if not opened_nav:
            page.evaluate("""() => {
                const headerBtns = document.querySelectorAll('header button, header a, nav button');
                headerBtns.forEach(btn => {
                    const rect = btn.getBoundingClientRect();
                    if (rect.y < 100) btn.click();
                });
            }""")
            time.sleep(1)
            page.screenshot(path=f"{SCREENSHOTS_DIR}/mobile-03-nav-open.png", full_page=False)

        # Close menu
        if opened_nav:
            for ni in nav_info:
                if ni['visible'] and ni['w'] > 0:
                    try:
                        page.evaluate("""(html) => {
                            document.querySelectorAll('button, a, div').forEach(el => {
                                if (el.outerHTML.substring(0, 200) === html) el.click();
                            });
                        }""", ni['html'])
                        time.sleep(0.5)
                        break
                    except:
                        pass

        # ============================================================
        # SCREENSHOTS 4-13: Section-by-section scroll
        # ============================================================
        # Reload for clean state
        page.goto(URL, wait_until="networkidle", timeout=30000)
        time.sleep(2)

        total_height = page.evaluate("document.body.scrollHeight")
        scroll_step = VIEWPORT_H - 100  # overlap
        current_scroll = scroll_step  # first section after hero
        section_num = 4

        while current_scroll < total_height:
            page.evaluate(f"window.scrollTo(0, {current_scroll})")
            time.sleep(0.5)

            # Annotate issues in viewport
            page.evaluate("""() => {
                const vw = window.innerWidth;
                // Red: small touch targets
                document.querySelectorAll('a, button, input, select, textarea, [role="button"]').forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden') return;
                    if (rect.width === 0 || rect.height === 0) return;
                    // Only annotate if visible in viewport
                    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
                    if (rect.width < 44 || rect.height < 44) {
                        el.style.outline = '3px solid red';
                        el.style.outlineOffset = '2px';
                    }
                });
                // Magenta: horizontal overflow
                document.querySelectorAll('*').forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    if (style.display === 'none') return;
                    if (rect.right > vw + 5 && rect.width > 10 && rect.height > 5) {
                        if (!['SCRIPT','STYLE','META','LINK','HEAD','HTML','BODY'].includes(el.tagName)) {
                            el.style.outline = '3px solid magenta';
                            el.style.outlineOffset = '-3px';
                        }
                    }
                });
            }""")

            fname = f"mobile-{section_num:02d}-scroll-{current_scroll}.png"
            page.screenshot(path=f"{SCREENSHOTS_DIR}/{fname}", full_page=False)
            print(f"    Section {section_num} at scroll={current_scroll} -> {fname}")

            # Clear
            page.evaluate("""() => {
                document.querySelectorAll('*').forEach(el => {
                    el.style.outline = '';
                    el.style.outlineOffset = '';
                });
            }""")

            current_scroll += scroll_step
            section_num += 1

            # Safety limit
            if section_num > 25:
                break

        # ============================================================
        # SCREENSHOT: Footer
        # ============================================================
        print("\n[5] Footer...")
        page.evaluate(f"window.scrollTo(0, {total_height - VIEWPORT_H})")
        time.sleep(0.5)

        # Annotate touch targets
        page.evaluate("""() => {
            document.querySelectorAll('a, button, input, select, textarea, [role="button"]').forEach(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return;
                if (rect.width === 0 || rect.height === 0) return;
                if (rect.bottom < 0 || rect.top > window.innerHeight) return;
                if (rect.width < 44 || rect.height < 44) {
                    el.style.outline = '3px solid red';
                    el.style.outlineOffset = '2px';
                }
            });
        }""")
        page.screenshot(path=f"{SCREENSHOTS_DIR}/mobile-footer.png", full_page=False)
        page.evaluate("""() => {
            document.querySelectorAll('*').forEach(el => {
                el.style.outline = '';
                el.style.outlineOffset = '';
            });
        }""")

        # ============================================================
        # CTA annotation screenshots
        # ============================================================
        print("[6] CTA annotations...")
        page.evaluate("window.scrollTo(0, 0)")
        time.sleep(0.3)

        cta_info = page.evaluate("""() => {
            const results = [];
            const ctas = document.querySelectorAll(
                'a[class*="btn"], a[class*="button"], a[class*="cta"], ' +
                'button[class*="btn"], button[class*="cta"], ' +
                'a[href*="contact"], a[href*="quote"], a[href*="start"], ' +
                'a[href*="get"], a[href*="book"], a[href*="call"], ' +
                '.btn, .button, [class*="Button"], [class*="wp-block-button"]'
            );
            ctas.forEach(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || rect.width === 0) return;
                el.style.outline = '4px solid lime';
                el.style.outlineOffset = '3px';
                results.push({
                    text: el.textContent.trim().substring(0, 50),
                    x: Math.round(rect.x),
                    y: Math.round(rect.y + window.scrollY),
                    w: Math.round(rect.width),
                    h: Math.round(rect.height),
                    aboveFold: (rect.y + window.scrollY) < 852,
                    inThumbZone: rect.y > 400,
                });
            });
            return results;
        }""")
        print(f"    Found {len(cta_info)} CTA elements")
        for cta in cta_info:
            zone = "THUMB ZONE" if cta['inThumbZone'] else "TOP"
            vis = "ABOVE FOLD" if cta['aboveFold'] else "BELOW FOLD"
            print(f"      [{vis}] [{zone}] '{cta['text']}' at ({cta['x']},{cta['y']}) {cta['w']}x{cta['h']}px")

        page.screenshot(path=f"{SCREENSHOTS_DIR}/mobile-cta-hero.png", full_page=False)

        # Clear
        page.evaluate("""() => {
            document.querySelectorAll('*').forEach(el => {
                el.style.outline = '';
                el.style.outlineOffset = '';
            });
        }""")

        # ============================================================
        # Landscape mode
        # ============================================================
        print("[7] Landscape mode...")
        page2 = context.new_page()
        page2.set_viewport_size({"width": 852, "height": 393})
        page2.goto(URL, wait_until="networkidle", timeout=30000)
        time.sleep(2)
        page2.screenshot(path=f"{SCREENSHOTS_DIR}/mobile-landscape.png", full_page=False)
        page2.close()

        # ============================================================
        # Gather comprehensive metrics
        # ============================================================
        print("\n[8] Gathering page metrics...")

        metrics = page.evaluate("""() => {
            const hasHScroll = document.body.scrollWidth > window.innerWidth;

            const fontSizes = {};
            document.querySelectorAll('p, span, li, a, td, th, label, small, div, h1, h2, h3, h4, h5, h6').forEach(el => {
                const style = window.getComputedStyle(el);
                if (style.display === 'none') return;
                const text = el.textContent.trim();
                if (!text || text.length < 2) return;
                if (el.children.length > 0 && el.children[0].textContent.trim() === text) return;
                const fs = style.fontSize;
                if (!fontSizes[fs]) fontSizes[fs] = 0;
                fontSizes[fs]++;
            });

            const images = [];
            document.querySelectorAll('img').forEach(img => {
                const rect = img.getBoundingClientRect();
                images.push({
                    src: img.src.substring(img.src.lastIndexOf('/') + 1).substring(0, 60),
                    alt: img.alt?.substring(0, 40) || 'MISSING ALT',
                    naturalW: img.naturalWidth,
                    naturalH: img.naturalHeight,
                    displayW: Math.round(rect.width),
                    displayH: Math.round(rect.height),
                    loaded: img.complete && img.naturalHeight > 0,
                    loading: img.loading || 'eager',
                });
            });

            const viewport = document.querySelector('meta[name="viewport"]');

            const fixedElements = [];
            document.querySelectorAll('*').forEach(el => {
                const style = window.getComputedStyle(el);
                if (style.position === 'fixed' || style.position === 'sticky') {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        fixedElements.push({
                            tag: el.tagName,
                            class: el.className?.toString().substring(0, 40) || '',
                            h: Math.round(rect.height),
                            pos: style.position,
                        });
                    }
                }
            });

            const headings = [];
            document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
                const style = window.getComputedStyle(h);
                const rect = h.getBoundingClientRect();
                headings.push({
                    tag: h.tagName,
                    text: h.textContent.trim().substring(0, 80),
                    fontSize: style.fontSize,
                    y: Math.round(rect.y + window.scrollY),
                });
            });

            const links = [];
            document.querySelectorAll('a').forEach(a => {
                const rect = a.getBoundingClientRect();
                const style = window.getComputedStyle(a);
                if (style.display === 'none' || rect.width === 0) return;
                links.push({
                    text: a.textContent.trim().substring(0, 50),
                    href: a.href?.substring(0, 80) || '',
                    w: Math.round(rect.width),
                    h: Math.round(rect.height),
                    fontSize: style.fontSize,
                    tooSmall: rect.width < 44 || rect.height < 44,
                });
            });

            const forms = document.querySelectorAll('form');
            const inputs = [];
            document.querySelectorAll('input, textarea, select').forEach(inp => {
                const rect = inp.getBoundingClientRect();
                const style = window.getComputedStyle(inp);
                if (style.display === 'none') return;
                inputs.push({
                    type: inp.type || inp.tagName.toLowerCase(),
                    name: inp.name || inp.placeholder || '',
                    w: Math.round(rect.width),
                    h: Math.round(rect.height),
                    fontSize: style.fontSize,
                    tooSmall: rect.height < 44,
                });
            });

            // Check padding on container-level elements
            const paddingIssues = [];
            document.querySelectorAll('section, div, p, h1, h2, h3, ul, ol, article, main').forEach(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || rect.width === 0) return;
                if (rect.width > window.innerWidth - 10) {
                    const pl = parseFloat(style.paddingLeft);
                    const pr = parseFloat(style.paddingRight);
                    if (pl < 10 && pr < 10 && el.textContent.trim().length > 20) {
                        paddingIssues.push({
                            tag: el.tagName,
                            class: el.className?.toString().substring(0, 40) || '',
                            paddingLeft: Math.round(pl),
                            paddingRight: Math.round(pr),
                            w: Math.round(rect.width),
                        });
                    }
                }
            });

            return {
                pageWidth: document.body.scrollWidth,
                pageHeight: document.body.scrollHeight,
                viewportWidth: window.innerWidth,
                hasHScroll,
                viewportMeta: viewport ? viewport.getAttribute('content') : 'MISSING',
                fontSizes: Object.entries(fontSizes).sort((a,b) => parseFloat(a[0]) - parseFloat(b[0])).slice(0, 25),
                imageCount: images.length,
                images: images.slice(0, 30),
                fixedElements,
                headings,
                linkCount: links.length,
                smallLinks: links.filter(l => l.tooSmall).slice(0, 20),
                formCount: forms.length,
                inputs,
                paddingIssues: paddingIssues.slice(0, 15),
                title: document.title,
                h1: document.querySelector('h1')?.textContent?.trim()?.substring(0, 100) || 'NONE',
            };
        }""")

        print(f"\n{'='*60}")
        print(f"PAGE METRICS REPORT")
        print(f"{'='*60}")
        print(f"Title: {metrics['title']}")
        print(f"H1: {metrics['h1']}")
        print(f"Page dimensions: {metrics['pageWidth']}x{metrics['pageHeight']}")
        print(f"Viewport: {metrics['viewportWidth']}px")
        print(f"Has horizontal scroll: {metrics['hasHScroll']}")
        print(f"Viewport meta: {metrics['viewportMeta']}")
        print(f"Image count: {metrics['imageCount']}")
        print(f"Total links: {metrics['linkCount']}")
        print(f"Links with small touch targets: {len(metrics['smallLinks'])}")
        print(f"Forms: {metrics['formCount']}")
        print(f"Inputs: {len(metrics['inputs'])}")

        print(f"\nFont sizes used:")
        for fs, count in metrics['fontSizes']:
            flag = " << TOO SMALL FOR MOBILE" if float(fs.replace('px','')) < 14 else ""
            print(f"  {fs}: {count} elements{flag}")

        print(f"\nFixed/Sticky elements:")
        for fe in metrics['fixedElements']:
            print(f"  {fe['tag']}.{fe['class']} ({fe['pos']}, {fe['h']}px tall)")

        print(f"\nHeadings:")
        for h in metrics['headings']:
            print(f"  {h['tag']}: '{h['text']}' (font-size: {h['fontSize']}, y: {h['y']}px)")

        print(f"\nImages:")
        for img in metrics['images']:
            status = "OK" if img['loaded'] else "NOT LOADED"
            oversized = " [OVERSIZED for mobile]" if img['naturalW'] > 800 else ""
            print(f"  [{status}]{oversized} {img['displayW']}x{img['displayH']} (native {img['naturalW']}x{img['naturalH']}) alt='{img['alt']}' loading={img['loading']}")

        print(f"\nSmall touch target links ({len(metrics['smallLinks'])}):")
        for sl in metrics['smallLinks'][:15]:
            print(f"  '{sl['text'][:40]}' {sl['w']}x{sl['h']}px font={sl['fontSize']}")

        print(f"\nInputs:")
        for inp in metrics['inputs']:
            flag = " [TOO SMALL]" if inp['tooSmall'] else " [OK]"
            print(f"  {inp['type']} '{inp['name']}' {inp['w']}x{inp['h']}px font={inp['fontSize']}{flag}")

        if metrics['paddingIssues']:
            print(f"\nPadding issues ({len(metrics['paddingIssues'])}):")
            for pi in metrics['paddingIssues']:
                print(f"  {pi['tag']}.{pi['class']} w={pi['w']}px pL={pi['paddingLeft']}px pR={pi['paddingRight']}px")

        # ============================================================
        # Form screenshot if forms exist
        # ============================================================
        if metrics['formCount'] > 0:
            print("\n[9] Form screenshot...")
            form_el = page.query_selector('form')
            if form_el:
                form_el.scroll_into_view_if_needed()
                time.sleep(0.5)
                page.evaluate("""() => {
                    document.querySelectorAll('input, textarea, select').forEach(el => {
                        const rect = el.getBoundingClientRect();
                        if (rect.height < 44) {
                            el.style.outline = '3px solid red';
                            el.style.outlineOffset = '2px';
                        } else {
                            el.style.outline = '2px solid green';
                            el.style.outlineOffset = '1px';
                        }
                    });
                }""")
                page.screenshot(path=f"{SCREENSHOTS_DIR}/mobile-form-annotated.png", full_page=False)
                page.evaluate("""() => {
                    document.querySelectorAll('*').forEach(el => {
                        el.style.outline = '';
                        el.style.outlineOffset = '';
                    });
                }""")

        browser.close()
        print(f"\n{'='*60}")
        print("ALL SCREENSHOTS SAVED SUCCESSFULLY")
        print(f"Directory: {SCREENSHOTS_DIR}")
        print(f"{'='*60}")


if __name__ == "__main__":
    take_screenshots()
