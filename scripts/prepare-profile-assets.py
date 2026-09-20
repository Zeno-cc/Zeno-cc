"""Validate generated SVGs and build accessible profile variants; stdlib only."""
from __future__ import annotations

import json
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'
THEMES = {"dark": "#7de0d5", "light": "#087f8c"}
TITLES = {
    "snake": "\u8ba9\u6bcf\u4e00\u683c\u52aa\u529b\u52a8\u8d77\u6765",
    "grass": "\u4e00\u70b9\u70b9\u957f\u51fa\u6765\u7684\u4f5c\u54c1",
    "typing": "\u628a\u771f\u5b9e\u95ee\u9898\uff0c\u505a\u6210\u987a\u624b\u7684\u5de5\u5177\u3002",
}
ANIMATION = {"animate", "animateTransform", "animateMotion", "set"}


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_svg(raw: str) -> ET.Element:
    if len(raw.encode("utf-8")) > 2_000_000:
        raise ValueError("SVG exceeds the 2 MB profile budget")
    if re.search(r"<!DOCTYPE|<!ENTITY", raw, re.I):
        raise ValueError("External XML declarations are not accepted")
    root = ET.fromstring(raw)
    if root.tag != f"{{{NS}}}svg":
        raise ValueError("Expected an SVG document, not an error page")
    for element in root.iter():
        if local_name(element.tag) in {"script", "foreignObject"}:
            raise ValueError("Active document content is not accepted")
        if any(local_name(key).lower().startswith("on") for key in element.attrib):
            raise ValueError("Event handlers are not accepted")
        for key, value in element.attrib.items():
            if local_name(key) == "href" and not value.startswith("#"):
                raise ValueError("External SVG resources are not accepted")
    if not any(local_name(node.tag) in {"path", "rect", "text"} for node in root.iter()):
        raise ValueError("SVG has no visible drawing")
    if "viewBox" not in root.attrib:
        w = re.fullmatch(r"([0-9.]+)(?:px)?", root.get("width", ""))
        h = re.fullmatch(r"([0-9.]+)(?:px)?", root.get("height", ""))
        if not w or not h:
            raise ValueError("SVG needs a viewBox or numeric dimensions")
        root.set("viewBox", f"0 0 {w[1]} {h[1]}")
    return root


def render_variant(raw: str, title: str, *, static: bool = False, rounded: bool = False) -> str:
    root = parse_svg(raw)
    for child in list(root):
        if local_name(child.tag) in {"title", "desc"}:
            root.remove(child)
    root.set("role", "img")
    root.set("aria-labelledby", "profile-visual-title")
    root.set("preserveAspectRatio", "xMidYMid meet")
    heading = ET.Element(f"{{{NS}}}title", {"id": "profile-visual-title"})
    heading.text = title
    root.insert(0, heading)
    if rounded:
        for child in root:
            if local_name(child.tag) == "rect" and child.get("class") == "fill-bg":
                child.set("rx", "24")
                break
    if static:
        for parent in list(root.iter()):
            for child in list(parent):
                if local_name(child.tag) in ANIMATION:
                    parent.remove(child)
    style = ET.SubElement(root, f"{{{NS}}}style")
    style.text = f"text {{ font-family: {FONT}; }}"
    if static:
        style.text += "\n* { animation: none !important; transition: none !important; }"
    return ET.tostring(root, encoding="unicode") + "\n"


def typing_static(theme: str) -> str:
    return (
        f'<svg xmlns="{NS}" width="640" height="60" viewBox="0 0 640 60">'
        f'<text x="320" y="38" text-anchor="middle" font-size="24" '
        f'font-weight="500" fill="{THEMES[theme]}">{TITLES["typing"]}</text></svg>'
    )


def prepare(root_dir: Path, outcomes: dict[str, str]) -> dict:
    destination = root_dir / ".generated/profile"
    destination.mkdir(parents=True, exist_ok=True)
    status = {"updated_at": datetime.now(timezone.utc).isoformat(), "components": {}}
    for kind, prefix, source_dir in (
        ("snake", "snake", ".raw"),
        ("grass", "contributions-3d", "profile-3d-contrib"),
        ("typing", "typing", ".raw"),
    ):
        try:
            if outcomes.get(kind) != "success":
                raise ValueError("Generator failed; retain the previously published files")
            pending = {}
            for theme in THEMES:
                raw = (root_dir / source_dir / f"{prefix}-{theme}.svg").read_text(encoding="utf-8")
                if kind == "typing" and not all(word in "".join(parse_svg(raw).itertext()) for word in ("\u771f\u5b9e\u95ee\u9898", "\u6570\u636e", "AI")):
                    raise ValueError("Typing service did not return the requested Chinese copy")
                pending[f"{prefix}-{theme}.svg"] = render_variant(raw, TITLES[kind], rounded=kind == "grass")
                still = typing_static(theme) if kind == "typing" else raw
                pending[f"{prefix}-{theme}-static.svg"] = render_variant(still, TITLES[kind], static=True, rounded=kind == "grass")
            # Publish a component only when both themes and both motion modes are valid.
            for filename, content in pending.items():
                (destination / filename).write_text(content, encoding="utf-8")
            status["components"][kind] = {"updated": True, "files": sorted(pending)}
        except (OSError, ValueError, ET.ParseError) as exc:
            status["components"][kind] = {"updated": False, "reason": str(exc)}
            print(f"::warning::{kind}: {exc}")
    (destination / "update-status.json").write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if not any(item["updated"] for item in status["components"].values()):
        raise RuntimeError("No valid component was generated; publication stopped")
    return status


if __name__ == "__main__":
    prepare(Path.cwd(), {key: os.environ.get(f"{key.upper()}_OUTCOME", "failure") for key in TITLES})
