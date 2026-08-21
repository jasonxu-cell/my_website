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

    function stripHeadingMarkdown(value) {
        return value
            .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .replace(/[`*_>]/g, "")
            .trim();
    }

    function unescapeMarkdown(value) {
        return value.replace(/\\([\\`*{}\[\]()#+\-.!_>])/g, "$1");
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

    function normalizeHeadingId(value) {
        const resolvedValue = unescapeMarkdown(value)
            .replace(/\bC\+\+/gi, "Cplusplus")
            .replace(/\bC#/gi, "Csharp");

        return stripMarkdown(resolvedValue)
            .toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
            .replace(/^-+|-+$/g, "") || "section";
    }

    function slugify(value) {
        const base = normalizeHeadingId(value);

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
        text = text.replace(/\[\[#([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_match, heading, alias) => {
            const resolvedHeading = unescapeHtmlAttribute(heading.trim());
            const label = alias ? alias.trim() : escapeHtml(resolvedHeading);
            return renderLink(`#${normalizeHeadingId(resolvedHeading)}`, label);
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
            "c-shell": "csh",
            "common-lisp": "lisp",
            "commonlisp": "lisp",
            "f90": "fortran",
            "fortran90": "fortran",
            "hs": "haskell",
            "lhs": "haskell",
            "js": "javascript",
            "kornshell": "ksh",
            "mjs": "javascript",
            "modula-2": "modula",
            "objective-c": "objectivec",
            "objc": "objectivec",
            "py": "python",
            "rb": "ruby",
            "shell": "bash",
            "sh": "bash",
            "vb": "vbnet",
            "vbs": "vbscript",
            "visual-basic": "vbnet",
            "visual-basic-script": "vbscript",
            "visualbasic": "vbnet",
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
            literals: ["true", "false", "nullptr", "NULL"],
            metaPatterns: ["#[^\\n]*"]
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
            literals: ["True", "False", "None"],
            commentPatterns: ["#[^\\n]*"]
        },
        bash: {
            keywords: [
                "case", "coproc", "do", "done", "elif", "else", "esac", "fi", "for", "function", "if",
                "in", "select", "then", "time", "until", "while"
            ],
            types: [],
            builtIns: [
                "alias", "bg", "bind", "break", "builtin", "cd", "command", "continue", "declare", "dirs",
                "disown", "echo", "enable", "eval", "exec", "exit", "export", "fc", "fg", "getopts", "hash",
                "help", "history", "jobs", "kill", "let", "local", "logout", "mapfile", "popd", "printf",
                "pushd", "pwd", "read", "readarray", "readonly", "return", "set", "shift", "shopt", "source",
                "suspend", "test", "times", "trap", "type", "typeset", "ulimit", "umask", "unalias", "unset",
                "wait", "grep", "ls", "mkdir", "npm", "rg", "sed"
            ],
            literals: ["false", "true"],
            commentPatterns: ["#[^\\n]*"],
            metaPatterns: ["\\$\\{[^}\\n]+\\}|\\$(?:[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?$!-])"]
        },
        csh: {
            keywords: [
                "break", "breaksw", "case", "continue", "default", "else", "end", "endif", "endsw",
                "foreach", "goto", "if", "onintr", "repeat", "switch", "then", "while"
            ],
            types: [],
            builtIns: [
                "alias", "bg", "bindkey", "cd", "chdir", "complete", "dirs", "echo", "eval", "exec", "exit",
                "fg", "glob", "hashstat", "history", "jobs", "kill", "limit", "login", "logout", "nice",
                "nohup", "notify", "popd", "printenv", "pushd", "rehash", "set", "setenv", "source", "stop",
                "suspend", "time", "umask", "unalias", "uncomplete", "unhash", "unlimit", "unset", "unsetenv",
                "wait", "where", "which"
            ],
            literals: [],
            commentPatterns: ["#[^\\n]*"],
            metaPatterns: [
                "\\$\\{?[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z]+)?\\}?", "\\$[0-9@*#?$!-]"
            ],
            patterns: [
                { pattern: "@(?=\\s+[A-Za-z_])", className: "hljs-keyword" },
                { pattern: "![^\\s]+", className: "hljs-meta" }
            ]
        },
        fortran: {
            caseInsensitive: true,
            keywords: [
                "allocate", "call", "case", "contains", "cycle", "deallocate", "do", "else", "elseif", "end",
                "enddo", "endif", "function", "if", "implicit", "in", "module", "none", "only", "print",
                "program", "return", "select", "stop", "subroutine", "then", "use", "where", "while"
            ],
            types: ["character", "complex", "double", "integer", "logical", "precision", "real", "type"],
            builtIns: ["abs", "maxval", "minval", "read", "size", "sqrt", "sum", "write"],
            literals: ["true", "false"],
            commentPatterns: ["![^\\n]*"]
        },
        lisp: {
            keywords: [
                "and", "block", "cond", "defmacro", "defparameter", "defun", "do", "dolist", "dotimes", "flet",
                "funcall", "if", "labels", "lambda", "let", "let*", "loop", "or", "progn", "quote", "return-from",
                "setq", "unless", "when"
            ],
            types: [],
            builtIns: ["apply", "car", "cdr", "cons", "format", "list", "mapcar", "print", "reduce"],
            literals: ["nil", "t"],
            commentPatterns: ["#\\|[\\s\\S]*?\\|#", ";[^\\n]*"],
            stringPatterns: ["\"(?:\\\\.|[^\"\\\\])*\""]
        },
        algol: {
            caseInsensitive: true,
            keywords: [
                "array", "begin", "boolean", "comment", "do", "else", "end", "for", "goto", "if", "integer",
                "label", "own", "procedure", "real", "step", "string", "switch", "then", "until", "value", "while"
            ],
            types: ["boolean", "integer", "real", "string"],
            builtIns: ["abs", "entier", "newline", "outinteger", "print", "sqrt"],
            literals: ["true", "false"],
            commentPatterns: ["\\bcomment\\b[^;]*;"]
        },
        cobol: {
            caseInsensitive: true,
            keywords: [
                "accept", "add", "author", "by", "call", "compute", "data", "display", "division", "else", "end-if",
                "end-perform", "evaluate", "from", "giving", "identification", "if", "move", "multiply", "perform",
                "pic", "procedure", "program-id", "run", "section", "stop", "subtract", "then", "to", "until",
                "varying", "when", "working-storage"
            ],
            types: ["binary", "comp", "comp-3", "numeric", "picture"],
            builtIns: ["function", "length", "lower-case", "reverse", "upper-case"],
            literals: ["false", "high-value", "low-value", "spaces", "true", "zero", "zeros"],
            commentPatterns: ["^[ \\t]*\\*[^\\n]*", "\\*>[^\\n]*"]
        },
        cpl: {
            caseInsensitive: true,
            keywords: [
                "and", "do", "else", "for", "function", "if", "or", "result", "then", "until", "while"
            ],
            types: ["boolean", "integer", "real", "string"],
            builtIns: [],
            literals: ["true", "false"],
            commentPatterns: ["\\bcomment\\b[^;]*;"]
        },
        basic: {
            caseInsensitive: true,
            keywords: [
                "and", "data", "dim", "else", "end", "for", "gosub", "goto", "if", "input", "let", "next",
                "not", "on", "or", "print", "read", "rem", "restore", "return", "step", "stop", "then", "to", "while"
            ],
            types: ["double", "integer", "long", "single", "string"],
            builtIns: ["abs", "chr", "int", "left", "len", "mid", "right", "rnd", "sqr", "str", "val"],
            literals: ["true", "false"],
            commentPatterns: ["\\bREM\\b[^\\n]*", "'[^\\n]*"],
            stringPatterns: ["\"(?:\\\\.|[^\"\\\\])*\""]
        },
        vbnet: {
            caseInsensitive: true,
            keywords: [
                "AddHandler", "AddressOf", "Alias", "And", "AndAlso", "As", "ByRef", "ByVal", "Call",
                "Case", "Catch", "Class", "Const", "Continue", "Declare", "Default", "Delegate", "Dim",
                "DirectCast", "Do", "Each", "Else", "ElseIf", "End", "Enum", "Erase", "Error", "Event",
                "Exit", "Finally", "For", "Friend", "Function", "Get", "GetType", "Global", "GoSub", "GoTo",
                "Handles", "If", "Implements", "Imports", "In", "Inherits", "Interface", "Is", "IsNot", "Let",
                "Lib", "Like", "Loop", "Me", "Mod", "Module", "MustInherit", "MustOverride", "MyBase",
                "MyClass", "Namespace", "Narrowing", "New", "Next", "Not", "Of", "On", "Operator", "Option",
                "Optional", "Or", "OrElse", "Overloads", "Overridable", "Overrides", "ParamArray", "Partial",
                "Private", "Property", "Protected", "Public", "RaiseEvent", "ReadOnly", "ReDim", "RemoveHandler",
                "Resume", "Return", "Select", "Set", "Shadows", "Shared", "Static", "Step", "Stop", "Strict",
                "Structure", "Sub", "SyncLock", "Then", "Throw", "To", "Try", "TryCast", "TypeOf", "Using",
                "When", "While", "Widening", "With", "WithEvents", "WriteOnly", "Xor"
            ],
            types: [
                "Boolean", "Byte", "Char", "Date", "Decimal", "Double", "EventArgs", "Exception", "Integer",
                "Long", "Object", "SByte", "Short", "Single", "String", "UInteger", "ULong", "UShort"
            ],
            builtIns: [
                "Console", "Convert", "Debug", "Interaction", "Math", "MessageBox", "Microsoft", "My"
            ],
            literals: ["False", "Nothing", "True"],
            commentPatterns: ["'[^\\n]*", "\\bREM\\b[^\\n]*"],
            stringPatterns: ["\"(?:\"\"|[^\"])*\""],
            metaPatterns: ["^[ \\t]*#(?:Const|Else|ElseIf|End\\s+If|ExternalSource|If|Region)\\b[^\\n]*"]
        },
        vbscript: {
            caseInsensitive: true,
            keywords: [
                "Call", "Case", "Class", "Const", "Dim", "Do", "Each", "Else", "ElseIf", "End", "Eqv",
                "Erase", "Error", "Execute", "Exit", "Explicit", "For", "Function", "If", "Imp", "In", "Is",
                "Let", "Loop", "Mod", "Next", "Not", "On", "Option", "Or", "Preserve", "Private", "Property",
                "Public", "Randomize", "ReDim", "Resume", "Select", "Set", "Step", "Stop", "Sub", "Then", "To",
                "Wend", "While", "With", "Xor"
            ],
            types: ["Variant"],
            builtIns: [
                "Array", "Asc", "AscB", "AscW", "CBool", "CByte", "CCur", "CDate", "CDbl", "Chr", "ChrB",
                "ChrW", "CInt", "CLng", "CreateObject", "CSng", "CStr", "Date", "DateAdd", "DateDiff",
                "DatePart", "DateSerial", "DateValue", "Day", "Err", "Eval", "Filter", "FormatCurrency",
                "FormatDateTime", "FormatNumber", "FormatPercent", "GetLocale", "GetObject", "GetRef", "Hex",
                "Hour", "InputBox", "InStr", "InStrB", "InStrRev", "Int", "IsArray", "IsDate", "IsEmpty",
                "IsNull", "IsNumeric", "IsObject", "Join", "LBound", "LCase", "Left", "Len", "LoadPicture",
                "Log", "LTrim", "Mid", "Minute", "Month", "MonthName", "MsgBox", "Now", "Oct", "Replace",
                "RGB", "Right", "Rnd", "Round", "ScriptEngine", "Second", "SetLocale", "Space", "Split", "Sqr",
                "StrComp", "String", "StrReverse", "Time", "Timer", "TimeSerial", "TimeValue", "Trim", "TypeName",
                "UBound", "UCase", "VarType", "Weekday", "WeekdayName", "WScript", "Year"
            ],
            literals: ["Empty", "False", "Nothing", "Null", "True"],
            commentPatterns: ["'[^\\n]*", "\\bREM\\b[^\\n]*"],
            stringPatterns: ["\"(?:\"\"|[^\"])*\""],
            patterns: [
                { pattern: "#[^#\\n]+#", className: "hljs-literal" },
                { pattern: "\\.[A-Za-z_][A-Za-z0-9_]*", className: "hljs-built_in" }
            ]
        },
        simula: {
            caseInsensitive: true,
            keywords: [
                "activate", "begin", "class", "delay", "do", "else", "end", "for", "if", "inspect", "new",
                "otherwise", "process", "procedure", "qua", "ref", "resume", "simulation", "then", "this", "while"
            ],
            types: ["boolean", "character", "integer", "long", "real", "short", "text"],
            builtIns: ["First", "Hold", "Out", "OutText", "Wait"],
            literals: ["none", "notext", "true", "false"],
            commentPatterns: ["![^\\n]*"]
        },
        b: {
            keywords: ["auto", "break", "case", "default", "else", "extrn", "goto", "if", "return", "switch", "while"],
            types: [],
            builtIns: ["char", "getchar", "printn", "putchar"],
            literals: [],
            commentPatterns: ["\\/\\*[\\s\\S]*?\\*\\/", "\\/\\/[^\\n]*"]
        },
        pascal: {
            caseInsensitive: true,
            keywords: [
                "and", "array", "begin", "case", "class", "const", "constructor", "destructor", "do", "downto",
                "else", "end", "file", "for", "function", "goto", "if", "implementation", "in", "interface", "mod",
                "not", "of", "or", "packed", "private", "procedure", "program", "public", "record", "repeat", "set",
                "then", "to", "type", "unit", "until", "uses", "var", "while", "with"
            ],
            types: ["boolean", "char", "integer", "pointer", "real", "string", "text"],
            builtIns: ["Abs", "Dispose", "Length", "New", "Read", "ReadLn", "Write", "WriteLn"],
            literals: ["nil", "true", "false"],
            commentPatterns: ["\\(\\*[\\s\\S]*?\\*\\)", "\\{[\\s\\S]*?\\}", "\\/\\/[^\\n]*"],
            stringPatterns: ["'(?:[^']|'')*'"]
        },
        smalltalk: {
            keywords: ["self", "super", "thisContext"],
            types: [],
            builtIns: [
                "Array", "Block", "Calculator", "Character", "Class", "Collection", "Color", "Dictionary", "Object",
                "OrderedCollection", "Set", "String", "Symbol", "Transcript", "initialize", "new", "show", "subclass"
            ],
            literals: ["nil", "true", "false"],
            commentPatterns: ["\"[^\"]*\""],
            stringPatterns: ["'(?:[^']|'')*'"],
            patterns: [
                { pattern: "#[A-Za-z_][A-Za-z0-9_]*", className: "hljs-literal" },
                { pattern: ":[a-z][A-Za-z0-9_]*", className: "hljs-keyword" },
                { pattern: "\\b[a-z][A-Za-z0-9_]*(?=:)", className: "hljs-built_in" },
                { pattern: "\\b[A-Z][A-Za-z0-9_]*\\b", className: "hljs-type" }
            ]
        },
        ml: {
            keywords: [
                "abstype", "and", "andalso", "as", "case", "datatype", "do", "else", "end", "exception", "fn",
                "fun", "handle", "if", "in", "infix", "let", "local", "nonfix", "of", "op", "open", "orelse",
                "raise", "rec", "then", "type", "val", "with", "withtype"
            ],
            types: ["bool", "char", "int", "list", "real", "string", "unit", "word"],
            builtIns: ["Int", "List", "Option", "String", "print"],
            literals: ["nil", "true", "false"],
            commentPatterns: ["\\(\\*[\\s\\S]*?\\*\\)"],
            stringPatterns: ["\"(?:\\\\.|[^\"\\\\])*\""]
        },
        modula: {
            keywords: [
                "AND", "ARRAY", "BEGIN", "BY", "CASE", "CONST", "DEFINITION", "DIV", "DO", "ELSE", "ELSIF", "END",
                "EXIT", "EXPORT", "FOR", "FROM", "IF", "IMPLEMENTATION", "IMPORT", "IN", "LOOP", "MOD", "MODULE",
                "NOT", "OF", "OR", "POINTER", "PROCEDURE", "QUALIFIED", "RECORD", "REPEAT", "RETURN", "SET", "THEN",
                "TO", "TYPE", "UNTIL", "VAR", "WHILE", "WITH"
            ],
            types: ["BOOLEAN", "CARDINAL", "CHAR", "INTEGER", "LONGINT", "REAL"],
            builtIns: ["ABS", "CAP", "DEC", "DISPOSE", "INC", "NEW", "ORD", "WriteLn"],
            literals: ["FALSE", "NIL", "TRUE"],
            commentPatterns: ["\\(\\*[\\s\\S]*?\\*\\)"],
            stringPatterns: ["\"(?:\\\\.|[^\"\\\\])*\"", "'(?:[^']|'')*'"]
        },
        prolog: {
            keywords: ["as", "catch", "dynamic", "is", "meta_predicate", "module", "not", "once", "repeat", "throw"],
            types: [],
            builtIns: ["assert", "findall", "listing", "retract", "setof", "write", "writeln"],
            literals: ["false", "fail", "true"],
            commentPatterns: ["%[^\\n]*", "\\/\\*[\\s\\S]*?\\*\\/"],
            stringPatterns: ["\"(?:\\\\.|[^\"\\\\])*\"", "'(?:\\\\.|[^'\\\\])*'"],
            patterns: [
                { pattern: "\\b[a-z][A-Za-z0-9_]*(?=\\s*\\()", className: "hljs-built_in" },
                { pattern: "\\b[A-Z_][A-Za-z0-9_]*\\b", className: "hljs-type" }
            ]
        },
        scheme: {
            keywords: [
                "and", "begin", "call-with-current-continuation", "call/cc", "case", "cond", "define",
                "define-syntax", "delay", "do", "else", "force", "if", "lambda", "let", "let*", "letrec",
                "or", "quasiquote", "quote", "set!", "syntax-rules", "unquote", "unless", "when"
            ],
            types: [],
            builtIns: [
                "apply", "car", "cdr", "cons", "display", "for-each", "length", "list", "map", "newline",
                "null?", "pair?", "reverse", "values"
            ],
            literals: [],
            commentPatterns: ["#\\|[\\s\\S]*?\\|#", ";[^\\n]*"],
            stringPatterns: ["\"(?:\\\\.|[^\"\\\\])*\""],
            patterns: [
                { pattern: "#(?:t|f)\\b", className: "hljs-literal" }
            ]
        },
        objectivec: {
            keywords: [
                "alignas", "alignof", "asm", "auto", "break", "case", "class", "const", "continue", "default",
                "do", "else", "enum", "extern", "for", "goto", "if", "inline", "register", "return", "sizeof",
                "static", "struct", "switch", "typedef", "union", "volatile", "while"
            ],
            types: [
                "BOOL", "Class", "NSInteger", "NSUInteger", "SEL", "id", "char", "double", "float", "int",
                "long", "short", "signed", "unsigned", "void", "NSArray", "NSError", "NSObject", "NSString"
            ],
            builtIns: ["NSLog", "alloc", "autorelease", "init", "release", "retain"],
            literals: ["nil", "Nil", "YES", "NO", "NULL"],
            metaPatterns: ["#[^\\n]*", "@[A-Za-z_][A-Za-z0-9_]*"],
            stringPatterns: ["@?\"(?:\\\\.|[^\"\\\\])*\"", "'(?:\\\\.|[^'\\\\])*'"]
        },
        perl: {
            keywords: [
                "continue", "do", "else", "elsif", "eval", "for", "foreach", "given", "goto", "if", "last",
                "local", "my", "next", "our", "package", "redo", "require", "return", "state", "sub", "unless",
                "until", "use", "when", "while"
            ],
            types: [],
            builtIns: [
                "chomp", "defined", "die", "join", "keys", "length", "open", "pop", "print", "push", "say",
                "shift", "split", "unshift", "values", "warn"
            ],
            literals: ["undef"],
            commentPatterns: ["#[^\\n]*"],
            patterns: [
                { pattern: "[$@%][A-Za-z_][A-Za-z0-9_]*", className: "hljs-type" },
                { pattern: "\\b(?:m|q|qq|qr|s|tr|y)(?=[{/])", className: "hljs-keyword" }
            ]
        },
        batch: {
            caseInsensitive: true,
            keywords: [
                "call", "do", "else", "endlocal", "equ", "exist", "exit", "for", "geq", "goto", "gtr", "if",
                "in", "leq", "lss", "neq", "not", "pause", "set", "setlocal", "shift", "start"
            ],
            types: [],
            builtIns: ["cd", "cls", "copy", "del", "dir", "echo", "mkdir", "move", "rmdir", "type"],
            literals: ["errorlevel"],
            commentPatterns: ["^[ \\t]*(?:REM\\b|::)[^\\n]*"],
            stringPatterns: ["\"(?:\\\\.|[^\"\\\\])*\""],
            metaPatterns: ["@[A-Za-z]+", ":[A-Za-z_][A-Za-z0-9_-]*"],
            patterns: [
                { pattern: "%%[A-Za-z]", className: "hljs-type" },
                { pattern: "%[^%\\n]+%", className: "hljs-type" }
            ]
        },
        ada: {
            caseInsensitive: true,
            keywords: [
                "abort", "abs", "abstract", "accept", "access", "aliased", "all", "and", "array", "at", "begin",
                "body", "case", "constant", "declare", "delay", "delta", "digits", "do", "else", "elsif", "end",
                "entry", "exception", "exit", "for", "function", "generic", "goto", "if", "in", "interface", "is",
                "limited", "loop", "mod", "new", "not", "null", "of", "or", "others", "out", "overriding",
                "package", "pragma", "private", "procedure", "protected", "raise", "range", "record", "rem",
                "renames", "requeue", "return", "reverse", "select", "separate", "subtype", "synchronized", "tagged",
                "task", "terminate", "then", "type", "until", "use", "when", "while", "with", "xor"
            ],
            types: ["Boolean", "Character", "Float", "Integer", "Natural", "Positive", "String"],
            builtIns: ["Ada", "Get", "Get_Line", "New_Line", "Put", "Put_Line"],
            literals: ["True", "False"],
            commentPatterns: ["--[^\\n]*"],
            stringPatterns: ["\"(?:\"\"|[^\"])*\"", "'(?:[^']|'')*'"]
        },
        erlang: {
            keywords: [
                "after", "and", "andalso", "band", "begin", "bnot", "bor", "bsl", "bsr", "bxor",
                "case", "catch", "cond", "div", "else", "end", "fun", "if", "let", "maybe", "not",
                "of", "or", "orelse", "receive", "rem", "try", "when", "xor"
            ],
            types: [
                "atom", "binary", "bitstring", "boolean", "byte", "char", "float", "function", "integer",
                "iodata", "iolist", "list", "map", "mfa", "module", "node", "non_neg_integer", "number",
                "pid", "port", "reference", "string", "term", "timeout", "tuple"
            ],
            builtIns: [
                "element", "exit", "hd", "is_atom", "is_binary", "is_boolean", "is_float", "is_function",
                "is_integer", "is_list", "is_map", "is_number", "is_pid", "is_tuple", "length", "link",
                "make_ref", "map_get", "monitor", "node", "nodes", "process_flag", "register", "self",
                "setelement", "spawn", "spawn_link", "tl", "tuple_size", "whereis"
            ],
            literals: ["false", "infinity", "nil", "ok", "true", "undefined"],
            commentPatterns: ["%[^\\n]*"],
            metaPatterns: ["-[a-z][A-Za-z0-9_]*(?=\\s*\\()"],
            stringPatterns: ["\"(?:\\\\.|[^\"\\\\])*\"", "'(?:\\\\.|[^'\\\\])*'", "\\$(?:\\\\.|[^\\s])"],
            patterns: [
                { pattern: "\\b[A-Z_][A-Za-z0-9_@]*\\b", className: "hljs-type" },
                { pattern: "\\b[a-z][A-Za-z0-9_@]*(?=\\s*\\()", className: "hljs-built_in" }
            ]
        },
        r: {
            keywords: ["break", "else", "for", "function", "if", "in", "next", "repeat", "while"],
            types: [
                "array", "character", "complex", "data.frame", "double", "factor", "integer", "list",
                "logical", "matrix", "numeric", "raw", "vector"
            ],
            builtIns: [
                "abs", "aggregate", "append", "apply", "as.data.frame", "as.factor", "as.integer", "as.numeric",
                "barplot", "c", "cat", "colMeans", "data.frame", "dim", "factor", "head", "hist", "is.na",
                "lapply", "length", "library", "list", "lm", "matrix", "mean", "median", "names", "ncol",
                "nrow", "par", "paste", "plot", "print", "rbind", "read.csv", "rep", "return", "rowMeans",
                "sapply", "sd", "seq", "setwd", "sort", "source", "str", "summary", "table", "tail",
                "tapply", "var", "vector"
            ],
            literals: [
                "FALSE", "Inf", "NA", "NA_character_", "NA_complex_", "NA_integer_", "NA_real_", "NaN",
                "NULL", "TRUE"
            ],
            commentPatterns: ["#[^\\n]*"],
            stringPatterns: ["\"(?:\\\\.|[^\"\\\\])*\"", "'(?:\\\\.|[^'\\\\])*'", "`(?:\\\\.|[^`\\\\])*`"],
            patterns: [
                { pattern: "(?:<<-|<-|->>|->|\\|>|%[^%\\n]+%)", className: "hljs-keyword" },
                { pattern: "\\$[A-Za-z.][A-Za-z0-9._]*", className: "hljs-built_in" },
                { pattern: "\\b[A-Za-z][A-Za-z0-9.]*:::{0,1}", className: "hljs-meta" }
            ]
        },
        abc: {
            caseInsensitive: true,
            keywords: [
                "CHECK", "ELSE", "FOR", "HOW", "IF", "IN", "PASS", "PUT", "READ", "REMOVE", "REPORT", "RETURN",
                "SELECT", "SHARE", "TO", "WHILE", "WRITE"
            ],
            types: ["LIST", "TABLE", "TEXT"],
            builtIns: ["keys", "length", "number", "root"],
            literals: [],
            commentPatterns: [],
            stringPatterns: ["\"(?:\\\\.|[^\"\\\\])*\"", "'(?:\\\\.|[^'\\\\])*'"]
        },
        ruby: {
            keywords: [
                "BEGIN", "END", "alias", "and", "begin", "break", "case", "class", "def", "defined", "do",
                "else", "elsif", "end", "ensure", "for", "if", "in", "module", "next", "not", "or", "redo",
                "rescue", "retry", "return", "self", "super", "then", "undef", "unless", "until", "when",
                "while", "yield", "__ENCODING__", "__FILE__", "__LINE__"
            ],
            types: [
                "Array", "Class", "Enumerable", "Exception", "Hash", "Integer", "Module", "Object", "Proc",
                "Range", "Regexp", "String", "Struct", "Symbol"
            ],
            builtIns: [
                "attr_accessor", "attr_reader", "attr_writer", "extend", "include", "lambda", "load", "p",
                "print", "printf", "proc", "puts", "raise", "require", "require_relative"
            ],
            literals: ["false", "nil", "true"],
            commentPatterns: ["^=begin\\b[\\s\\S]*?^=end\\b[^\\n]*", "#[^\\n]*"],
            stringPatterns: [
                "\"(?:\\\\.|[^\"\\\\])*\"", "'(?:\\\\.|[^'\\\\])*'", "`(?:\\\\.|[^`\\\\])*`"
            ],
            metaPatterns: ["@@?[A-Za-z_][A-Za-z0-9_]*", "\\$[A-Za-z_][A-Za-z0-9_]*"],
            patterns: [
                { pattern: ":[A-Za-z_][A-Za-z0-9_]*[!?=]?", className: "hljs-literal" },
                { pattern: "\\b[A-Za-z_][A-Za-z0-9_]*:(?!:)", className: "hljs-literal" },
                { pattern: "\\b[A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*\\b", className: "hljs-type" }
            ]
        },
        haskell: {
            keywords: [
                "as", "case", "class", "data", "default", "deriving", "do", "else", "family", "forall",
                "foreign", "hiding", "if", "import", "in", "infix", "infixl", "infixr", "instance", "let",
                "mdo", "module", "newtype", "of", "pattern", "qualified", "rec", "role", "safe", "stock",
                "then", "type", "unsafe", "via", "where"
            ],
            types: [
                "Applicative", "Bool", "Bounded", "Char", "Double", "Either", "Enum", "Eq", "Float",
                "Floating", "Foldable", "Fractional", "Functor", "IO", "Int", "Integer", "Integral", "Maybe",
                "Monad", "Num", "Ord", "Ordering", "Rational", "Read", "Real", "RealFloat", "RealFrac", "Show",
                "String", "Traversable", "Word"
            ],
            builtIns: [
                "const", "curry", "drop", "either", "even", "filter", "flip", "foldl", "foldr", "fst", "head",
                "id", "length", "map", "maybe", "null", "odd", "pi", "print", "pure", "putStrLn", "read",
                "return", "reverse", "show", "snd", "sum", "tail", "take", "uncurry", "zip"
            ],
            literals: ["False", "Nothing", "True"],
            commentPatterns: ["--[^\\n]*", "\\{-(?!#)[\\s\\S]*?-\\}"],
            stringPatterns: ["\"(?:\\\\.|[^\"\\\\])*\"", "'(?:\\\\.|[^'\\\\])'"],
            metaPatterns: ["\\{-#\\s*[\\s\\S]*?#-\\}"],
            patterns: [
                { pattern: "(?:::|=>|->|<-|\\|)", className: "hljs-keyword" },
                { pattern: "\\b(?!(?:False|Nothing|True)\\b)[A-Z][A-Za-z0-9_']*\\b", className: "hljs-type" }
            ]
        }
    };

    localHighlightGrammars.c = localHighlightGrammars.cpp;
    localHighlightGrammars.csharp = localHighlightGrammars.cpp;
    localHighlightGrammars.java = localHighlightGrammars.cpp;
    localHighlightGrammars.ksh = {
        ...localHighlightGrammars.bash,
        builtIns: [...localHighlightGrammars.bash.builtIns, "print", "whence"]
    };
    localHighlightGrammars.tcsh = localHighlightGrammars.csh;
    localHighlightGrammars.typescript = localHighlightGrammars.javascript;
    localHighlightGrammars.shell = localHighlightGrammars.bash;
    localHighlightGrammars.zsh = {
        ...localHighlightGrammars.bash,
        keywords: [...localHighlightGrammars.bash.keywords, "always", "end", "foreach", "repeat"],
        builtIns: [
            ...localHighlightGrammars.bash.builtIns,
            "autoload", "bindkey", "compinit", "emulate", "print", "setopt", "unsetopt", "zcompile", "zformat",
            "zle", "zmodload", "zparseopts", "zregexparse", "zstyle"
        ],
        patterns: [
            { pattern: "%[A-Za-z%](?:\\{[^}]+\\})?", className: "hljs-meta" }
        ]
    };

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

        const defaultCommentPatterns = ["\\/\\*[\\s\\S]*?\\*\\/", "\\/\\/[^\\n]*"];
        const defaultStringPatterns = [
            '"(?:\\\\.|[^"\\\\])*"',
            "'(?:\\\\.|[^'\\\\])*'",
            "`(?:\\\\.|[^`\\\\])*`"
        ];
        const tokenDefinitions = [];
        const keywordPattern = makeWordPattern(grammar.keywords);
        const typePattern = makeWordPattern(grammar.types);
        const builtInPattern = makeWordPattern(grammar.builtIns);
        const literalPattern = makeWordPattern(grammar.literals);

        function addTokenPatterns(patterns, className) {
            patterns.forEach((pattern) => {
                tokenDefinitions.push({ pattern, className });
            });
        }

        addTokenPatterns(grammar.commentPatterns || defaultCommentPatterns, "hljs-comment");
        addTokenPatterns(grammar.metaPatterns || [], "hljs-meta");
        addTokenPatterns(grammar.stringPatterns || defaultStringPatterns, "hljs-string");
        tokenDefinitions.push({
            pattern: "\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b",
            className: "hljs-number"
        });
        (grammar.patterns || []).forEach((definition) => tokenDefinitions.push(definition));

        if (literalPattern) {
            tokenDefinitions.push({ pattern: `\\b(?:${literalPattern})\\b`, className: "hljs-literal" });
        }

        if (typePattern) {
            tokenDefinitions.push({ pattern: `\\b(?:${typePattern})\\b`, className: "hljs-type" });
        }

        if (builtInPattern) {
            tokenDefinitions.push({ pattern: `\\b(?:${builtInPattern})\\b`, className: "hljs-built_in" });
        }

        if (keywordPattern) {
            tokenDefinitions.push({ pattern: `\\b(?:${keywordPattern})\\b`, className: "hljs-keyword" });
        }

        const tokenPattern = new RegExp(
            tokenDefinitions.map((definition) => `(${definition.pattern})`).join("|"),
            grammar.caseInsensitive ? "gim" : "gm"
        );
        let html = "";
        let lastIndex = 0;

        for (const match of value.matchAll(tokenPattern)) {
            const offset = match.index;
            const definitionIndex = match.slice(1).findIndex((group) => group !== undefined);
            const definition = tokenDefinitions[definitionIndex];

            html += escapeHtml(value.slice(lastIndex, offset));
            html += wrapHighlightedToken(match[0], definition.className);
            lastIndex = offset + match[0].length;
        }

        html += escapeHtml(value.slice(lastIndex));
        return html;
    }

    function renderCodeBlock(code, languageInfo, index) {
        const language = normalizeCodeLanguage(languageInfo);
        const codeClasses = ["hljs"];
        const languageLabel = formatCodeLanguage(languageInfo);
        const usesLocalHighlighter = language === "plaintext" || Boolean(localHighlightGrammars[language]);
        const highlightedCode = usesLocalHighlighter ? highlightCodeLocally(code, language) : escapeHtml(code);
        const highlightedAttribute = usesLocalHighlighter ? ' data-highlighted="local"' : "";

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
            `<pre><code class="${codeClasses.join(" ")}"${highlightedAttribute}>${highlightedCode}</code></pre>`,
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
                const text = unescapeMarkdown(heading[2].trim());
                const id = slugify(text);
                headings.push({ id, level, text: stripHeadingMarkdown(text) });
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
        if (!bodyElement.querySelector("pre code:not([data-highlighted='local'])")) {
            return;
        }

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
        script.src = "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/highlight.min.js";
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
