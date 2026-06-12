"""Burn bottom barrage captions (spoken text) onto segment videos."""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

class VideoBarrageError(Exception):
    pass


LINE_HEIGHT_RATIO = 1.36
MAX_ZONE_HEIGHT_RATIO = 0.28
MIN_PAGE_SEC = 0.9

_FONT_CANDIDATES: tuple[tuple[str, str], ...] = (
    ("/System/Library/Fonts/PingFang.ttc", "PingFang SC"),
    ("/System/Library/Fonts/STHeiti Light.ttc", "Heiti SC"),
    ("/Library/Fonts/Arial Unicode.ttf", "Arial Unicode MS"),
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "Noto Sans CJK SC"),
    ("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc", "Noto Sans CJK SC"),
    ("/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc", "Noto Sans CJK SC"),
)


@dataclass(frozen=True)
class BarrageLayout:
    width: int
    height: int
    is_portrait: bool
    bottom_margin: int
    horizontal_margin: int
    zone_height: int
    max_font_size: int
    min_font_size: int
    max_cols: int


@dataclass(frozen=True)
class CaptionPage:
    text: str
    font_size: int
    lines: tuple[str, ...]


def _resolve_font() -> tuple[str, str]:
    for path, name in _FONT_CANDIDATES:
        if Path(path).exists():
            return path, name
    raise VideoBarrageError("未找到支持中文的字体，无法生成底部弹幕")


def _escape_ass(text: str) -> str:
    return text.replace("\\", r"\\").replace("{", r"\{").replace("}", r"\}")


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def _compute_layout(width: int, height: int) -> BarrageLayout:
    """Derive readable barrage metrics from actual video canvas size."""
    is_portrait = height > width
    if is_portrait:
        ref_w, ref_h = 720, 1280
        ref_max_font, ref_min_font = 48, 30
        max_font_cap = 68
    else:
        ref_w, ref_h = 1280, 720
        ref_max_font, ref_min_font = 44, 28
        max_font_cap = 60

    w_scale = width / ref_w
    h_scale = height / ref_h

    max_font = min(max_font_cap, max(ref_min_font + 6, round(ref_max_font * w_scale)))
    min_font = max(24, round(ref_min_font * w_scale))
    if min_font >= max_font:
        min_font = max(24, max_font - 6)

    bottom_margin = max(56, round(80 * h_scale))
    horizontal_margin = max(28, round(width * 0.055))
    usable_width = max(120, width - horizontal_margin * 2)

    # Fewer chars per line when glyphs are larger — tied to canvas width.
    char_width = max_font * 0.9
    max_cols = max(7, int(usable_width / char_width))

    zone_by_ratio = int(height * MAX_ZONE_HEIGHT_RATIO)
    zone_by_font = int(max_font * LINE_HEIGHT_RATIO * 3)
    zone_by_remain = height - bottom_margin - 12
    zone_height = max(zone_by_font, min(zone_by_ratio, zone_by_remain))

    return BarrageLayout(
        width=width,
        height=height,
        is_portrait=is_portrait,
        bottom_margin=bottom_margin,
        horizontal_margin=horizontal_margin,
        zone_height=zone_height,
        max_font_size=max_font,
        min_font_size=min_font,
        max_cols=max_cols,
    )


def _max_lines_for_font(font_size: int, zone_height: int) -> int:
    line_h = max(1, int(font_size * LINE_HEIGHT_RATIO))
    return max(1, zone_height // line_h)


def _wrap_lines(text: str, *, max_cols: int) -> list[str]:
    cleaned = _normalize_text(text)
    if not cleaned:
        return []
    if len(cleaned) <= max_cols:
        return [cleaned]

    lines: list[str] = []
    current = ""
    tokens = re.findall(r"[A-Za-z0-9]+|[^\sA-Za-z0-9]", cleaned)
    for token in tokens:
        if re.fullmatch(r"[A-Za-z0-9]+", token):
            chunk = f"{current} {token}".strip() if current else token
            if len(chunk) <= max_cols:
                current = chunk
                continue
            if current:
                lines.append(current)
            while len(token) > max_cols:
                lines.append(token[:max_cols])
                token = token[max_cols:]
            current = token
            continue

        candidate = f"{current}{token}"
        if len(candidate) <= max_cols:
            current = candidate
            continue
        if current:
            lines.append(current)
        while len(token) > max_cols:
            lines.append(token[:max_cols])
            token = token[max_cols:]
        current = token

    if current:
        lines.append(current)
    return lines or [cleaned]


def _cols_for_font(layout: BarrageLayout, font_size: int) -> int:
    usable_width = max(120, layout.width - layout.horizontal_margin * 2)
    return max(7, int(usable_width / (font_size * 0.9)))


def _fit_page(text: str, *, layout: BarrageLayout) -> CaptionPage | None:
    cleaned = _normalize_text(text)
    if not cleaned:
        return None
    for font_size in range(layout.max_font_size, layout.min_font_size - 1, -2):
        max_cols = _cols_for_font(layout, font_size)
        lines = _wrap_lines(cleaned, max_cols=max_cols)
        if len(lines) <= _max_lines_for_font(font_size, layout.zone_height):
            return CaptionPage(text=cleaned, font_size=font_size, lines=tuple(lines))
    font_size = layout.min_font_size
    max_cols = _cols_for_font(layout, font_size)
    lines = _wrap_lines(cleaned, max_cols=max_cols)
    max_lines = _max_lines_for_font(font_size, layout.zone_height)
    if len(lines) <= max_lines:
        return CaptionPage(text=cleaned, font_size=font_size, lines=tuple(lines))
    return None


def _split_phrases(text: str) -> list[str]:
    cleaned = _normalize_text(text)
    if not cleaned:
        return []
    parts = re.split(r"(?<=[，。！？；、：,.!?;])\s*", cleaned)
    phrases = [part.strip() for part in parts if part.strip()]
    return phrases or [cleaned]


def _hard_split_page(text: str, *, layout: BarrageLayout) -> list[CaptionPage]:
    remaining = _normalize_text(text)
    pages: list[CaptionPage] = []
    while remaining:
        best_fit: CaptionPage | None = None
        best_len = 0
        for size in range(1, len(remaining) + 1):
            candidate = remaining[:size]
            page = _fit_page(candidate, layout=layout)
            if page:
                best_fit = page
                best_len = size
            else:
                break
        if not best_fit:
            page = _fit_page(remaining[0], layout=layout)
            if not page:
                raise VideoBarrageError("口播字幕过长，无法排版")
            pages.append(page)
            remaining = remaining[1:].lstrip()
            continue
        pages.append(best_fit)
        remaining = remaining[best_len:].lstrip()
    return pages


def _split_into_pages(text: str, *, layout: BarrageLayout) -> list[CaptionPage]:
    phrases = _split_phrases(text)
    pages: list[CaptionPage] = []
    buffer = ""

    for phrase in phrases:
        candidate = f"{buffer}{phrase}" if buffer else phrase
        page = _fit_page(candidate, layout=layout)
        if page:
            buffer = candidate
            continue
        if buffer:
            fitted = _fit_page(buffer, layout=layout)
            if fitted:
                pages.append(fitted)
            else:
                pages.extend(_hard_split_page(buffer, layout=layout))
            buffer = phrase
        else:
            pages.extend(_hard_split_page(phrase, layout=layout))

    if buffer:
        fitted = _fit_page(buffer, layout=layout)
        if fitted:
            pages.append(fitted)
        else:
            pages.extend(_hard_split_page(buffer, layout=layout))

    return pages


def _page_durations(pages: list[CaptionPage], total_duration: float) -> list[float]:
    if not pages:
        return []
    if len(pages) == 1:
        return [total_duration]

    weights = [max(len(page.text), 1) for page in pages]
    total_weight = sum(weights)
    raw = [total_duration * weight / total_weight for weight in weights]

    min_total = MIN_PAGE_SEC * len(pages)
    if min_total <= total_duration:
        boosted = [max(MIN_PAGE_SEC, duration) for duration in raw]
        boost_sum = sum(boosted)
        if boost_sum > total_duration:
            scale = total_duration / boost_sum
            return [duration * scale for duration in boosted]
        deficit = total_duration - sum(boosted)
        if deficit > 0:
            boosted[-1] += deficit
        return boosted

    return raw


def _probe_video_size(path: Path) -> tuple[int, int, float]:
    size_result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0:s=x",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    if size_result.returncode != 0:
        raise VideoBarrageError(size_result.stderr.strip() or "无法读取视频宽高")
    size_line = (size_result.stdout or "").strip().splitlines()[0]
    size_parts = size_line.split("x")
    if len(size_parts) < 2:
        raise VideoBarrageError("无法解析视频宽高")
    width, height = int(size_parts[0]), int(size_parts[1])

    duration_result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    if duration_result.returncode != 0:
        raise VideoBarrageError(duration_result.stderr.strip() or "无法读取视频时长")
    duration = float((duration_result.stdout or "5").strip() or "5")
    return width, height, max(duration, 0.5)


def _format_ass_timestamp(seconds: float) -> str:
    total_cs = int(round(max(seconds, 0) * 100))
    cs = total_cs % 100
    total_s = total_cs // 100
    s = total_s % 60
    total_m = total_s // 60
    m = total_m % 60
    h = total_m // 60
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _page_to_ass_text(page: CaptionPage) -> str:
    body = r"\N".join(_escape_ass(line) for line in page.lines)
    border = max(2, round(page.font_size * 0.07))
    shadow = max(1, round(page.font_size * 0.04))
    return f"{{\\fs{page.font_size}\\bord{border}\\shad{shadow}}}{body}"


def build_ass_caption(text: str, *, duration_sec: float, width: int, height: int, font_name: str) -> str:
    layout = _compute_layout(width, height)
    pages = _split_into_pages(text, layout=layout)
    if not pages:
        return ""

    durations = _page_durations(pages, duration_sec)
    events: list[str] = []
    cursor = 0.0
    for page, page_duration in zip(pages, durations):
        start = _format_ass_timestamp(cursor)
        end = _format_ass_timestamp(min(duration_sec, cursor + page_duration))
        events.append(f"Dialogue: 0,{start},{end},Barrage,,0,0,0,,{_page_to_ass_text(page)}")
        cursor += page_duration

    style_border = max(2, round(layout.max_font_size * 0.07))
    return f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Barrage,{font_name},{layout.max_font_size},&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,3,{style_border},1,2,{layout.horizontal_margin},{layout.horizontal_margin},{layout.bottom_margin},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
{chr(10).join(events)}
"""


def burn_bottom_barrage(input_path: Path, output_path: Path, *, caption: str) -> None:
    caption = caption.strip()
    if not caption:
        output_path.write_bytes(input_path.read_bytes())
        return

    font_path, font_name = _resolve_font()
    width, height, duration = _probe_video_size(input_path)
    ass_content = build_ass_caption(
        caption,
        duration_sec=duration,
        width=width,
        height=height,
        font_name=font_name,
    )
    if not ass_content:
        output_path.write_bytes(input_path.read_bytes())
        return

    ass_path = input_path.with_suffix(".ass")
    ass_path.write_text(ass_content, encoding="utf-8")
    fonts_dir = str(Path(font_path).parent)
    vf = f"subtitles={ass_path.name}:fontsdir={fonts_dir}"

    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            input_path.name,
            "-vf",
            vf,
            "-c:a",
            "copy",
            output_path.name,
        ],
        cwd=input_path.parent,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise VideoBarrageError(result.stderr.strip() or "底部弹幕烧录失败")
