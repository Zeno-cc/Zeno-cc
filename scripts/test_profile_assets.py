"""Offline checks: never call GitHub or invent contribution statistics."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location("assets", Path(__file__).with_name("prepare-profile-assets.py"))
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)

SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="60"><rect width="640" height="60" class="fill-bg"/><g transform="translate(2 3)"><animateTransform attributeName="transform" type="translate" values="0 0;2 3" dur="3s"/><text>commit</text></g></svg>'


class VisualTests(unittest.TestCase):
    def test_valid_image_gets_accessible_title(self):
        root = ET.fromstring(assets.render_variant(SVG, assets.TITLES["grass"], rounded=True))
        self.assertEqual(root.get("role"), "img")
        self.assertEqual(root.get("viewBox"), "0 0 640 60")
        self.assertEqual(root.find(f"{{{assets.NS}}}rect").get("rx"), "24")
        self.assertIn(assets.TITLES["grass"], "".join(root.itertext()))

    def test_static_keeps_final_geometry_but_removes_smil(self):
        raw = assets.render_variant(SVG, "test", static=True)
        self.assertNotIn("<animate", raw)
        self.assertIn('transform="translate(2 3)"', raw)
        self.assertIn("animation: none !important", raw)

    def test_rejects_error_html_and_unsafe_svg(self):
        for raw in ("<html>unavailable</html>", SVG.replace("<g ", '<script/> <g '), SVG.replace('<g ', '<g onclick="alert(1)" '), '<!DOCTYPE svg>' + SVG, SVG.replace('<g ', '<image href="https://invalid.example/x"/><g ')):
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError):
                    assets.parse_svg(raw)

    def test_one_failed_family_does_not_discard_good_families(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".raw").mkdir()
            for theme in assets.THEMES:
                (root / ".raw" / f"snake-{theme}.svg").write_text(SVG)
            report = assets.prepare(root, {"snake": "success"})
            self.assertTrue(report["components"]["snake"]["updated"])
            self.assertFalse(report["components"]["grass"]["updated"])
            self.assertEqual(len(list((root / ".generated/profile").glob("*.svg"))), 4)

    def test_incomplete_family_is_not_published(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".raw").mkdir()
            (root / ".raw/snake-dark.svg").write_text(SVG)
            with self.assertRaises(RuntimeError):
                assets.prepare(root, {"snake": "success"})
            self.assertEqual(list((root / ".generated/profile").glob("*.svg")), [])

    def test_typing_static_is_chinese_in_both_themes(self):
        for theme in assets.THEMES:
            raw = assets.typing_static(theme)
            self.assertIn(assets.TITLES["typing"], raw)
            self.assertIn(assets.THEMES[theme], raw)
            assets.parse_svg(raw)


if __name__ == "__main__":
    unittest.main()
