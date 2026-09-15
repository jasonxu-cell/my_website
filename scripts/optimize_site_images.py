#!/usr/bin/env python3
"""Create smaller WebP variants for large referenced images and update their URLs."""

from __future__ import annotations

import re
import subprocess
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
MIN_BYTES = 100 * 1024
MAX_DIMENSION = 2400
SPECIAL_MAX_DIMENSIONS = {
    "assets/background.jpg": 2560,
    "assets/math.jpg": 1600,
    "notes/attachments/Pasted image 20260615151911.png": 1600,
}
RASTER_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def referenced_urls(source: str) -> list[str]:
    values = re.findall(r'<img\b[^>]*\bsrc=["\']([^"\']+)', source, flags=re.IGNORECASE)
    values += re.findall(r'!\[[^\]]*\]\(([^)\s]+)(?:\s+[^)]*)?\)', source)
    values += re.findall(r'\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}', source)
    values += re.findall(r'url\(["\']?([^"\')]+)', source, flags=re.IGNORECASE)
    return values


def new_url(raw_url: str) -> str:
    stem, _separator, _suffix = raw_url.rpartition(".")
    return f"{stem}-optimized.webp"


def image_details(path: Path) -> tuple[int, int, bool, str | None]:
    with Image.open(path) as image:
        has_alpha = image.mode in {"RGBA", "LA"} or "transparency" in image.info
        return image.width, image.height, has_alpha, image.format


def compress(source: Path, output: Path) -> bool:
    width, height, has_alpha, image_format = image_details(source)
    # Some synced attachments have misleading extensions. cwebp cannot read GIF
    # input, and the existing single-frame GIF is already smaller than a WebP
    # conversion, so keep it untouched instead of emitting a noisy error.
    if image_format == "GIF":
        return False
    quality = "88" if source.suffix.lower() == ".png" else "82"
    relative = source.relative_to(ROOT).as_posix()
    max_dimension = SPECIAL_MAX_DIMENSIONS.get(relative, MAX_DIMENSION)
    command = [
        "cwebp", "-quiet", "-q", quality, "-m", "6", "-mt",
        "-metadata", "icc", "-sharp_yuv",
    ]
    if has_alpha:
        command += ["-alpha_q", "100", "-exact"]
    if max(width, height) > max_dimension:
        if width >= height:
            command += ["-resize", str(max_dimension), "0"]
        else:
            command += ["-resize", "0", str(max_dimension)]
    command += [str(source), "-o", str(output)]

    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    subprocess.run(command, check=True)
    if output.stat().st_size >= source.stat().st_size * 0.93:
        output.unlink()
        return False
    return True


def main() -> None:
    owners = sorted([*ROOT.rglob("*.html"), *ROOT.rglob("*.css")])
    references: dict[Path, list[tuple[Path, str]]] = defaultdict(list)

    for owner in owners:
        source = owner.read_text(encoding="utf-8")
        for raw_url in referenced_urls(source):
            if raw_url.startswith(("http:", "https:", "data:", "#")):
                continue
            path = (owner.parent / unquote(raw_url)).resolve()
            if (
                path.exists()
                and path.suffix.lower() in RASTER_SUFFIXES
                and not path.name.endswith("-optimized.webp")
                and path.stat().st_size >= MIN_BYTES
            ):
                references[path].append((owner, raw_url))

    replacements: dict[Path, dict[str, str]] = defaultdict(dict)
    original_bytes = 0
    optimized_bytes = 0
    optimized_count = 0

    for source in sorted(references, key=lambda path: path.as_posix().lower()):
        output = source.with_name(f"{source.stem}-optimized.webp")
        try:
            if compress(source, output):
                if output.stat().st_size < source.stat().st_size * 0.93:
                    original_bytes += source.stat().st_size
                    optimized_bytes += output.stat().st_size
                    optimized_count += 1
                    for owner, raw_url in references[source]:
                        replacements[owner][raw_url] = new_url(raw_url)
        except (OSError, subprocess.CalledProcessError) as error:
            print(f"Skipped {source.relative_to(ROOT)}: {error}")

    for owner, mapping in replacements.items():
        source = owner.read_text(encoding="utf-8")
        for old, new in sorted(mapping.items(), key=lambda item: len(item[0]), reverse=True):
            source = source.replace(old, new)
        owner.write_text(source, encoding="utf-8")

    saved_bytes = original_bytes - optimized_bytes
    print(
        f"Optimized {optimized_count} images; referenced payload "
        f"{original_bytes / 1024 / 1024:.1f} MB -> {optimized_bytes / 1024 / 1024:.1f} MB "
        f"({saved_bytes / max(original_bytes, 1):.0%} smaller)"
    )


if __name__ == "__main__":
    main()
