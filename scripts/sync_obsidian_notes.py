#!/usr/bin/env python3
'''Sync selected Obsidian notes into the static my_website notes pages.

Default behavior runs one sync pass. Use --watch to keep the process alive and
resync when mapped Markdown notes or Obsidian Picture attachments change.
'''

from __future__ import annotations

import argparse
import dataclasses
import html
import os
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple
from urllib.parse import quote


@dataclasses.dataclass(frozen=True)
class NoteTarget:
    subject: str
    subject_title: str
    title: str
    filename: str
    vault_folder: Optional[str]
    vault_name: str
    aliases: Tuple[str, ...] = ()


NOTE_TARGETS: Tuple[NoteTarget, ...] = (
    NoteTarget("math", "Mathematics", "Mathematical Analysis", "mathematical-analysis.html", "Mathematics", "Mathematical Analysis.md", ("Real Analysis",)),
    NoteTarget("math", "Mathematics", "Complex Analysis", "complex-analysis.html", "Mathematics", "Complex Analysis.md"),
    NoteTarget("math", "Mathematics", "Equations of Mathematical Physics", "equations-of-mathematical-physics.html", "Mathematics", "Equations of Mathematical Physics.md"),
    NoteTarget("math", "Mathematics", "Algebra", "algebra.html", "Mathematics", "Algebra & Number Theory.md", ("Algebra & Number Theory",)),
    NoteTarget("math", "Mathematics", "Functional Analysis", "functional-analysis.html", "Mathematics", "Functional Analysis.md"),
    NoteTarget("math", "Mathematics", "Geometry", "geometry.html", "Mathematics", "Geometry.md"),
    NoteTarget("math", "Mathematics", "Mathematical Logic and Set Theory", "mathematical-logic-and-set-theory.html", "Mathematics", "Mathematical Logic & Set Theory.md", ("Mathematical Logic & Set Theory",)),
    NoteTarget("math", "Mathematics", "Probability and Statistics", "probability-and-statistics.html", "Mathematics", "Probability & Statistics.md", ("Probability & Statistics",)),
    NoteTarget("math", "Mathematics", "Topology", "topology.html", "Mathematics", "Topology.md"),
    NoteTarget("math", "Mathematics", "Computational Method", "computational_method.html", "Mathematics", "Computational Method.md"),
    NoteTarget("math", "Mathematics", "Numerical Solution for Differential Equations", "numerical_solution_for_differential_equations.html", "Mathematics", "Numerical solution for Differential Equations.md"),
    NoteTarget("physics", "Physics", "Mechanism", "mechanism.html", "Physics", "Mechanics.md", ("Mechanics",)),
    NoteTarget("physics", "Physics", "Electromagnetism", "electromagnetism.html", "Physics", "Electromagnetism.md"),
    NoteTarget("physics", "Physics", "Thermodynamics and Statistical Physics", "thermodynamics-and-statistical-physics.html", "Physics", "Thermodynamics and Statistical Physics.md"),
    NoteTarget("physics", "Physics", "Optics", "optics.html", "Physics", "Optics.md"),
    NoteTarget("physics", "Physics", "Quantum Physics", "quantum-physics.html", "Physics", "Quantum Mechanics.md", ("Quantum Mechanics",)),
    NoteTarget("electronic_engineering", "Electronic Technology", "Signals and Systems", "signals_and_systems.html", "Electronic Engineering", "Signals & Systems.md", ("Signal & System", "Signals & Systems")),
    NoteTarget("electronic_engineering", "Electronic Technology", "Digital Signal Processing", "digital_signal_processing.html", "Electronic Engineering", "Digital Signal Processing.md", ("DSP",)),
    NoteTarget("electronic_engineering", "Electronic Technology", "Electronic Technology", "electronic_technology.html", "Electronic Engineering", "Electronic Technology.md"),
    NoteTarget("cs", "Computer Science", "Data Structure and Algorithm", "data_structure_and_algorithm.html", "Computer Science", "Data Structure & Algorithm.md", ("Data Structure & Algorithm",)),
    NoteTarget("cs", "Computer Science", "Computer Organization and Design", "computer_organization_and_design.html", "Computer Science", "Computer Organization & Design.md", ("Computer Organization & Design",)),
    NoteTarget("cs", "Computer Science", "Operating System", "operating_system.html", "Computer Science", "Operating System.md"),
    NoteTarget("cs", "Computer Science", "Computer Network", "computer_network.html", "Computer Science", "Computer Network.md"),
    NoteTarget("cs", "Computer Science", "Artificial Intelligence", "artificial_intelligence.html", "Computer Science", "Artificial Intelligence.md"),
    NoteTarget("cs", "Computer Science", "Parallel Computing", "Parallel_Computing.html", "Computer Science", "Parallel Computing.md"),
    NoteTarget("geoscience", "Geoscience", "Astronomy", "astronomy.html", "Geophysics", "Astronomy.md"),
    NoteTarget("geoscience", "Geoscience", "Geology", "geology.html", "Geophysics", "Geology.md"),
    NoteTarget("geoscience", "Geoscience", "Geomagnetism and Geoelectricity", "geomagnetism_and_geoelectricity.html", "Geophysics", "Geomagnetism & Geoelectricity.md", ("Geomagnetism & Geoelectricity",)),
    NoteTarget("geoscience", "Geoscience", "Seismology", "seismology.html", "Geophysics", "Seismology.md"),
    NoteTarget("geoscience", "Geoscience", "The Gravity and The Tide of Earth", "The_Gravity_and_The_Tide_of_Earth.html", "Geophysics", "The Gravity & the Tide of Earth.md", ("The Gravity & the Tide of Earth",)),
)

SUBJECT_LABELS = {
    "math": "Mathematics",
    "physics": "Physics",
    "electronic_engineering": "Electronic Technology",
    "cs": "Computer Science",
    "geoscience": "Geoscience",
}

SUBJECT_PAGES = {
    "math": Path("notes/math.html"),
    "physics": Path("notes/physics.html"),
    "electronic_engineering": Path("notes/electronic_engineering.html"),
    "cs": Path("notes/cs.html"),
    "geoscience": Path("notes/geoscience.html"),
}

DEFAULT_VAULT = Path(os.environ.get("OBSIDIAN_VAULT", "/Users/xuyang/Documents/Obsidian Vault"))
DEFAULT_ROOT = Path(__file__).resolve().parents[1]


class SyncError(RuntimeError):
    pass


def normalize_key(value: str) -> str:
    cleaned = value.replace("\u200c", "").replace("\u200b", "").replace("\ufeff", "")
    cleaned = cleaned.replace("&", " and ")
    return re.sub(r"[^0-9a-zA-Z\u4e00-\u9fa5]+", "", cleaned).casefold()


def slugify(value: str) -> str:
    value = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", value)
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"[`*_>#-]", "", value).strip().lower()
    value = re.sub(r"[^a-z0-9\u4e00-\u9fa5]+", "-", value).strip("-")
    return value or "section"


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, value: str, dry_run: bool) -> bool:
    if path.exists() and read_text(path) == value:
        return False
    if not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value, encoding="utf-8")
    return True


def find_vault_file(vault: Path, target: NoteTarget) -> Optional[Path]:
    direct = (vault / target.vault_folder / target.vault_name) if target.vault_folder else (vault / target.vault_name)
    if direct.exists():
        return direct

    search_root = (vault / target.vault_folder) if target.vault_folder else vault
    aliases = {normalize_key(target.title), normalize_key(Path(target.vault_name).stem)}
    aliases.update(normalize_key(alias) for alias in target.aliases)

    if not search_root.exists():
        return None

    for candidate in search_root.rglob("*.md"):
        if normalize_key(candidate.stem) in aliases:
            return candidate
    return None


def extract_cards(subject_page: Path) -> Dict[str, Dict[str, object]]:
    text = read_text(subject_page)
    cards: Dict[str, Dict[str, object]] = {}
    card_pattern = re.compile(r'<a href="([^"]+)"\s+class="article-card">([\s\S]*?)</a>')

    for match in card_pattern.finditer(text):
        _href, block = match.groups()
        title_match = re.search(r"<h2>([\s\S]*?)</h2>", block)
        if not title_match:
            continue
        title = html.unescape(re.sub(r"\s+", " ", title_match.group(1)).strip())
        tags = [
            html.unescape(re.sub(r"\s+", " ", tag).strip())
            for tag in re.findall(r"<span>([\s\S]*?)</span>", block)
        ]
        time_match = re.search(r"<time(?: [^>]*)?>([\s\S]*?)</time>", block)
        time_text = html.unescape(re.sub(r"\s+", " ", time_match.group(1)).strip()) if time_match else "Aug 14, 2026"
        cards[title] = {"tags": tags, "time": time_text}
    return cards


def extract_all_cards(root: Path) -> Dict[str, Dict[str, Dict[str, object]]]:
    result: Dict[str, Dict[str, Dict[str, object]]] = {}
    for subject, rel_path in SUBJECT_PAGES.items():
        page = root / rel_path
        result[subject] = extract_cards(page) if page.exists() else {}
    return result


def extract_detail_intro(page: Path) -> Optional[str]:
    if not page.exists():
        return None

    text = read_text(page)
    header_match = re.search(r'<header class="article-detail-header">([\s\S]*?)</header>', text)
    if not header_match:
        return None

    intro_match = re.search(r"<p(?:\s[^>]*)?>[\s\S]*?</p>", header_match.group(1))
    if not intro_match:
        return None

    return intro_match.group(0)


def strip_frontmatter(text: str) -> str:
    return re.sub(r"\A\s*---\s*\n[\s\S]*?\n---\s*\n?", "", text, count=1).strip()


def build_picture_index(picture_dir: Path) -> Dict[str, Path]:
    if not picture_dir.exists():
        return {}
    return {path.name: path for path in picture_dir.rglob("*") if path.is_file()}


def build_link_map(targets: Sequence[NoteTarget], vault_paths: Dict[NoteTarget, Path]) -> Dict[str, NoteTarget]:
    link_map: Dict[str, NoteTarget] = {}
    for target in targets:
        names = {target.title, Path(target.vault_name).stem, *target.aliases}
        vault_path = vault_paths.get(target)
        if vault_path:
            names.add(vault_path.stem)
        for name in names:
            link_map[normalize_key(name)] = target
    return link_map


def relative_note_link(current: NoteTarget, target: NoteTarget, anchor: Optional[str]) -> str:
    if current == target:
        base = ""
    elif current.subject == target.subject:
        base = target.filename
    else:
        base = f"../{target.subject}/{target.filename}"

    if anchor:
        suffix = f"#{slugify(anchor)}"
        return f"{base}{suffix}" if base else suffix
    return base or f"#{slugify(target.title)}"


def convert_wikilinks(text: str, current: NoteTarget, link_map: Dict[str, NoteTarget]) -> str:
    def replace(match: re.Match[str]) -> str:
        body = match.group(1).strip()
        if not body:
            return ""

        if "|" in body:
            target_part, alias = body.split("|", 1)
            alias = alias.strip()
        else:
            target_part, alias = body, None

        if "#" in target_part:
            page_part, anchor = target_part.split("#", 1)
            page_part = page_part.strip()
            anchor = anchor.strip()
        else:
            page_part, anchor = target_part.strip(), None

        label = (alias or anchor or page_part).strip()
        if not label:
            label = page_part or anchor or ""

        if not page_part:
            return f"[{label}](#{slugify(anchor or label)})"

        target = link_map.get(normalize_key(page_part))
        if not target:
            return label

        return f"[{label}]({relative_note_link(current, target, anchor)})"

    return re.sub(r"(?<!!)\[\[([^\]]+)\]\]", replace, text)


def convert_obsidian_images(
    text: str,
    picture_index: Dict[str, Path],
    used_images: Set[Path],
    missing_images: Set[str],
) -> str:
    def replace(match: re.Match[str]) -> str:
        body = match.group(1).strip()
        parts = [part.strip() for part in body.split("|")]
        image_name = parts[0]
        width = next((part for part in parts[1:] if re.fullmatch(r"\d+", part)), None)
        basename = Path(image_name).name
        source = picture_index.get(basename)

        if source:
            used_images.add(source)
        else:
            missing_images.add(image_name)

        encoded = quote(basename)
        alt = Path(basename).stem
        width_suffix = f"{{width={width}}}" if width else ""
        return f"![{alt}](../attachments/{encoded}){width_suffix}"

    return re.sub(r"!\[\[([^\]]+)\]\]", replace, text)


def prepare_markdown(
    target: NoteTarget,
    vault_path: Path,
    picture_index: Dict[str, Path],
    link_map: Dict[str, NoteTarget],
    used_images: Set[Path],
    missing_images: Set[str],
) -> str:
    text = strip_frontmatter(read_text(vault_path))
    text = convert_obsidian_images(text, picture_index, used_images, missing_images)
    text = convert_wikilinks(text, target, link_map)
    return text.replace("\r\n", "\n").replace("\r", "\n")


def datetime_attr(time_text: str) -> str:
    try:
        return datetime.strptime(time_text, "%b %d, %Y").strftime("%Y-%m-%d")
    except ValueError:
        return ""


def html_page(
    target: NoteTarget,
    markdown: str,
    meta: Dict[str, object],
    detail_intro: Optional[str],
) -> str:
    intro_html = detail_intro
    legacy_intro = f"<p>{html.escape(f'Notes from the Obsidian vault on {target.title}.')}</p>"
    if intro_html is None or intro_html == legacy_intro:
        intro_html = f"<p>{html.escape(f'Note about {target.title}.')}</p>"
    tags = list(meta.get("tags") or [target.subject_title])
    time_text = str(meta.get("time") or "Aug 14, 2026")
    datetime_value = datetime_attr(time_text)
    tags_html = "\n".join(f"                    <span>{html.escape(str(tag))}</span>" for tag in tags)
    safe_markdown = markdown.replace("</script", "<\\/script")

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{html.escape(target.title)} | Yang</title>
    <link rel="stylesheet" href="../../style.css">
    <link rel="icon" type="image/png" href="../../assets/photo.jpg">
    <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css"
    >
</head>
<body>
    <nav>
        <div class="nav-links">
            <a href="../../index.html">Home</a>
            <a href="../../notes.html">Notes</a>
            <a href="../../articles.html">Articles</a>
            <a href="../../research.html">Research</a>
            <a href="../../publications.html">Publications</a>
        </div>
    </nav>

    <main class="article-detail-page">
        <header class="article-detail-header">
            <a href="../{target.subject}.html" class="article-back-link">&larr; {html.escape(SUBJECT_LABELS[target.subject])}</a>
            <h1>{html.escape(target.title)}</h1>
            {intro_html}
            <div class="essay-meta article-detail-meta">
                <div class="essay-tags">
{tags_html}
                </div>
                <time{f' datetime="{datetime_value}"' if datetime_value else ''}>{html.escape(time_text)}</time>
            </div>
        </header>

        <div class="article-reader">
            <aside class="article-toc-panel" aria-label="Article contents">
                <p>Contents</p>
                <ol id="article-toc"></ol>
            </aside>

            <article class="markdown-body" id="markdown-body" aria-live="polite"></article>
        </div>

        <section class="article-comments" aria-labelledby="comments-title">
            <div class="article-comments-header">
                <span>Discussion</span>
                <h2 id="comments-title">Comments</h2>
                <p>Questions, corrections, and reading notes are welcome here.</p>
            </div>
            <div class="article-comments-widget" data-comments-repo="jasonxu-cell/my_website"></div>
            <p class="article-comments-status" hidden>Comments load on the published website.</p>
            <noscript>Enable JavaScript to view comments.</noscript>
        </section>

        <script type="text/plain" id="article-markdown">
{safe_markdown}
        </script>
    </main>

    <script src="../../scripts/markdown-article.js"></script>
    <script src="../../scripts/comments.js"></script>
</body>
</html>
'''


def update_subject_links(root: Path, targets: Sequence[NoteTarget], dry_run: bool) -> int:
    changed = 0
    by_subject: Dict[str, List[NoteTarget]] = {}
    for target in targets:
        by_subject.setdefault(target.subject, []).append(target)

    for subject, subject_targets in by_subject.items():
        page = root / SUBJECT_PAGES[subject]
        if not page.exists():
            continue
        text = read_text(page)
        original = text
        for target in subject_targets:
            href = f"{target.subject}/{target.filename}"
            title_pattern = re.escape(target.title)
            pattern = re.compile(
                r'(<a href=")([^"]+)("\s+class="article-card">(?:(?!</a>).)*?<h2>\s*'
                + title_pattern
                + r"\s*</h2>)",
                re.S,
            )
            text, count = pattern.subn(r"\1" + href + r"\3", text, count=1)
            if count == 0:
                raise SyncError(f"Could not update href for {target.title} in {page}")
        if text != original:
            if not dry_run:
                page.write_text(text, encoding="utf-8")
            changed += 1
    return changed


def copy_images(images: Iterable[Path], attachments_dir: Path, dry_run: bool) -> int:
    changed = 0
    if not dry_run:
        attachments_dir.mkdir(parents=True, exist_ok=True)
    for source in sorted(images):
        dest = attachments_dir / source.name
        if dest.exists() and dest.stat().st_mtime_ns == source.stat().st_mtime_ns and dest.stat().st_size == source.stat().st_size:
            continue
        if not dry_run:
            shutil.copy2(source, dest)
        changed += 1
    return changed


def active_targets(root: Path, vault: Path) -> Tuple[List[NoteTarget], Dict[NoteTarget, Path], Dict[str, Dict[str, Dict[str, object]]], List[str]]:
    cards = extract_all_cards(root)
    targets: List[NoteTarget] = []
    vault_paths: Dict[NoteTarget, Path] = {}
    skipped: List[str] = []

    for target in NOTE_TARGETS:
        if target.title not in cards.get(target.subject, {}):
            skipped.append(f"{target.subject}/{target.title}: no website card")
            continue
        vault_path = find_vault_file(vault, target)
        if not vault_path:
            skipped.append(f"{target.subject}/{target.title}: no vault note")
            continue
        targets.append(target)
        vault_paths[target] = vault_path

    return targets, vault_paths, cards, skipped


def select_targets(
    targets: Sequence[NoteTarget],
    vault_paths: Dict[NoteTarget, Path],
    only: Optional[Sequence[str]],
) -> Tuple[List[NoteTarget], Dict[NoteTarget, Path]]:
    if not only:
        return list(targets), vault_paths

    requested = {normalize_key(value) for value in only}
    selected = [
        target
        for target in targets
        if normalize_key(target.title) in requested
        or normalize_key(f"{target.subject}/{target.title}") in requested
    ]
    if not selected:
        raise SyncError(f"No active notes matched --only: {', '.join(only)}")
    return selected, {target: vault_paths[target] for target in selected}


def sync_once(
    root: Path,
    vault: Path,
    dry_run: bool = False,
    quiet: bool = False,
    only: Optional[Sequence[str]] = None,
) -> Dict[str, object]:
    picture_dir = vault / "Picture"
    attachments_dir = root / "notes" / "attachments"
    targets, vault_paths, cards, skipped = active_targets(root, vault)
    targets, vault_paths = select_targets(targets, vault_paths, only)
    picture_index = build_picture_index(picture_dir)
    link_map = build_link_map(targets, vault_paths)
    used_images: Set[Path] = set()
    missing_images: Set[str] = set()
    written_pages = 0

    for target in targets:
        markdown = prepare_markdown(target, vault_paths[target], picture_index, link_map, used_images, missing_images)
        meta = cards[target.subject].get(target.title, {})
        out_path = root / "notes" / target.subject / target.filename
        detail_intro = extract_detail_intro(out_path)
        if write_text(out_path, html_page(target, markdown, meta, detail_intro), dry_run=dry_run):
            written_pages += 1

    changed_subject_pages = update_subject_links(root, targets, dry_run=dry_run)
    copied_images = copy_images(used_images, attachments_dir, dry_run=dry_run)

    result = {
        "targets": len(targets),
        "written_pages": written_pages,
        "changed_subject_pages": changed_subject_pages,
        "used_images": len(used_images),
        "copied_images": copied_images,
        "missing_images": sorted(missing_images),
        "skipped": skipped,
    }

    if not quiet:
        action = "Would sync" if dry_run else "Synced"
        print(f"{action} {result['targets']} notes.")
        print(f"pages changed: {result['written_pages']}")
        print(f"subject pages changed: {result['changed_subject_pages']}")
        print(f"images used/copied: {result['used_images']}/{result['copied_images']}")
        if missing_images:
            print("missing images:")
            for name in sorted(missing_images):
                print(f"  - {name}")
        if skipped:
            print("skipped:")
            for item in skipped:
                print(f"  - {item}")
    return result


def iter_watch_paths(root: Path, vault: Path) -> Iterable[Path]:
    _targets, vault_paths, _cards, _skipped = active_targets(root, vault)
    for path in vault_paths.values():
        if path.exists():
            yield path
    picture_dir = vault / "Picture"
    if picture_dir.exists():
        for path in picture_dir.rglob("*"):
            if path.is_file():
                yield path
    for rel_path in SUBJECT_PAGES.values():
        path = root / rel_path
        if path.exists():
            yield path


def snapshot(paths: Iterable[Path]) -> Tuple[Tuple[str, int, int], ...]:
    values: List[Tuple[str, int, int]] = []
    for path in paths:
        try:
            stat = path.stat()
        except FileNotFoundError:
            values.append((str(path), -1, -1))
            continue
        values.append((str(path), stat.st_mtime_ns, stat.st_size))
    return tuple(sorted(values))


def watch(root: Path, vault: Path, interval: float, dry_run: bool, only: Optional[Sequence[str]] = None) -> None:
    print(f"Watching Obsidian notes in {vault}")
    print(f"Website root: {root}")
    sync_once(root, vault, dry_run=dry_run, only=only)
    previous = snapshot(iter_watch_paths(root, vault))

    while True:
        time.sleep(interval)
        current = snapshot(iter_watch_paths(root, vault))
        if current == previous:
            continue
        time.sleep(min(max(interval, 1.0), 3.0))
        current = snapshot(iter_watch_paths(root, vault))
        previous = current
        print(time.strftime("\n[%Y-%m-%d %H:%M:%S] Change detected."))
        try:
            sync_once(root, vault, dry_run=dry_run, only=only)
        except Exception as exc:
            print(f"Sync failed: {exc}", file=sys.stderr)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync selected Obsidian vault notes into my_website.")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="Website root directory.")
    parser.add_argument("--vault", type=Path, default=DEFAULT_VAULT, help="Obsidian vault directory.")
    parser.add_argument("--watch", action="store_true", help="Keep running and resync when notes or attachments change.")
    parser.add_argument("--interval", type=float, default=5.0, help="Polling interval in seconds for --watch.")
    parser.add_argument("--dry-run", action="store_true", help="Print what would change without writing files.")
    parser.add_argument("--quiet", action="store_true", help="Reduce output for one-shot sync.")
    parser.add_argument(
        "--only",
        action="append",
        help="Sync only the note with this title (repeat for multiple notes).",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    root = args.root.resolve()
    vault = args.vault.resolve()

    if not root.exists():
        raise SyncError(f"Website root does not exist: {root}")
    if not vault.exists():
        raise SyncError(f"Obsidian vault does not exist: {vault}")

    if args.watch:
        watch(root, vault, interval=args.interval, dry_run=args.dry_run, only=args.only)
    else:
        sync_once(root, vault, dry_run=args.dry_run, quiet=args.quiet, only=args.only)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nStopped.")
        raise SystemExit(130)
    except Exception as error:
        print(f"sync_obsidian_notes.py: {error}", file=sys.stderr)
        raise SystemExit(1)
