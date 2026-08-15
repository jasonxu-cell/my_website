(() => {
    const sourceElement = document.getElementById("article-markdown");
    const bodyElement = document.getElementById("markdown-body");
    const tocElement = document.getElementById("article-toc");

    if (!sourceElement || !bodyElement || !tocElement) {
        return;
    }

    const usedIds = new Map();

    function escapeHtml(value) {
        return value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function stripMarkdown(value) {
        return value
            .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .replace(/[`*_>#-]/g, "")
            .trim();
    }

    function normalizeReferenceId(value) {
        return stripMarkdown(value)
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "-")
            .replace(/^-+|-+$/g, "") || "reference";
    }

    function unescapeHtmlAttribute(value) {
        return value
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'");
    }

    function renderLink(href, label) {
        const resolvedHref = unescapeHtmlAttribute(href);
        const externalAttributes = /^https?:\/\//i.test(resolvedHref)
            ? ' target="_blank" rel="noopener noreferrer"'
            : "";

        return `<a href="${escapeHtml(resolvedHref)}"${externalAttributes}>${label}</a>`;
    }

    function renderCitation(keys) {
        const references = keys
            .split(/[,;]+/)
            .map((key) => key.trim())
            .filter(Boolean);

        if (!references.length) {
            return "";
        }

        const label = references.join(", ");
        const links = references.map((reference, index) => {
            const id = normalizeReferenceId(reference);
            const separator = index > 0 ? ", " : "";
            return `${separator}<a href="#ref-${id}" class="citation-link">${escapeHtml(reference)}</a>`;
        });

        return `<sup class="citation" aria-label="参考文献 ${escapeHtml(label)}">[${links.join("")}]</sup>`;
    }

    function slugify(value) {
        const base = stripMarkdown(value)
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
            .replace(/^-+|-+$/g, "") || "section";

        const count = usedIds.get(base) || 0;
        usedIds.set(base, count + 1);
        return count ? `${base}-${count + 1}` : base;
    }

    function normalizeMarkdown(value) {
        const lines = value.replace(/\r\n?/g, "\n").trim().split("\n");
        const indents = lines
            .filter((line) => line.trim())
            .map((line) => line.match(/^ */)[0].length);
        const minIndent = indents.length ? Math.min(...indents) : 0;

        return lines.map((line) => line.slice(minIndent)).join("\n");
    }

    function protectMath(value) {
        const segments = [];
        const pattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;
        const text = value.replace(pattern, (match) => {
            const token = `@@MATH_${segments.length}@@`;
            segments.push(match);
            return token;
        });

        return { text, segments };
    }

    function restoreMath(value, segments) {
        return segments.reduce((result, segment, index) => {
            return result.replace(`@@MATH_${index}@@`, () => escapeHtml(segment));
        }, value);
    }

    function renderInline(value) {
        const math = protectMath(value);
        let text = escapeHtml(math.text);

        text = text.replace(/\\cite\{([^}]+)\}/g, (_match, keys) => renderCitation(keys));
        text = text.replace(/\\url\{([^}]+)\}/g, (_match, href) => {
            return renderLink(href, escapeHtml(href));
        });
        text = text.replace(/\\href\{([^}]+)\}\{([^}]+)\}/g, (_match, href, label) => {
            return renderLink(href, escapeHtml(label));
        });
        text = text.replace(/\\hyperref\[([^\]]+)\]\{([^}]+)\}/g, (_match, id, label) => {
            return renderLink(`#${normalizeReferenceId(id)}`, escapeHtml(label));
        });
        text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
        text = text.replace(/==([^=]+)==/g, "<mark>$1</mark>");
        text = text.replace(/&lt;span style=&quot;color:\s*red;?&quot;&gt;([\s\S]*?)&lt;\/span&gt;/gi, "<span class=\"obsidian-red\">$1</span>");
        text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)(?:\{width=(\d+)\})?/g, (_match, alt, src, width) => {
            const style = width ? ` style="max-width: ${escapeHtml(width)}px;"` : "";
            return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${style}>`;
        });
        text = text.replace(/&lt;(https?:\/\/[^&\s]+(?:&amp;[^&\s]+)*)&gt;/g, (_match, href) => {
            return renderLink(href, href);
        });
        text = text.replace(/\bDOI:\s*(10\.\d{4,9}\/[^\s<]+)/gi, (_match, doi) => {
            const cleanedDoi = doi.replace(/[.,;，。；]+$/g, "");
            const suffix = doi.slice(cleanedDoi.length);
            return `DOI: ${renderLink(`https://doi.org/${cleanedDoi}`, escapeHtml(cleanedDoi))}${escapeHtml(suffix)}`;
        });
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
            return renderLink(href, label);
        });
        text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

        return restoreMath(text, math.segments);
    }

    function renderReferenceItem(value) {
        const reference = value.match(/^\[(\d+)\]\s+([\s\S]+)$/);

        if (!reference) {
            return "";
        }

        const id = normalizeReferenceId(reference[1]);
        return [
            `<li class="reference-item" id="ref-${id}" value="${escapeHtml(reference[1])}">`,
            `<span class="reference-number">[${escapeHtml(reference[1])}]</span>`,
            `<span class="reference-text">${renderInline(reference[2])}</span>`,
            "</li>"
        ].join("");
    }

    function parseLatexCommand(block, command) {
        const pattern = new RegExp(`\\\\${command}\\{([\\s\\S]*?)\\}`);
        const match = block.match(pattern);
        return match ? match[1].trim() : "";
    }

    function formatFloatLabel(label, type) {
        const cleanLabel = stripMarkdown(label).replace(/\s+/g, "");
        const match = cleanLabel.match(/^([^0-9]*?)(\d+)$/);

        if (match) {
            const prefix = match[1] || (type === "table" ? "表" : "图");
            return `${prefix} ${match[2]}`;
        }

        return cleanLabel || (type === "table" ? "表" : "图");
    }

    function getLatexWidthStyle(options) {
        const width = (options || "").match(/width\s*=\s*([0-9.]+)\s*\\linewidth/);

        if (!width) {
            return "";
        }

        const percent = Math.max(10, Math.min(100, Number(width[1]) * 100));
        return Number.isFinite(percent) ? ` style="width: ${percent}%;"` : "";
    }

    function renderFloatCaption(type, label, caption) {
        if (!label && !caption) {
            return "";
        }

        const id = label ? normalizeReferenceId(label) : "";
        const labelText = label ? formatFloatLabel(label, type) : (type === "table" ? "表" : "图");
        const labelHtml = id
            ? `<a class="caption-label" href="#${escapeHtml(id)}">${escapeHtml(labelText)}</a>`
            : `<span class="caption-label">${escapeHtml(labelText)}</span>`;
        const captionHtml = caption ? `<span class="caption-text">${renderInline(caption)}</span>` : "";

        return `<figcaption class="article-caption ${type}-caption">${labelHtml}${captionHtml}</figcaption>`;
    }

    function renderLatexFigure(blockLines) {
        const block = blockLines.join("\n");
        const graphic = block.match(/\\includegraphics(?:\[([^\]]*)\])?\{([^}]+)\}/);

        if (!graphic) {
            return `<pre class="latex-block">${escapeHtml(block)}</pre>`;
        }

        const label = parseLatexCommand(block, "label");
        const caption = parseLatexCommand(block, "caption");
        const id = label ? normalizeReferenceId(label) : "";
        const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";
        const src = graphic[2].trim();
        const widthStyle = getLatexWidthStyle(graphic[1] || "");
        const alt = caption || src.split("/").pop() || "article figure";
        const media = [
            `<a class="figure-media-link" href="${escapeHtml(src)}" aria-label="查看${escapeHtml(formatFloatLabel(label, "figure"))}原图">`,
            `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${widthStyle}>`,
            "</a>"
        ].join("");

        return [
            `<figure class="article-figure"${idAttribute}>`,
            media,
            renderFloatCaption("figure", label, caption),
            "</figure>"
        ].join("\n");
    }

    function renderLatexTable(blockLines) {
        const block = blockLines.join("\n");
        const label = parseLatexCommand(block, "label");
        const caption = parseLatexCommand(block, "caption");
        const id = label ? normalizeReferenceId(label) : "";
        const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";
        const tableStart = blockLines.findIndex((line, index) => {
            return line.includes("|") && index + 1 < blockLines.length && isTableDivider(blockLines[index + 1]);
        });

        if (tableStart < 0) {
            return `<pre class="latex-block">${escapeHtml(block)}</pre>`;
        }

        const table = parseTable(blockLines, tableStart);

        return [
            `<figure class="article-table-figure"${idAttribute}>`,
            renderFloatCaption("table", label, caption),
            `<div class="table-scroll">${table.html}</div>`,
            "</figure>"
        ].join("\n");
    }

    function normalizeCodeLanguage(value) {
        const rawLanguage = value.trim().split(/\s+/)[0].toLowerCase();
        const aliases = {
            "c++": "cpp",
            "c#": "csharp",
            "js": "javascript",
            "mjs": "javascript",
            "py": "python",
            "shell": "bash",
            "sh": "bash",
            "zsh": "bash",
            "plain": "plaintext",
            "text": "plaintext"
        };

        return (aliases[rawLanguage] || rawLanguage).replace(/[^a-z0-9_-]/g, "");
    }

    function formatCodeLanguage(value) {
        const language = value.trim().split(/\s+/)[0];
        return language ? language.toUpperCase() : "CODE";
    }

    function escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    const localHighlightGrammars = {
        cpp: {
            keywords: [
                "alignas", "alignof", "asm", "auto", "break", "case", "catch", "class", "const", "constexpr",
                "continue", "decltype", "default", "delete", "do", "else", "enum", "explicit", "export", "extern",
                "for", "friend", "goto", "if", "inline", "mutable", "namespace", "new", "noexcept", "operator",
                "private", "protected", "public", "register", "return", "sizeof", "static", "struct", "switch", "template",
                "this", "throw", "try", "typedef", "typename", "using", "virtual", "volatile", "while"
            ],
            types: [
                "bool", "char", "char16_t", "char32_t", "double", "float", "int", "long", "short", "signed",
                "unsigned", "void", "wchar_t", "string", "vector", "array", "deque", "list", "map", "set",
                "unordered_map", "unordered_set", "queue", "stack", "priority_queue", "pair", "tuple", "size_t"
            ],
            builtIns: [
                "std", "cin", "cout", "cerr", "endl", "push_back", "pop_back", "clear", "size", "empty",
                "begin", "end", "sort", "max", "min", "swap", "lower_bound", "upper_bound"
            ],
            literals: ["true", "false", "nullptr", "NULL"]
        },
        javascript: {
            keywords: [
                "async", "await", "break", "case", "catch", "class", "const", "continue", "default", "delete",
                "do", "else", "export", "extends", "finally", "for", "from", "function", "if", "import",
                "in", "instanceof", "let", "new", "of", "return", "static", "switch", "this", "throw",
                "try", "typeof", "var", "void", "while", "yield"
            ],
            types: [],
            builtIns: ["Array", "Date", "Error", "JSON", "Map", "Math", "Number", "Object", "Promise", "Set", "String"],
            literals: ["true", "false", "null", "undefined", "NaN"]
        },
        python: {
            keywords: [
                "and", "as", "assert", "async", "await", "break", "class", "continue", "def", "del", "elif",
                "else", "except", "finally", "for", "from", "global", "if", "import", "in", "is", "lambda",
                "nonlocal", "not", "or", "pass", "raise", "return", "try", "while", "with", "yield"
            ],
            types: [],
            builtIns: ["dict", "enumerate", "float", "int", "len", "list", "print", "range", "set", "str", "sum", "tuple"],
            literals: ["True", "False", "None"]
        },
        bash: {
            keywords: ["case", "do", "done", "elif", "else", "esac", "fi", "for", "function", "if", "in", "then", "while"],
            types: [],
            builtIns: ["cd", "echo", "exit", "export", "grep", "ls", "mkdir", "npm", "pwd", "rg", "sed"],
            literals: []
        }
    };

    localHighlightGrammars.c = localHighlightGrammars.cpp;
    localHighlightGrammars.csharp = localHighlightGrammars.cpp;
    localHighlightGrammars.java = localHighlightGrammars.cpp;
    localHighlightGrammars.typescript = localHighlightGrammars.javascript;
    localHighlightGrammars.shell = localHighlightGrammars.bash;

    function makeWordPattern(words) {
        return words.length ? words.map(escapeRegExp).join("|") : "";
    }

    function wrapHighlightedToken(match, className) {
        return `<span class="${className}">${escapeHtml(match)}</span>`;
    }

    function highlightCodeLocally(value, language) {
        const grammar = localHighlightGrammars[language];

        if (!grammar || language === "plaintext") {
            return escapeHtml(value);
        }

        const keywordSet = new Set(grammar.keywords);
        const typeSet = new Set(grammar.types);
        const builtInSet = new Set(grammar.builtIns);
        const literalSet = new Set(grammar.literals);
        const tokenPatterns = [
            "\\/\\*[\\s\\S]*?\\*\\/",
            "\\/\\/[^\\n]*",
            "#[^\\n]*",
            '"(?:\\\\.|[^"\\\\])*"',
            "'(?:\\\\.|[^'\\\\])*'",
            "`(?:\\\\.|[^`\\\\])*`",
            "\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b"
        ];
        const keywordPattern = makeWordPattern(grammar.keywords);
        const typePattern = makeWordPattern(grammar.types);
        const builtInPattern = makeWordPattern(grammar.builtIns);
        const literalPattern = makeWordPattern(grammar.literals);

        if (keywordPattern) {
            tokenPatterns.push(`\\b(?:${keywordPattern})\\b`);
        }

        if (typePattern) {
            tokenPatterns.push(`\\b(?:${typePattern})\\b`);
        }

        if (builtInPattern) {
            tokenPatterns.push(`\\b(?:${builtInPattern})\\b`);
        }

        if (literalPattern) {
            tokenPatterns.push(`\\b(?:${literalPattern})\\b`);
        }

        const tokenPattern = new RegExp(tokenPatterns.join("|"), "g");
        let html = "";
        let lastIndex = 0;

        value.replace(tokenPattern, (match, offset) => {
            html += escapeHtml(value.slice(lastIndex, offset));
            lastIndex = offset + match.length;

            if (match.startsWith("/*") || match.startsWith("//") || (match.startsWith("#") && ["bash", "python", "shell"].includes(language))) {
                html += wrapHighlightedToken(match, "hljs-comment");
            } else if (match.startsWith("#")) {
                html += wrapHighlightedToken(match, "hljs-meta");
            } else if (/^["'`]/.test(match)) {
                html += wrapHighlightedToken(match, "hljs-string");
            } else if (/^\d/.test(match)) {
                html += wrapHighlightedToken(match, "hljs-number");
            } else if (literalSet.has(match)) {
                html += wrapHighlightedToken(match, "hljs-literal");
            } else if (typeSet.has(match)) {
                html += wrapHighlightedToken(match, "hljs-type");
            } else if (builtInSet.has(match)) {
                html += wrapHighlightedToken(match, "hljs-built_in");
            } else if (keywordSet.has(match)) {
                html += wrapHighlightedToken(match, "hljs-keyword");
            } else {
                html += escapeHtml(match);
            }

            return match;
        });

        html += escapeHtml(value.slice(lastIndex));
        return html;
    }

    function renderCodeBlock(code, languageInfo, index) {
        const language = normalizeCodeLanguage(languageInfo);
        const codeClasses = ["hljs"];
        const languageLabel = formatCodeLanguage(languageInfo);
        const highlightedCode = highlightCodeLocally(code, language);

        if (language) {
            codeClasses.push(`language-${language}`);
        }

        return [
            `<div class="code-block" data-code-block="${index}">`,
            "<div class=\"code-toolbar\">",
            `<span class="code-language">${escapeHtml(languageLabel)}</span>`,
            "<div class=\"code-actions\">",
            "<button type=\"button\" class=\"code-copy\">Copy</button>",
            "<button type=\"button\" class=\"code-toggle\" aria-expanded=\"true\">Collapse</button>",
            "</div>",
            "</div>",
            `<pre><code class="${codeClasses.join(" ")}" data-highlighted="local">${highlightedCode}</code></pre>`,
            "</div>"
        ].join("");
    }

    const calloutDefinitions = {
        theorem: { title: "Theorem", symbol: "T" },
        proof: { title: "Proof", symbol: "P" },
        thesis: { title: "Thesis", symbol: "T" },
        corollary: { title: "Corollary", symbol: "C" },
        example: { title: "Example", symbol: "E" },
        note: { title: "Note", symbol: "N" },
        warning: { title: "Warning", symbol: "!" },
        tip: { title: "Tip", symbol: "i" }
    };

    function normalizeCalloutType(value) {
        return value.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "note";
    }

    function getCalloutDefinition(type) {
        return calloutDefinitions[type] || {
            title: type.charAt(0).toUpperCase() + type.slice(1),
            symbol: type.charAt(0).toUpperCase() || "N"
        };
    }

    function isQuoteLine(line) {
        return /^\s*>/.test(line);
    }

    function stripQuotePrefix(line) {
        return line.replace(/^\s*>\s?/, "");
    }

    function renderQuoteBlock(quoteLines) {
        const firstLine = quoteLines[0] || "";
        const callout = firstLine.match(/^\s*\[!([A-Za-z][\w-]*)\][+-]?\s*(.*)$/);

        if (!callout) {
            const quote = renderMarkdown(quoteLines.join("\n"));
            return `<blockquote>${quote.html}</blockquote>`;
        }

        const type = normalizeCalloutType(callout[1]);
        const definition = getCalloutDefinition(type);
        const customTitle = callout[2].trim();
        const title = customTitle || definition.title;
        const contentLines = quoteLines.slice(1);
        const content = renderMarkdown(contentLines.join("\n"));

        return [
            `<div class="markdown-callout markdown-callout-${escapeHtml(type)}">`,
            "<div class=\"callout-title\">",
            `<span class="callout-icon" aria-hidden="true">${escapeHtml(definition.symbol)}</span>`,
            `<span class="callout-title-text">${renderInline(title)}</span>`,
            "</div>",
            `<div class="callout-content">${content.html}</div>`,
            "</div>"
        ].join("");
    }

    function parseTable(lines, startIndex) {
        const rows = [];
        let index = startIndex;

        while (index < lines.length && lines[index].includes("|")) {
            rows.push(lines[index]);
            index += 1;
        }

        const cells = rows.map((row) => row
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((cell) => cell.trim()));

        const header = cells[0] || [];
        const bodyRows = cells.slice(2);
        const html = ["<table>", "<thead><tr>"];

        header.forEach((cell) => html.push(`<th>${renderInline(cell)}</th>`));
        html.push("</tr></thead>", "<tbody>");

        bodyRows.forEach((row) => {
            html.push("<tr>");
            row.forEach((cell) => html.push(`<td>${renderInline(cell)}</td>`));
            html.push("</tr>");
        });

        html.push("</tbody>", "</table>");
        return { html: html.join(""), nextIndex: index };
    }

    function isTableDivider(line) {
        return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
    }

    function renderMarkdown(markdown) {
        const lines = markdown.split("\n");
        const html = [];
        const headings = [];
        let paragraph = [];
        let listType = null;
        let listItems = [];
        let inCode = false;
        let codeLines = [];
        let codeLanguage = "";
        let codeBlockIndex = 0;
        let referenceListOpen = false;

        function openReferenceList() {
            if (!referenceListOpen) {
                html.push('<ol class="reference-list">');
                referenceListOpen = true;
            }
        }

        function closeReferenceList() {
            if (referenceListOpen) {
                html.push("</ol>");
                referenceListOpen = false;
            }
        }

        function flushParagraph() {
            if (!paragraph.length) {
                return;
            }

            const paragraphText = paragraph.join(" ");
            const referenceHtml = renderReferenceItem(paragraphText);

            if (referenceHtml) {
                flushList();
                openReferenceList();
                html.push(referenceHtml);
            } else {
                closeReferenceList();
                html.push(`<p>${renderInline(paragraphText)}</p>`);
            }

            paragraph = [];
        }

        function flushList() {
            if (!listType) {
                return;
            }

            const tag = listType;
            html.push(`<${tag}>`);
            listItems.forEach((item) => html.push(`<li>${renderInline(item)}</li>`));
            html.push(`</${tag}>`);
            listType = null;
            listItems = [];
        }

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            const trimmed = line.trim();
            const fence = trimmed.match(/^```\s*([^`]*)$/);

            if (fence) {
                if (inCode) {
                    html.push(renderCodeBlock(codeLines.join("\n"), codeLanguage, codeBlockIndex));
                    codeBlockIndex += 1;
                    inCode = false;
                    codeLines = [];
                    codeLanguage = "";
                } else {
                    flushParagraph();
                    flushList();
                    closeReferenceList();
                    inCode = true;
                    codeLanguage = fence[1] || "";
                }
                continue;
            }

            if (inCode) {
                codeLines.push(line);
                continue;
            }

            if (!trimmed) {
                flushParagraph();
                flushList();
                continue;
            }

            const latexEnvironment = trimmed.match(/^\\begin\{(figure|table)\}(?:\[[^\]]*\])?/);
            if (latexEnvironment) {
                flushParagraph();
                flushList();
                closeReferenceList();

                const environment = latexEnvironment[1];
                const blockLines = [line];
                index += 1;

                while (index < lines.length) {
                    blockLines.push(lines[index]);
                    if (lines[index].trim() === `\\end{${environment}}`) {
                        break;
                    }
                    index += 1;
                }

                html.push(environment === "figure"
                    ? renderLatexFigure(blockLines)
                    : renderLatexTable(blockLines));
                continue;
            }

            if (trimmed === "$$" || trimmed === "\\[") {
                flushParagraph();
                flushList();
                closeReferenceList();

                const closeDelimiter = trimmed === "$$" ? "$$" : "\\]";
                const mathLines = [];
                index += 1;

                while (index < lines.length && lines[index].trim() !== closeDelimiter) {
                    mathLines.push(lines[index]);
                    index += 1;
                }

                const displayMath = `${trimmed}\n${mathLines.join("\n")}\n${closeDelimiter}`;
                html.push(`<div class="math-display">${escapeHtml(displayMath)}</div>`);
                continue;
            }

            if (/^---+$/.test(trimmed)) {
                flushParagraph();
                flushList();
                closeReferenceList();
                html.push("<hr>");
                continue;
            }

            if (line.includes("|") && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
                flushParagraph();
                flushList();
                closeReferenceList();
                const table = parseTable(lines, index);
                html.push(table.html);
                index = table.nextIndex - 1;
                continue;
            }

            const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
            if (heading) {
                flushParagraph();
                flushList();
                closeReferenceList();
                const level = heading[1].length;
                const text = heading[2].trim();
                const id = slugify(text);
                headings.push({ id, level, text: stripMarkdown(text) });
                html.push(`<h${level} id="${id}">${renderInline(text)}</h${level}>`);
                continue;
            }

            const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
            if (unordered) {
                flushParagraph();
                closeReferenceList();
                if (listType && listType !== "ul") {
                    flushList();
                }
                listType = "ul";
                listItems.push(unordered[1]);
                continue;
            }

            const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
            if (ordered) {
                flushParagraph();
                closeReferenceList();
                if (listType && listType !== "ol") {
                    flushList();
                }
                listType = "ol";
                listItems.push(ordered[1]);
                continue;
            }

            if (isQuoteLine(line)) {
                flushParagraph();
                flushList();
                closeReferenceList();

                const quoteLines = [];

                while (index < lines.length && isQuoteLine(lines[index])) {
                    quoteLines.push(stripQuotePrefix(lines[index]));
                    index += 1;
                }

                html.push(renderQuoteBlock(quoteLines));
                index -= 1;
                continue;
            }

            flushList();
            paragraph.push(trimmed);
        }

        if (inCode) {
            html.push(renderCodeBlock(codeLines.join("\n"), codeLanguage, codeBlockIndex));
        }

        flushParagraph();
        flushList();
        closeReferenceList();

        return { html: html.join("\n"), headings };
    }

    function buildTocTree(headings) {
        const root = { level: 0, children: [] };
        const stack = [root];

        headings.forEach((heading, index) => {
            const node = { ...heading, index, children: [] };

            while (stack.length > 1 && stack[stack.length - 1].level >= node.level) {
                stack.pop();
            }

            stack[stack.length - 1].children.push(node);
            stack.push(node);
        });

        return root.children;
    }

    function renderTocNodes(nodes, parentElement) {
        nodes.forEach((node) => {
            const hasChildren = node.children.length > 0;
            const item = document.createElement("li");
            const row = document.createElement("div");
            const link = document.createElement("a");
            let childList = null;

            item.className = `toc-item toc-level-${node.level}${hasChildren ? " has-children" : ""}`;
            row.className = "toc-row";

            if (hasChildren) {
                const toggle = document.createElement("button");
                const startsCollapsed = node.level >= 2;

                toggle.type = "button";
                toggle.className = "toc-toggle";
                toggle.setAttribute("aria-label", `${startsCollapsed ? "Expand" : "Collapse"} ${node.text}`);
                toggle.setAttribute("aria-expanded", String(!startsCollapsed));

                toggle.addEventListener("click", () => {
                    const isCollapsed = item.classList.toggle("is-collapsed");

                    if (childList) {
                        childList.hidden = isCollapsed;
                    }

                    toggle.setAttribute("aria-expanded", String(!isCollapsed));
                    toggle.setAttribute("aria-label", `${isCollapsed ? "Expand" : "Collapse"} ${node.text}`);
                });

                if (startsCollapsed) {
                    item.classList.add("is-collapsed");
                }

                row.appendChild(toggle);
            } else {
                const spacer = document.createElement("span");
                spacer.className = "toc-spacer";
                row.appendChild(spacer);
            }

            link.href = `#${node.id}`;
            link.textContent = node.text;
            link.className = `toc-link toc-depth-${node.level}`;
            row.appendChild(link);
            item.appendChild(row);

            if (hasChildren) {
                childList = document.createElement("ol");
                childList.className = "toc-children";
                childList.hidden = item.classList.contains("is-collapsed");
                renderTocNodes(node.children, childList);
                item.appendChild(childList);
            }

            parentElement.appendChild(item);
        });
    }

    function renderToc(headings) {
        tocElement.innerHTML = "";
        tocElement.className = "toc-tree";

        if (!headings.length) {
            const empty = document.createElement("li");
            empty.textContent = "No headings yet";
            empty.className = "toc-empty";
            tocElement.appendChild(empty);
            return;
        }

        renderTocNodes(buildTocTree(headings), tocElement);
    }

    function setupTocScrollSpy(headings) {
        const sections = headings
            .map((heading) => {
                const section = document.getElementById(heading.id);
                const link = tocElement.querySelector(`.toc-link[href="#${CSS.escape(heading.id)}"]`);

                return section && link ? { section, link } : null;
            })
            .filter(Boolean);

        if (!sections.length) {
            return;
        }

        const tocPanel = tocElement.closest(".article-toc-panel");
        let activeLink = null;
        let frameId = null;

        function expandActivePath(link) {
            let childList = link.closest(".toc-children");

            while (childList) {
                childList.hidden = false;

                const parentItem = childList.parentElement;
                parentItem.classList.remove("is-collapsed");

                const toggle = parentItem.querySelector(":scope > .toc-row .toc-toggle");
                const parentLink = parentItem.querySelector(":scope > .toc-row .toc-link");

                if (toggle) {
                    toggle.setAttribute("aria-expanded", "true");
                    toggle.setAttribute("aria-label", `Collapse ${parentLink ? parentLink.textContent : "section"}`);
                }

                childList = parentItem.parentElement.closest(".toc-children");
            }
        }

        function keepActiveLinkVisible(link) {
            if (!tocPanel || tocPanel.scrollHeight <= tocPanel.clientHeight) {
                return;
            }

            const panelRect = tocPanel.getBoundingClientRect();
            const linkRect = link.getBoundingClientRect();
            const panelTitle = tocPanel.querySelector("p");
            const visibleTop = panelTitle
                ? Math.max(panelRect.top, panelTitle.getBoundingClientRect().bottom + 8)
                : panelRect.top;

            if (linkRect.top < visibleTop) {
                tocPanel.scrollTop -= visibleTop - linkRect.top;
            } else if (linkRect.bottom > panelRect.bottom - 12) {
                tocPanel.scrollTop += linkRect.bottom - panelRect.bottom + 12;
            }
        }

        function setActiveLink(link) {
            if (link === activeLink) {
                return;
            }

            if (activeLink) {
                activeLink.classList.remove("is-active");
                activeLink.removeAttribute("aria-current");
                activeLink.closest(".toc-item").classList.remove("is-active");
            }

            activeLink = link;
            activeLink.classList.add("is-active");
            activeLink.setAttribute("aria-current", "location");
            activeLink.closest(".toc-item").classList.add("is-active");
            expandActivePath(activeLink);
            keepActiveLinkVisible(activeLink);
        }

        function updateActiveLink() {
            frameId = null;
            const readingLine = Math.min(window.innerHeight * 0.28, 200);
            const atPageEnd = window.scrollY > 0
                && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
            let activeSection = sections[0];

            if (atPageEnd) {
                activeSection = sections[sections.length - 1];
            } else {
                for (const entry of sections) {
                    if (entry.section.getBoundingClientRect().top > readingLine) {
                        break;
                    }

                    activeSection = entry;
                }
            }

            setActiveLink(activeSection.link);
        }

        function scheduleUpdate() {
            if (frameId === null) {
                frameId = window.requestAnimationFrame(updateActiveLink);
            }
        }

        window.addEventListener("scroll", scheduleUpdate, { passive: true });
        window.addEventListener("resize", scheduleUpdate);
        window.addEventListener("hashchange", scheduleUpdate);

        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(scheduleUpdate);
            resizeObserver.observe(bodyElement);
        }

        scheduleUpdate();
    }

    function copyText(value) {
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(value);
        }

        return new Promise((resolve, reject) => {
            const textarea = document.createElement("textarea");
            textarea.value = value;
            textarea.setAttribute("readonly", "");
            textarea.style.position = "fixed";
            textarea.style.top = "-9999px";
            document.body.appendChild(textarea);
            textarea.select();

            try {
                const copied = document.execCommand("copy");
                document.body.removeChild(textarea);
                copied ? resolve() : reject(new Error("Copy command failed"));
            } catch (error) {
                document.body.removeChild(textarea);
                reject(error);
            }
        });
    }

    function enhanceCodeBlocks() {
        if (!bodyElement.querySelectorAll) {
            return;
        }

        bodyElement.querySelectorAll(".code-block").forEach((block) => {
            const copyButton = block.querySelector(".code-copy");
            const toggleButton = block.querySelector(".code-toggle");
            const codeElement = block.querySelector("code");

            if (copyButton && codeElement) {
                copyButton.addEventListener("click", async () => {
                    try {
                        await copyText(codeElement.textContent);
                        copyButton.textContent = "Copied";
                        window.setTimeout(() => {
                            copyButton.textContent = "Copy";
                        }, 1400);
                    } catch (_error) {
                        copyButton.textContent = "Copy failed";
                        window.setTimeout(() => {
                            copyButton.textContent = "Copy";
                        }, 1600);
                    }
                });
            }

            if (toggleButton) {
                toggleButton.addEventListener("click", () => {
                    const isCollapsed = block.classList.toggle("is-collapsed");
                    toggleButton.textContent = isCollapsed ? "Expand" : "Collapse";
                    toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
                });
            }
        });
    }

    function highlightCodeBlocks() {
        if (!window.hljs || !bodyElement.querySelectorAll) {
            return;
        }

        window.hljs.configure({ ignoreUnescapedHTML: true });
        bodyElement.querySelectorAll("pre code").forEach((codeElement) => {
            if (codeElement.dataset.highlighted === "local") {
                return;
            }

            window.hljs.highlightElement(codeElement);
        });
    }

    function loadHighlightJs() {
        if (window.hljs) {
            highlightCodeBlocks();
            return;
        }

        if (!document.querySelector('link[data-highlight-theme="true"]')) {
            const theme = document.createElement("link");
            theme.rel = "stylesheet";
            theme.href = "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css";
            theme.dataset.highlightTheme = "true";
            document.head.appendChild(theme);
        }

        const existingScript = document.querySelector('script[data-highlight-js="true"]');

        if (existingScript) {
            existingScript.addEventListener("load", highlightCodeBlocks, { once: true });
            return;
        }

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/common.min.js";
        script.async = true;
        script.dataset.highlightJs = "true";
        script.addEventListener("load", highlightCodeBlocks, { once: true });
        document.head.appendChild(script);
    }

    function typesetMath() {
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([bodyElement]);
        }
    }

    function loadMathJax() {
        window.MathJax = window.MathJax || {
            tex: {
                inlineMath: [["$", "$"], ["\\(", "\\)"]],
                displayMath: [["$$", "$$"], ["\\[", "\\]"]],
                processEscapes: true
            },
            options: {
                skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"]
            },
            svg: {
                fontCache: "global"
            }
        };

        if (window.MathJax.typesetPromise) {
            typesetMath();
            return;
        }

        const existingScript = document.querySelector('script[data-mathjax="true"]');

        if (existingScript) {
            existingScript.addEventListener("load", typesetMath, { once: true });
            return;
        }

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
        script.async = true;
        script.dataset.mathjax = "true";
        script.addEventListener("load", typesetMath, { once: true });
        document.head.appendChild(script);
    }

    const markdown = normalizeMarkdown(sourceElement.textContent);
    const result = renderMarkdown(markdown);

    bodyElement.innerHTML = result.html;
    renderToc(result.headings);
    setupTocScrollSpy(result.headings);
    enhanceCodeBlocks();
    loadHighlightJs();
    loadMathJax();
})();
