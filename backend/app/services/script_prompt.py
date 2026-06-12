from app.models import VideoScript

KLING_MAX_DURATION_V3 = 15
KLING_MIN_DURATION_V3 = 3
KLING_MAX_DURATION_DEFAULT = 10
KLING_MIN_DURATION_DEFAULT = 5


def infer_script_duration_seconds(script: VideoScript) -> int | None:
    decomposed = script.decomposed_script if isinstance(script.decomposed_script, dict) else {}
    segments = decomposed.get("segments")
    if not isinstance(segments, list):
        return None
    max_end = 0.0
    for seg in segments:
        if not isinstance(seg, dict):
            continue
        end = seg.get("endSec", seg.get("end_sec"))
        if isinstance(end, (int, float)) and end > max_end:
            max_end = float(end)
    return int(max_end) if max_end > 0 else None


def max_kling_duration_seconds(*, model_name: str = "kling-v3") -> int:
    if model_name.startswith("kling-v3"):
        return KLING_MAX_DURATION_V3
    return KLING_MAX_DURATION_DEFAULT


def min_kling_duration_seconds(*, model_name: str = "kling-v3") -> int:
    if model_name.startswith("kling-v3"):
        return KLING_MIN_DURATION_V3
    return KLING_MIN_DURATION_DEFAULT


def recommend_kling_duration(
    script: VideoScript,
    *,
    model_name: str = "kling-v3",
) -> int:
    """Map inferred script length to a single Kling clip duration (integer seconds)."""
    inferred = infer_script_duration_seconds(script)
    cap = max_kling_duration_seconds(model_name=model_name)
    floor = min_kling_duration_seconds(model_name=model_name)
    if inferred is None:
        return cap
    if model_name.startswith("kling-v3"):
        return max(floor, min(cap, round(inferred)))
    if inferred <= 5:
        return 5
    return min(cap, 10)


def build_user_prompt_from_script(script: VideoScript, *, target_duration_sec: int = 10) -> str:
    """Compose a persona user prompt from decomposed script fields."""
    decomposed = script.decomposed_script if isinstance(script.decomposed_script, dict) else {}
    parts: list[str] = []

    inferred = infer_script_duration_seconds(script)
    if inferred and inferred > target_duration_sec:
        parts.append(
            f"原参考视频脚本约 {inferred} 秒，但目标成片仅 {target_duration_sec} 秒。"
            "请保留开头钩子、1–2 个核心观点与结尾号召，删去重复与次要细节，口播与画面需能在时长内完整呈现。"
        )

    if script.title:
        parts.append(f"视频主题：{script.title}")
    if script.summary:
        parts.append(f"内容摘要：{script.summary}")
    if decomposed.get("hook"):
        parts.append(f"开头钩子：{decomposed['hook']}")
    if decomposed.get("body"):
        parts.append(f"主体内容：{decomposed['body']}")
    if decomposed.get("cta"):
        parts.append(f"结尾号召：{decomposed['cta']}")
    if decomposed.get("tone"):
        parts.append(f"语气风格：{decomposed['tone']}")
    if decomposed.get("targetAudience"):
        parts.append(f"目标受众：{decomposed['targetAudience']}")

    segments = decomposed.get("segments")
    if isinstance(segments, list) and segments:
        segment_lines: list[str] = []
        for seg in segments:
            if not isinstance(seg, dict):
                continue
            line_parts: list[str] = []
            idx = seg.get("index")
            if idx is not None:
                line_parts.append(f"第{idx}段")
            if seg.get("spokenText"):
                line_parts.append(f"口播：{seg['spokenText']}")
            if seg.get("visualDescription"):
                line_parts.append(f"画面：{seg['visualDescription']}")
            if line_parts:
                segment_lines.append("；".join(line_parts))
        if segment_lines:
            parts.append("分镜脚本：\n" + "\n".join(segment_lines))

    if script.raw_transcript:
        parts.append(f"完整口播参考：{script.raw_transcript}")

    parts.append(f"目标成片时长约 {target_duration_sec} 秒，请按以上结构拍摄，口播自然、画面与描述一致。")
    return "\n\n".join(p for p in parts if p)


def estimate_generation_minutes(
    *,
    duration: int = 5,
    resolution: str = "720p",
    sound: bool = True,
) -> tuple[int, int]:
    """Return (min_minutes, max_minutes) for user-facing ETA."""
    low = 3 if duration <= 5 else 5 if duration <= 10 else 6
    high = 6 if duration <= 5 else 10 if duration <= 10 else 12
    if resolution in {"1080p", "4K"}:
        low += 2
        high += 4
    if sound:
        low += 1
        high += 2
    return low, high
