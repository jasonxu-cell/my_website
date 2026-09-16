#!/usr/bin/env python3
"""Keep the shared navigation, footer, and document metadata in sync."""

from __future__ import annotations

import html
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent

DESCRIPTIONS = {
    "index.html": (
        "Yang Xu is a geophysics undergraduate at USTC interested in seismology, "
        "earthquake mechanics, planetary science, and data-driven geophysics."
    ),
    "notes.html": (
        "Study notes by Yang Xu on mathematics, physics, computer science, geoscience, "
        "and electronic engineering."
    ),
    "notes/math.html": (
        "Mathematics notes by Yang Xu on analysis, algebra, geometry, numerical methods, "
        "probability, topology, and differential equations."
    ),
    "notes/physics.html": (
        "Physics notes by Yang Xu on mechanics, electromagnetism, optics, thermodynamics, "
        "statistical physics, and quantum physics."
    ),
    "notes/cs.html": (
        "Computer science notes by Yang Xu on algorithms, artificial intelligence, computer "
        "systems, networks, operating systems, and parallel computing."
    ),
    "notes/geoscience.html": (
        "Geoscience notes by Yang Xu on seismology, geology, astronomy, gravity, geomagnetism, "
        "and geoelectricity."
    ),
    "notes/electronic_engineering.html": (
        "Electronic engineering notes by Yang Xu on signals and systems, circuits, "
        "semiconductors, and electronic technology."
    ),
    "articles.html": (
        "Essays by Yang Xu on space technology, mathematics, computing, and the history "
        "of science and technology."
    ),
    "research.html": (
        "Research projects by Yang Xu in seismology, earthquake mechanics, planetary "
        "science, and data-driven geophysics."
    ),
    "publications.html": "Research outputs and academic work by Yang Xu.",
    "articles/article_1.html": (
        "评估中国航天技术的发展现状、与世界领先水平的差距，以及面对国际技术限制时的应对策略。"
    ),
    "articles/article_2.html": (
        "解析并评论2026年新高考一卷、二卷数学压轴题的思路、方法与命题特点。"
    ),
    "articles/article_3.html": (
        "A concise history of programming languages, their major lineages, milestones, "
        "and programming paradigms."
    ),
    "research/gofar-transform-fault.html": (
        "Yang Xu's research on earthquake mechanics and focal-mechanism variation at "
        "the Gofar transform fault."
    ),
    "research/lunar-water-content.html": (
        "Yang Xu's interdisciplinary study of lunar water using spectral, neutron, and "
        "thermal remote-sensing observations."
    ),
    "notes/cs/computer_organization_and_design.html": (
        "计算机组成与设计课程笔记，涵盖指令系统、处理器、存储层次结构与计算机体系结构。"
    ),
    "notes/electronic_engineering/electronic_technology.html": (
        "电子技术课程笔记，整理电路、半导体器件、模拟电子技术与数字电子技术基础。"
    ),
    "notes/cs/Parallel_Computing.html": "Planned study notes on parallel computing by Yang Xu.",
    "notes/cs/operating_system.html": "Planned study notes on operating systems by Yang Xu.",
    "notes/math/functional-analysis.html": "Planned study notes on functional analysis by Yang Xu.",
    "notes/math/geometry.html": "Planned study notes on geometry by Yang Xu.",
    "notes/math/topology.html": "Planned study notes on topology by Yang Xu.",
}

ZH_CN_PAGES = {
    "articles/article_1.html",
    "articles/article_2.html",
    "notes/cs/computer_organization_and_design.html",
    "notes/electronic_engineering/electronic_technology.html",
}

NOINDEX_PAGES = {
    "publications.html",
    "notes/cs/Parallel_Computing.html",
    "notes/cs/operating_system.html",
    "notes/math/functional-analysis.html",
    "notes/math/geometry.html",
    "notes/math/topology.html",
}


def extract(pattern: str, source: str, default: str = "") -> str:
    match = re.search(pattern, source, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return default
    return html.unescape(re.sub(r"\s+", " ", match.group(1))).strip()


def page_description(relative: str, title: str) -> str:
    if relative in DESCRIPTIONS:
        return DESCRIPTIONS[relative]

    subject = title.split(" | ", 1)[0].strip()
    if relative.startswith("notes/") and relative.count("/") == 1:
        return f"Course notes and topic guides by Yang Xu in {subject.lower()}."
    if relative.startswith("notes/"):
        return f"Study notes by Yang Xu on {subject}, with explanations, derivations, and examples."
    return f"{subject} by Yang Xu."


def replace_navigation(source: str, relative: str) -> str:
    prefix = "../" * (len(Path(relative).parts) - 1)
    section = (
        "Home" if relative == "index.html" else
        "Notes" if relative.startswith("notes") else
        "Articles" if relative.startswith("articles") else
        "Research" if relative.startswith("research") else ""
    )

    nav_match = re.search(r"<nav\b[^>]*>[\s\S]*?</nav>", source, flags=re.IGNORECASE)
    if not nav_match:
        return source

    nav = nav_match.group(0)
    nav = re.sub(
        r"<nav(?![^>]*aria-label)([^>]*)>",
        r'<nav\1 aria-label="Primary navigation">',
        nav,
        count=1,
        flags=re.IGNORECASE,
    )
    nav = re.sub(r'\s+aria-current="page"', "", nav)
    if section:
        nav = re.sub(
            rf'(<a\s+href="[^"]*"[^>]*)(>{re.escape(section)}</a>)',
            r'\1 aria-current="page"\2',
            nav,
            count=1,
            flags=re.IGNORECASE,
        )
    return source[: nav_match.start()] + nav + source[nav_match.end() :]


def update_head(source: str, relative: str) -> str:
    title = extract(r"<title>([\s\S]*?)</title>", source, "Yang Xu").strip()
    if relative != "index.html":
        if title.endswith(" | Research"):
            title = f"{title} | Yang Xu"
        elif re.search(r"\s+\|\s+Yang\s*$", title):
            title = re.sub(r"\s+\|\s+Yang\s*$", " | Yang Xu", title)
        elif not title.endswith(" | Yang Xu"):
            title = f"{title} | Yang Xu"
    source = re.sub(
        r"<title>[\s\S]*?</title>",
        f"<title>{html.escape(title)}</title>",
        source,
        count=1,
        flags=re.IGNORECASE,
    )
    description = DESCRIPTIONS.get(relative) or extract(
        r'<meta\s+name="description"\s+content="([^"]*)"\s*/?>', source
    )
    description = description or page_description(relative, title)
    page_type = (
        "article" if relative.startswith(("articles/", "notes/", "research/")) else
        "website"
    )
    locale = "zh_CN" if relative in ZH_CN_PAGES else "en_US"

    source = re.sub(
        r'<html\s+lang="[^"]+">',
        f'<html lang="{"zh-CN" if relative in ZH_CN_PAGES else "en"}">',
        source,
        count=1,
        flags=re.IGNORECASE,
    )

    for pattern in (
        r'\s*<meta\s+name="description"[^>]*>',
        r'\s*<meta\s+name="robots"[^>]*>',
        r'\s*<meta\s+property="og:(?:title|description|type|site_name|locale)"[^>]*>',
        r'\s*<meta\s+name="twitter:(?:card|title|description)"[^>]*>',
    ):
        source = re.sub(pattern, "", source, flags=re.IGNORECASE)

    escaped_title = html.escape(title, quote=True)
    escaped_description = html.escape(description, quote=True)
    robots = '\n    <meta name="robots" content="noindex,follow">' if relative in NOINDEX_PAGES else ""
    metadata = (
        f'\n    <meta name="description" content="{escaped_description}">'
        f'{robots}'
        f'\n    <meta property="og:title" content="{escaped_title}">'
        f'\n    <meta property="og:description" content="{escaped_description}">'
        f'\n    <meta property="og:type" content="{page_type}">'
        f'\n    <meta property="og:site_name" content="Yang Xu">'
        f'\n    <meta property="og:locale" content="{locale}">'
        f'\n    <meta name="twitter:card" content="summary">'
        f'\n    <meta name="twitter:title" content="{escaped_title}">'
        f'\n    <meta name="twitter:description" content="{escaped_description}">'
    )
    source = re.sub(
        r'(<meta\s+name="viewport"[^>]*>)',
        r"\1" + metadata,
        source,
        count=1,
        flags=re.IGNORECASE,
    )
    return source


def update_images(source: str, relative: str) -> str:
    def add_loading(match: re.Match[str]) -> str:
        tag = match.group(0)
        if re.search(r"\bloading=", tag, flags=re.IGNORECASE):
            return tag
        if relative == "index.html" and "profile-photo" in tag:
            return tag
        closing = " />" if tag.endswith(" />") else ">"
        body = tag[: -len(closing)].rstrip()
        return f'{body} loading="lazy" decoding="async"{closing}'

    source = re.sub(r"<img\b[^>]*>", add_loading, source, flags=re.IGNORECASE)
    source = re.sub(
        r'(<a\b[^>]*target="_blank"(?![^>]*\brel=)[^>]*)(>)',
        r'\1 rel="noopener noreferrer"\2',
        source,
        flags=re.IGNORECASE,
    )
    return source


def update_shell(source: str, relative: str) -> str:
    prefix = "../" * (len(Path(relative).parts) - 1)
    source = re.sub(
        r"<main(?![^>]*\bid=)([^>]*)>",
        r'<main id="main-content"\1>',
        source,
        count=1,
        flags=re.IGNORECASE,
    )
    if "class=\"skip-link\"" not in source:
        source = re.sub(
            r"(<body[^>]*>)",
            r'\1\n    <a class="skip-link" href="#main-content">Skip to main content</a>',
            source,
            count=1,
            flags=re.IGNORECASE,
        )

    if "class=\"site-footer\"" not in source:
        footer = f'''\n\n    <footer class="site-footer">
        <p>© 2026 Yang Xu</p>
        <nav class="footer-links" aria-label="Footer navigation">
            <a href="mailto:xu_ustc@mail.ustc.edu.cn">Email</a>
            <a href="https://github.com/jasonxu-cell" target="_blank" rel="noopener noreferrer">GitHub</a>
        </nav>
    </footer>'''
        source = source.replace("</main>", "</main>" + footer, 1)
    return source


def update_file(path: Path) -> bool:
    relative = path.relative_to(ROOT).as_posix()
    source = path.read_text(encoding="utf-8")
    updated = update_head(source, relative)
    updated = replace_navigation(updated, relative)
    updated = update_shell(updated, relative)
    updated = update_images(updated, relative)
    if updated == source:
        return False
    path.write_text(updated, encoding="utf-8")
    return True


def main() -> None:
    changed = [path for path in sorted(ROOT.rglob("*.html")) if update_file(path)]
    print(f"Updated {len(changed)} HTML files")


if __name__ == "__main__":
    main()
