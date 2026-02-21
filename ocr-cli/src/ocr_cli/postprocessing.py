"""Post-processing for LLM OCR output.

Normalises LaTeX math delimiters so that all output uses dollar-sign notation
regardless of which variant the model chose to emit, and ensures multi-line
display math blocks render correctly in KaTeX / MathJax.

Conversion table
----------------
``\\( ... \\)``  →  ``$ ... $``     (inline math)
``\\[ ... \\]``  →  ``$$ ... $$``  (display / block math — kept on its own line)

Consecutive single-line block merging
--------------------------------------
Some models output each line of a multi-step calculation as its own
``$$expr$$`` block on consecutive lines.  These are merged into a single
``$$\\n...\\n$$`` block before the line-break step runs.

A blank line between two ``$$...$$`` blocks is treated as intentional
separation and prevents merging.

Line-break normalisation
------------------------
Within ``$$ ... $$`` blocks that span multiple lines, each line must end with
``\\`` for KaTeX/MathJax to render them as separate lines.  This step strips
trailing whitespace from every content line and appends `` \\`` to all but the
last non-empty line.
"""

import re


# ── Helpers ────────────────────────────────────────────────────────────────────

# Matches a complete single-line display block: $$<content>$$
# (content is non-empty and the $$ must be at the very start and end of the line)
_SINGLE_LINE_DISPLAY = re.compile(r"^\$\$(.+)\$\$$")


def _merge_consecutive_display_blocks(text: str) -> str:
    """Merge adjacent single-line ``$$...$$`` blocks into one multi-line block.

    Lines that are separated by a blank line are treated as distinct blocks and
    are never merged.  The resulting merged block is in ``$$\\n...\\n$$`` form,
    ready for the line-break step to add ``\\`` terminators.
    """
    lines = text.split("\n")
    result: list[str] = []
    i = 0
    while i < len(lines):
        m = _SINGLE_LINE_DISPLAY.match(lines[i])
        if m:
            # Collect the run of consecutive single-line $$ blocks.
            run = [m.group(1).strip()]
            j = i + 1
            while j < len(lines):
                m2 = _SINGLE_LINE_DISPLAY.match(lines[j])
                if m2:
                    run.append(m2.group(1).strip())
                    j += 1
                else:
                    break
            if len(run) == 1:
                result.append(lines[i])  # lone block — leave untouched
            else:
                result.append("$$")
                result.extend(run)
                result.append("$$")
            i = j
        else:
            result.append(lines[i])
            i += 1
    return "\n".join(result)


def _add_display_linebreaks(match: re.Match) -> str:
    """Callback for re.sub: add ``\\`` line terminators to a multi-line $$ block."""
    inner = match.group(1)
    lines = [line.rstrip() for line in inner.split("\n")]
    non_empty = [i for i, line in enumerate(lines) if line]
    if len(non_empty) <= 1:
        # Single-content-line block — nothing to do.
        return match.group(0)
    last_ne = non_empty[-1]
    result = []
    for i, line in enumerate(lines):
        if line and i < last_ne and not line.endswith(r"\\"):
            result.append(line + r" \\")
        else:
            result.append(line)
    return "$$\n" + "\n".join(result) + "\n$$"


# ── Public API ─────────────────────────────────────────────────────────────────


def normalize_latex_delimiters(text: str) -> str:
    """Run the full LaTeX delimiter normalisation pipeline.

    1. ``\\( ... \\)`` → ``$ ... $``    (inline math)
    2. ``\\[ ... \\]`` → ``$$ ... $$``  (display math)
    3. Consecutive single-line ``$$...$$`` blocks → single ``$$\\n...\\n$$``
    4. Multi-line ``$$ ... $$`` blocks — append ``\\`` to every non-last line
       so KaTeX/MathJax renders them with visible line breaks.

    Whitespace immediately inside the delimiters is preserved so that spacing
    such as ``\\( x \\)`` becomes ``$ x $`` rather than ``$x$``.
    """
    # Display math: \[ ... \] → $$ ... $$
    text = re.sub(r"\\\[(.*?)\\\]", r"$$\1$$", text, flags=re.DOTALL)

    # Inline math: \( ... \) → $ ... $
    text = re.sub(r"\\\((.*?)\\\)", r"$\1$", text, flags=re.DOTALL)

    # Merge runs of consecutive single-line $$ blocks
    text = _merge_consecutive_display_blocks(text)

    # Add \\ line terminators to multi-line $$ blocks
    text = re.sub(r"\$\$\n([\s\S]*?)\n\$\$", _add_display_linebreaks, text)

    return text
