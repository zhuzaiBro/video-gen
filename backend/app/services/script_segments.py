from dataclasses import dataclass
import re
import time

from app.models import VideoScript
from app.services.artboard_script import (
    describe_artboard_layout_for_generation,
    get_raw_decomposed_segment,
    strip_overlay_clauses_from_visual,
    suggest_artboard_layers_from_segment,
)
from app.services.visual_props import (
    describe_screen_props_for_generation,
    extract_screen_props,
    sanitize_visual_for_generation,
)
from app.services.script_prompt import max_kling_duration_seconds, min_kling_duration_seconds
from app.services.persona_scene import split_visual_action_and_scene


@dataclass(frozen=True)
class ScriptSegment:
    index: int
    start_sec: float
    end_sec: float
    spoken_text: str
    visual_description: str
    purpose: str
    kling_duration_sec: int


def _natural_duration(start: float, end: float) -> float:
    if end > start:
        return max(1.0, end - start)
    return 5.0


def map_to_kling_duration(seconds: float, *, model_name: str = "kling-v3") -> int:
    """Map natural segment length to an integer Kling duration (v3: 3–15s, legacy: 5/10s)."""
    max_kling = max_kling_duration_seconds(model_name=model_name)
    min_kling = min_kling_duration_seconds(model_name=model_name)
    if model_name.startswith("kling-v3"):
        rounded = max(1, round(seconds))
        return max(min_kling, min(max_kling, rounded))
    if seconds <= 5:
        return 5
    return min(max_kling, 10)


def clamp_kling_duration(duration: int, *, model_name: str = "kling-v3") -> int:
    max_kling = max_kling_duration_seconds(model_name=model_name)
    min_kling = min_kling_duration_seconds(model_name=model_name)
    if model_name.startswith("kling-v3"):
        return max(min_kling, min(max_kling, int(round(duration))))
    if duration <= 5:
        return 5
    if duration <= 10:
        return 10
    return min(max_kling, 10)


def get_excluded_segment_indexes(script: VideoScript) -> set[int]:
    meta = script.extra_metadata if isinstance(script.extra_metadata, dict) else {}
    raw = meta.get("excludedSegments")
    if not isinstance(raw, list):
        return set()
    excluded: set[int] = set()
    for item in raw:
        try:
            excluded.add(int(item))
        except (TypeError, ValueError):
            continue
    return excluded


ARTBOARD_LAYER_TYPES = frozenset({"sticker", "image", "slice", "text"})
MAX_ARTBOARD_LAYERS = 24


def _clamp_percent(value: object, *, default: float, min_val: float = 0.0, max_val: float = 100.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    return max(min_val, min(max_val, parsed))


def normalize_artboard_layer(raw: object) -> dict | None:
    if not isinstance(raw, dict):
        return None
    layer_type = raw.get("type")
    if layer_type not in ARTBOARD_LAYER_TYPES:
        return None
    layer_id = raw.get("id")
    if not isinstance(layer_id, str) or not layer_id.strip():
        return None
    content = raw.get("content")
    if not isinstance(content, str) or not content.strip():
        return None
    if layer_type == "image" and not content.startswith(("http://", "https://")):
        return None

    layer: dict = {
        "id": layer_id.strip()[:64],
        "type": layer_type,
        "content": content.strip()[:500],
        "x": _clamp_percent(raw.get("x"), default=50.0),
        "y": _clamp_percent(raw.get("y"), default=50.0),
        "w": _clamp_percent(raw.get("w"), default=15.0, min_val=4.0, max_val=80.0),
    }
    if raw.get("h") is not None:
        layer["h"] = _clamp_percent(raw.get("h"), default=10.0, min_val=4.0, max_val=80.0)
    rotation = raw.get("rotation")
    if rotation is not None:
        try:
            layer["rotation"] = float(rotation) % 360
        except (TypeError, ValueError):
            pass
    color = raw.get("color")
    if isinstance(color, str) and color.strip():
        layer["color"] = color.strip()[:32]
    z_index = raw.get("zIndex", raw.get("z_index"))
    if z_index is not None:
        try:
            layer["zIndex"] = int(z_index)
        except (TypeError, ValueError):
            pass
    return layer


def normalize_artboard_layers(raw: object) -> list[dict]:
    if not isinstance(raw, list):
        return []
    layers: list[dict] = []
    for item in raw[:MAX_ARTBOARD_LAYERS]:
        layer = normalize_artboard_layer(item)
        if layer:
            layers.append(layer)
    return layers


def get_segment_artboard_layers_map(script: VideoScript) -> dict[int, list[dict]]:
    meta = script.extra_metadata if isinstance(script.extra_metadata, dict) else {}
    raw = meta.get("segmentArtboardLayers")
    if not isinstance(raw, dict):
        return {}
    result: dict[int, list[dict]] = {}
    for key, value in raw.items():
        try:
            index = int(key)
        except (TypeError, ValueError):
            continue
        layers = normalize_artboard_layers(value)
        if layers:
            result[index] = layers
    return result


def get_segment_artboard_layers(script: VideoScript, segment_index: int) -> list[dict]:
    return get_segment_artboard_layers_map(script).get(segment_index, [])


def segment_artboard_enabled(script: VideoScript, segment_index: int) -> bool:
    return bool(get_segment_artboard_layers(script, segment_index))


ARTBOARD_GENERATION_CONSTRAINT = (
    "【画板已启用】贴图/标签/文字由画板按脚本布局后期叠加。"
    "生成视频时禁止自行绘制贴纸、花字、角标或浮层 UI，仅输出干净主画面并保留画板标注区域的留白。"
)


def suggest_segment_artboard_layers(script: VideoScript, segment_index: int) -> list[dict]:
    raw = get_raw_decomposed_segment(script, segment_index)
    if not raw:
        return []
    return suggest_artboard_layers_from_segment(raw)


def append_artboard_generation_constraints(
    prompt: str,
    script: VideoScript,
    segment_index: int,
) -> str:
    if not segment_artboard_enabled(script, segment_index):
        return prompt
    if ARTBOARD_GENERATION_CONSTRAINT in prompt:
        return prompt
    return f"{prompt}\n\n{ARTBOARD_GENERATION_CONSTRAINT}"


def get_segment_aspect_overrides(script: VideoScript) -> dict[int, str]:
    meta = script.extra_metadata if isinstance(script.extra_metadata, dict) else {}
    raw = meta.get("segmentAspectOverrides")
    if not isinstance(raw, dict):
        return {}
    overrides: dict[int, str] = {}
    for key, value in raw.items():
        if value not in {"16:9", "9:16"}:
            continue
        try:
            overrides[int(key)] = value
        except (TypeError, ValueError):
            continue
    return overrides


def resolve_segment_aspect_ratio(
    script: VideoScript,
    segment_index: int,
    *,
    override: str | None = None,
) -> str | None:
    if override in {"16:9", "9:16"}:
        return override
    overrides = get_segment_aspect_overrides(script)
    return overrides.get(segment_index)


def get_segment_duration_overrides(script: VideoScript) -> dict[int, int]:
    meta = script.extra_metadata if isinstance(script.extra_metadata, dict) else {}
    raw = meta.get("segmentDurationOverrides")
    if not isinstance(raw, dict):
        return {}
    overrides: dict[int, int] = {}
    for key, value in raw.items():
        try:
            overrides[int(key)] = int(value)
        except (TypeError, ValueError):
            continue
    return overrides


def resolve_segment_duration_sec(
    script: VideoScript,
    segment: ScriptSegment,
    *,
    override: int | None = None,
    model_name: str = "kling-v3",
) -> int:
    if override is not None:
        return clamp_kling_duration(override, model_name=model_name)
    overrides = get_segment_duration_overrides(script)
    if segment.index in overrides:
        return clamp_kling_duration(overrides[segment.index], model_name=model_name)
    return segment.kling_duration_sec


def parse_script_segments(script: VideoScript, *, model_name: str = "kling-v3") -> list[ScriptSegment]:
    decomposed = script.decomposed_script if isinstance(script.decomposed_script, dict) else {}
    raw_segments = decomposed.get("segments")
    if not isinstance(raw_segments, list) or not raw_segments:
        return []

    excluded = get_excluded_segment_indexes(script)
    overrides = get_segment_duration_overrides(script)
    parsed: list[ScriptSegment] = []
    for idx, raw in enumerate(raw_segments, start=1):
        if not isinstance(raw, dict):
            continue
        seg_index = int(raw.get("index", idx))
        if seg_index in excluded:
            continue
        start = float(raw.get("startSec", raw.get("start_sec", 0)) or 0)
        end = float(raw.get("endSec", raw.get("end_sec", start + 5)) or (start + 5))
        natural = _natural_duration(start, end)
        default_duration = map_to_kling_duration(natural, model_name=model_name)
        duration = overrides.get(seg_index, default_duration)
        parsed.append(
            ScriptSegment(
                index=seg_index,
                start_sec=start,
                end_sec=end,
                spoken_text=str(raw.get("spokenText") or raw.get("spoken_text") or "").strip(),
                visual_description=str(raw.get("visualDescription") or raw.get("visual_description") or "").strip(),
                purpose=str(raw.get("purpose") or "").strip(),
                kling_duration_sec=clamp_kling_duration(duration, model_name=model_name),
            )
        )
    parsed.sort(key=lambda s: s.index)
    return parsed


_PRESENTER_GENDER_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"女性(?:主播|博主|讲解者|出镜者)?"), "出镜者"),
    (re.compile(r"男性(?:主播|博主|讲解者|出镜者)?"), "出镜者"),
    (re.compile(r"女主播|男主播|女博主|男博主"), "出镜者"),
    (re.compile(r"女生|男生|女孩|男孩|女子|男子|女人|男人"), "出镜者"),
    (re.compile(r"\b(?:female|male)\s+(?:presenter|host|speaker|narrator)\b", re.I), "presenter"),
    (re.compile(r"\b(?:woman|women|girl|man|men|boy)\b", re.I), "presenter"),
)


def adapt_visual_for_persona(
    visual_description: str,
    *,
    persona_name: str,
    persona_description: str | None = None,
) -> str:
    """Strip original-video presenter gender/appearance; anchor scene to the selected persona."""
    text = visual_description.strip()
    if not text:
        return f"{persona_name} 出镜，口播自然"
    for pattern, replacement in _PRESENTER_GENDER_PATTERNS:
        text = pattern.sub(replacement, text)
    text = re.sub(r"出镜者", persona_name, text)
    desc_hint = (persona_description or "").strip()
    if desc_hint:
        prefix = f"{persona_name}（{desc_hint}）"
        if text.startswith(persona_name):
            rest = text[len(persona_name) :].lstrip("，。、 ")
            return f"{prefix}{rest}" if rest else f"{prefix}出镜，口播自然"
        return f"{prefix}{text}"
    if not text.startswith(persona_name):
        return f"{persona_name}{text}"
    return text


def build_segment_prompt(
    script: VideoScript,
    segment: ScriptSegment,
    *,
    persona_name: str | None = None,
    persona_description: str | None = None,
) -> str:
    parts: list[str] = []
    if script.title:
        parts.append(f"视频主题：{script.title}")
    if script.summary:
        parts.append(f"整体背景：{script.summary}")
    parts.append(f"当前分镜：第 {segment.index} 段（目标成片 {segment.kling_duration_sec} 秒）")
    if segment.spoken_text:
        parts.append(f"口播：{segment.spoken_text}")
    artboard_on = segment_artboard_enabled(script, segment.index)
    layers = get_segment_artboard_layers(script, segment.index) if artboard_on else []
    screen_props: list[str] = []
    if segment.visual_description:
        visual = segment.visual_description
        visual, screen_props = sanitize_visual_for_generation(visual)
        if artboard_on:
            visual = strip_overlay_clauses_from_visual(visual)
        if persona_name:
            action, scene = split_visual_action_and_scene(visual)
            if artboard_on and action:
                action = strip_overlay_clauses_from_visual(action)
            if scene:
                action_line = adapt_visual_for_persona(
                    action or "出镜，口播自然",
                    persona_name=persona_name,
                    persona_description=persona_description,
                )
                parts.append(f"人物动作：{action_line}")
                parts.append(
                    f"场景背景：{scene}（首帧由系统图像处理并经模型质检后锁定，勿使用人设照片原背景）"
                )
            else:
                adapted = adapt_visual_for_persona(
                    visual,
                    persona_name=persona_name,
                    persona_description=persona_description,
                )
                parts.append(f"画面（主场景 · 人设 {persona_name}）：{adapted}")
        elif artboard_on:
            parts.append(f"画面（主场景）：{visual}")
        else:
            parts.append(f"画面：{visual}")
    if segment.purpose:
        parts.append(f"结构作用：{segment.purpose}")
    if not screen_props and segment.visual_description:
        screen_props = extract_screen_props(segment.visual_description)
    prop_hint = describe_screen_props_for_generation(screen_props)
    if prop_hint:
        parts.append(prop_hint)
        if not artboard_on:
            parts.append(
                "【操作建议】请在分镜画板中「从脚本导入」并上传对应截图贴图，再生成视频。"
            )
    if artboard_on:
        layout_hint = describe_artboard_layout_for_generation(layers)
        if layout_hint:
            parts.append(layout_hint)
        parts.append(ARTBOARD_GENERATION_CONSTRAINT)
    if persona_name:
        parts.append(
            f"【人设约束】出镜人物以人设抠图/参考图为准；场景背景以脚本描述与模型质检后的首帧为准，"
            f"勿沿用原参考视频或人设照片里的背景环境。"
        )
    parts.append("请在本分镜时长内完整呈现以上内容，口播自然、镜头连贯。")
    return "\n".join(parts)


def get_segment_tasks(script: VideoScript) -> dict[str, dict]:
    meta = script.extra_metadata if isinstance(script.extra_metadata, dict) else {}
    tasks = meta.get("segmentTasks")
    return dict(tasks) if isinstance(tasks, dict) else {}


def get_prepared_frames(script: VideoScript) -> dict[str, dict]:
    meta = script.extra_metadata if isinstance(script.extra_metadata, dict) else {}
    frames = meta.get("preparedFrames")
    return dict(frames) if isinstance(frames, dict) else {}


def get_prepared_frame(script: VideoScript, segment_index: int) -> dict | None:
    info = get_prepared_frames(script).get(str(segment_index))
    return info if isinstance(info, dict) else None


def merge_prepared_frame(
    script: VideoScript,
    segment_index: int,
    *,
    key: str,
    public_url: str,
    persona_id: int,
    review: dict,
    action: str = "",
    scene: str = "",
) -> dict:
    meta = dict(script.extra_metadata or {})
    frames = dict(get_prepared_frames(script))
    frames[str(segment_index)] = {
        "key": key,
        "publicUrl": public_url,
        "personaId": persona_id,
        "review": review,
        "action": action,
        "scene": scene,
        "preparedAt": time.time(),
    }
    meta["preparedFrames"] = frames
    return meta


def get_segment_first_frame_configs(script: VideoScript) -> dict[str, dict]:
    meta = script.extra_metadata if isinstance(script.extra_metadata, dict) else {}
    raw = meta.get("segmentFirstFrame")
    return dict(raw) if isinstance(raw, dict) else {}


def normalize_persona_image_indexes(info: dict, *, max_count: int = 4) -> list[int]:
    raw = info.get("personaImageIndexes")
    if isinstance(raw, list) and raw:
        indexes: list[int] = []
        seen: set[int] = set()
        for item in raw:
            try:
                idx = int(item)
            except (TypeError, ValueError):
                continue
            if idx < 0 or idx in seen:
                continue
            seen.add(idx)
            indexes.append(idx)
        if indexes:
            return indexes[:max_count]
    try:
        single = int(info.get("personaImageIndex", 0))
    except (TypeError, ValueError):
        single = 0
    return [max(0, single)]


def get_segment_first_frame_config(script: VideoScript, segment_index: int) -> dict:
    info = get_segment_first_frame_configs(script).get(str(segment_index))
    if not isinstance(info, dict):
        return {
            "mode": "prepared",
            "personaImageIndex": 0,
            "personaImageIndexes": [0],
            "personaImageRotations": {},
        }
    mode = info.get("mode")
    if mode not in {"persona", "prepared"}:
        mode = "prepared"
    indexes = normalize_persona_image_indexes(info)
    raw_rotations = info.get("personaImageRotations")
    rotations = dict(raw_rotations) if isinstance(raw_rotations, dict) else {}
    return {
        "mode": mode,
        "personaImageIndex": indexes[0],
        "personaImageIndexes": indexes,
        "personaImageRotations": rotations,
    }


def resolve_persona_reference_images(
    reference_images: list,
    ff_config: dict,
    *,
    max_count: int = 4,
) -> list:
    if not reference_images:
        return []
    indexes = normalize_persona_image_indexes(ff_config, max_count=max_count)
    selected: list = []
    for idx in indexes:
        if 0 <= idx < len(reference_images):
            selected.append(reference_images[idx])
    if selected:
        return selected[:max_count]
    fallback = min(max(0, int(ff_config.get("personaImageIndex", 0))), len(reference_images) - 1)
    return [reference_images[fallback]]


def merge_segment_first_frame_config(
    script: VideoScript,
    segment_index: int,
    *,
    mode: str | None = None,
    persona_image_index: int | None = None,
    persona_image_indexes: list[int] | None = None,
) -> dict:
    meta = dict(script.extra_metadata or {})
    configs = dict(get_segment_first_frame_configs(script))
    current = dict(get_segment_first_frame_config(script, segment_index))
    if mode in {"persona", "prepared"}:
        current["mode"] = mode
    if persona_image_indexes is not None:
        cleaned = [max(0, int(i)) for i in persona_image_indexes if isinstance(i, int) or str(i).isdigit()]
        current["personaImageIndexes"] = cleaned[:4] if cleaned else [0]
        current["personaImageIndex"] = current["personaImageIndexes"][0]
    elif persona_image_index is not None:
        idx = max(0, persona_image_index)
        current["personaImageIndex"] = idx
        current["personaImageIndexes"] = [idx]
    configs[str(segment_index)] = current
    meta["segmentFirstFrame"] = configs
    return meta


def get_assembled_video(script: VideoScript) -> dict | None:
    meta = script.extra_metadata if isinstance(script.extra_metadata, dict) else {}
    assembled = meta.get("assembled")
    return assembled if isinstance(assembled, dict) else None


def get_assembly_order(script: VideoScript) -> list[int] | None:
    meta = script.extra_metadata if isinstance(script.extra_metadata, dict) else {}
    order = meta.get("assemblyOrder")
    if not isinstance(order, list):
        return None
    parsed: list[int] = []
    for item in order:
        try:
            parsed.append(int(item))
        except (TypeError, ValueError):
            continue
    return parsed or None


def resolve_segment_order(
    script: VideoScript,
    *,
    model_name: str = "kling-v3",
    override: list[int] | None = None,
) -> list[int]:
    segments = parse_script_segments(script, model_name=model_name)
    default = [seg.index for seg in segments]
    if not default:
        return []

    known = {seg.index for seg in segments}

    # 显式传入顺序（如整合选中）：只合并指定分镜，不补全其余段
    if override is not None:
        return [idx for idx in override if idx in known]

    order = get_assembly_order(script) or default
    filtered = [idx for idx in order if idx in known]
    for idx in default:
        if idx not in filtered:
            filtered.append(idx)
    return filtered


def previous_segment_in_order(
    script: VideoScript,
    segment_index: int,
    *,
    model_name: str = "kling-v3",
    order_override: list[int] | None = None,
) -> int | None:
    order = resolve_segment_order(script, model_name=model_name, override=order_override)
    try:
        pos = order.index(segment_index)
    except ValueError:
        return None
    if pos <= 0:
        return None
    return order[pos - 1]
