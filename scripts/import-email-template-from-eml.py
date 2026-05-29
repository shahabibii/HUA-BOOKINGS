#!/usr/bin/env python3
"""Extract HTML + inline images from an Outlook .eml for ONYX email actions."""

from __future__ import annotations

import argparse
import email
import email.policy
import hashlib
import re
import sys
from pathlib import Path


def visible_text(html: str) -> str:
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def strip_signature(html: str, plain: str) -> tuple[str, str]:
    """Remove personal signature from Shahab Manafi downward when present in visible text."""
    markers = [
        r"Shahab\s*Manafi",
        r"Shahab&nbsp;Manafi",
    ]
    for marker in markers:
        m = re.search(marker, html, re.I)
        if m:
            html = html[: m.start()].rstrip()
            if not html.lower().endswith("</body></html>"):
                html = re.sub(r"</body>\s*</html>\s*$", "", html, flags=re.I)
                html += "</body></html>"
            break

    for marker in markers:
        m = re.search(marker, plain, re.I)
        if m:
            plain = plain[: m.start()].rstrip()
            break

    return html, plain


def rewrite_cid_sources(html: str, cid_map: dict[str, str]) -> str:
    def repl(match: re.Match[str]) -> str:
        cid = match.group(1)
        path = cid_map.get(cid)
        if not path:
            return match.group(0)
        return f'src="{path}"'

    html = re.sub(r'src="cid:([^"]+)"', repl, html, flags=re.I)
    html = re.sub(r"src='cid:([^']+)'", repl, html, flags=re.I)
    return html


def import_eml(eml_path: Path, out_dir: Path, slug: str) -> None:
    msg = email.message_from_bytes(eml_path.read_bytes(), policy=email.policy.default)
    html = None
    plain = None
    for part in msg.walk():
        if part.get_content_type() == "text/html" and html is None:
            html = part.get_content()
        elif part.get_content_type() == "text/plain" and plain is None:
            plain = part.get_content()

    if not html:
        raise SystemExit(f"No HTML part found in {eml_path}")

    html, plain = strip_signature(html, plain or "")

    images_dir = out_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    cid_map: dict[str, str] = {}
    hash_to_name: dict[str, str] = {}
    image_index = 0

    for part in msg.walk():
        if part.get_content_maintype() != "image":
            continue
        payload = part.get_payload(decode=True)
        if not payload:
            continue
        digest = hashlib.sha1(payload).hexdigest()[:12]
        if digest in hash_to_name:
            filename = hash_to_name[digest]
        else:
            image_index += 1
            ext = "png"
            ctype = part.get_content_type() or ""
            if "jpeg" in ctype or "jpg" in ctype:
                ext = "jpg"
            elif "gif" in ctype:
                ext = "gif"
            filename = f"img-{image_index:02d}.{ext}"
            hash_to_name[digest] = filename
            (images_dir / filename).write_bytes(payload)

        cid = (part.get("Content-ID") or "").strip().strip("<>")
        if cid:
            cid_map[cid] = f"images/{filename}"

    html = rewrite_cid_sources(html, cid_map)

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "body.html").write_text(html, encoding="utf-8")
    (out_dir / "body.plain.txt").write_text(plain, encoding="utf-8")

    meta = {
        "slug": slug,
        "source": eml_path.name,
        "imageCount": len(hash_to_name),
        "signatureStripped": "Shahab Manafi" not in visible_text(html),
    }
    (out_dir / "meta.json").write_text(
        __import__("json").dumps(meta, indent=2) + "\n", encoding="utf-8"
    )

    print(f"Imported {slug} -> {out_dir}")
    print(f"  HTML: {len(html)} chars, images: {len(hash_to_name)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("eml", type=Path)
    parser.add_argument("--slug", required=True)
    parser.add_argument(
        "--out-root",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "assets" / "email-templates",
    )
    args = parser.parse_args()
    import_eml(args.eml, args.out_root / args.slug, args.slug)


if __name__ == "__main__":
    main()
