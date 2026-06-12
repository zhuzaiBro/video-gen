import base64
import json
import re
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import settings

DASHSCOPE_DEFAULT_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1"
DASHSCOPE_NATIVE_DEFAULT_BASE = "https://dashscope.aliyuncs.com"
MAX_VIDEO_BYTES = 20 * 1024 * 1024
USER_AGENT = "Mozilla/5.0 (compatible; VideoGenScriptBot/1.0)"

SCRIPT_PROMPT = """你是一位短视频脚本分析师。请仔细观看视频，拆解其脚本结构。

请严格输出 JSON（不要 markdown 代码块），字段如下：
{
  "title": "视频标题或推断标题",
  "summary": "50字以内内容摘要",
  "transcript": "完整口播/字幕文本，按时间顺序",
  "hook": "开头钩子（前3秒抓注意力的话术）",
  "body": "主体内容要点（可多段，用换行分隔）",
  "cta": "结尾行动号召/转化话术",
  "tone": "语气风格，如亲切、专业、搞笑",
  "targetAudience": "目标受众",
  "tags": ["标签1", "标签2"],
  "segments": [
    {
      "index": 1,
      "startSec": 0,
      "endSec": 3.2,
      "spokenText": "该段口播",
      "visualDescription": "画面主体描述（场景/动作/镜头；勿写原视频讲解者性别外貌，用「出镜者」）",
      "overlays": [
        {
          "type": "slice|sticker|text|image",
          "content": "热卖 或 【需上传】某游戏UI截图",
          "position": "top-right|top-left|bottom-center|lower-third|center 等",
          "color": "可选，如 #ff4757",
          "notes": "贴图说明；具体游戏/App/商标截图必须用 type=image 并注明需用户上传，不可写进 visualDescription 让模型凭空生成"
        }
      ],
      "purpose": "hook|body|cta|transition"
    }
  ]
}

分镜 startSec/endSec 请按视频实际时间轴填写（可含小数，精确到 0.1 秒）；各段时长不必凑整到 5 的倍数。
visualDescription 只写主画面动作、场景与镜头，不要写原视频讲解者的性别或外貌（如女性/男性），用「出镜者」或动作描述代替；实际出镜人物由用户后续选择的人设决定。
若某字段无法判断，用空字符串或空数组。若某分镜无贴图/角标/花字，overlays 用空数组。
**重要**：visualDescription 只写可拍摄的主画面动作与场景（如「举手机朝向镜头、右手点屏幕」），不要要求模型绘制具体游戏名、App 界面、商标 UI（如《空洞骑士》截图）——这类内容写入 overlays（type=image，notes 说明需上传真实截图）。"""


class QwenError(Exception):
    pass


class VideoDownloadError(Exception):
    pass


def detect_platform(url: str) -> str:
    host = urlparse(url).netloc.lower()
    if "douyin" in host:
        return "douyin"
    if "bilibili" in host or "b23.tv" in host:
        return "bilibili"
    if "youtube" in host or "youtu.be" in host:
        return "youtube"
    if "xiaohongshu" in host or "xhslink" in host:
        return "xiaohongshu"
    return "generic"


def _guess_mime_type(content_type: str, url: str) -> str:
    if content_type.startswith("video/"):
        return content_type.split(";")[0]
    lower = url.lower()
    if lower.endswith(".webm"):
        return "video/webm"
    if lower.endswith(".mov"):
        return "video/quicktime"
    return "video/mp4"


async def download_video(url: str) -> tuple[bytes, str]:
    headers = {"User-Agent": USER_AGENT, "Accept": "video/*,*/*"}
    async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
        async with client.stream("GET", url, headers=headers) as response:
            if response.status_code >= 400:
                raise VideoDownloadError(f"无法下载视频 (HTTP {response.status_code})")
            content_type = response.headers.get("content-type", "")
            final_url = str(response.url)
            if content_type.startswith("text/html"):
                raise VideoDownloadError(
                    "链接返回网页而非视频文件。请提供可直接播放的 MP4 地址，"
                    "或 COS/公开存储上的视频 URL"
                )
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > MAX_VIDEO_BYTES:
                    raise VideoDownloadError(f"视频超过 {MAX_VIDEO_BYTES // (1024 * 1024)}MB 限制")
                chunks.append(chunk)
    data = b"".join(chunks)
    if len(data) < 1024:
        raise VideoDownloadError("下载内容过小，可能不是有效视频")
    return data, _guess_mime_type(content_type, final_url)


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

    decoder = json.JSONDecoder()
    for idx, ch in enumerate(cleaned):
        if ch != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(cleaned[idx:])
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            return obj

    try:
        obj = json.loads(cleaned)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError as exc:
        raise QwenError("通义千问返回的内容不是有效 JSON") from exc

    raise QwenError("通义千问返回的内容不是有效 JSON 对象")


def _require_api_key() -> str:
    if not settings.dashscope_api_key:
        raise QwenError("未配置 DASHSCOPE_API_KEY，请在 .env 中填写百炼 API Key")
    return settings.dashscope_api_key


def dashscope_compatible_base() -> str:
    return (settings.dashscope_base_url or DASHSCOPE_DEFAULT_BASE).rstrip("/")


def dashscope_native_base() -> str:
    """Base URL for DashScope native APIs (Wanx image, task polling). Not compatible-mode."""
    explicit = (settings.dashscope_native_base_url or "").strip().rstrip("/")
    if explicit:
        return explicit
    url = (settings.dashscope_base_url or "").strip()
    if "dashscope-intl.aliyuncs.com" in url:
        return "https://dashscope-intl.aliyuncs.com"
    if "compatible-mode" in url or not url:
        return DASHSCOPE_NATIVE_DEFAULT_BASE
    if "/api/" in url:
        return url.split("/api/")[0].rstrip("/")
    return url.rstrip("/") or DASHSCOPE_NATIVE_DEFAULT_BASE


async def _call_qwen_video(*, video_ref: str, fps: float = 2.0) -> dict[str, Any]:
    api_key = _require_api_key()
    model = settings.qwen_vl_model or "qwen-vl-max"
    base_url = dashscope_compatible_base()
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "video_url", "video_url": {"url": video_ref}, "fps": fps},
                    {"type": "text", "text": SCRIPT_PROMPT},
                ],
            }
        ],
        "temperature": 0.2,
    }
    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
    if response.status_code >= 400:
        detail = response.text.strip() or response.reason_phrase
        raise QwenError(f"通义千问 API 错误 ({response.status_code}): {detail}")

    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise QwenError("通义千问未返回分析结果")
    message = choices[0].get("message") or {}
    text = message.get("content", "")
    if not text.strip():
        raise QwenError("通义千问返回空内容")
    return _extract_json(text)


async def analyze_video_script_by_url(video_url: str) -> dict[str, Any]:
    return await _call_qwen_video(video_ref=video_url)


async def analyze_video_script_bytes(video_bytes: bytes, mime_type: str) -> dict[str, Any]:
    encoded = base64.b64encode(video_bytes).decode("ascii")
    data_url = f"data:{mime_type};base64,{encoded}"
    return await _call_qwen_video(video_ref=data_url)


FACE_BOX_PROMPT = """你是专业人像分析师。请在这张照片中定位「头部人脸」矩形区域，用于数字人面部参考。

要求：
1. 必须完整包含：发际线/头顶、额头、眉毛、眼睛、鼻子、嘴巴、下巴；侧脸时需包含鼻尖到耳后轮廓。
2. 下边界止于下巴下方少量脖子，不要包含肩膀、衣领、胸口、手臂。
3. 严禁框选：手、手臂、键盘、手机、杯子、桌面物体或任何非头部区域。
4. 侧脸/坐姿照时，人脸通常在画面上方或侧上方，不要框到桌面中央的手部。
5. 边界框宽高比应接近正方形（头部比例），不要输出横向长条区域。

照片类型：{shot_label}

严格输出 JSON（不要 markdown 代码块）：
{{"faceBox": {{"x1": 整数, "y1": 整数, "x2": 整数, "y2": 整数}}, "confidence": 0到100的整数, "summary": "一句话"}}

faceBox 坐标为相对原图宽高的千分比：x1/y1 为左上角，x2/y2 为右下角，取值 0–1000，且 x2>x1、y2>y1。"""

FACE_BOX_RETRY_PROMPT = """上一次定位错误（可能框到了手/手臂/物体）。请重新定位照片中人物的「头部人脸」。

硬性规则：
1. 只框头部：发际线到下巴，可含少量脖子，绝不包含肩膀与手臂。
2. 若人物低头看屏幕，框选其头部，不要框选手放在键盘/桌面上的区域。
3. 框应接近正方形，中心点应在图像上半部分。

照片类型：{shot_label}

严格输出 JSON（不要 markdown）：
{{"faceBox": {{"x1": 整数, "y1": 整数, "x2": 整数, "y2": 整数}}, "confidence": 0到100的整数, "summary": "一句话"}}"""

SHOT_LABELS_FOR_FACE = {
    "front_face": "正脸照",
    "side_face": "侧脸照",
    "body": "身材/全身照（人脸可能较小）",
    "other": "其他人像参考",
}


def _normalize_face_box(raw: Any, *, image_width: int, image_height: int) -> dict[str, int]:
    if not isinstance(raw, dict):
        raise QwenError("人脸定位结果缺少 faceBox")
    try:
        x1 = int(raw.get("x1"))
        y1 = int(raw.get("y1"))
        x2 = int(raw.get("x2"))
        y2 = int(raw.get("y2"))
    except (TypeError, ValueError) as exc:
        raise QwenError("人脸定位坐标无效") from exc

    if not (0 <= x1 < x2 <= 1000 and 0 <= y1 < y2 <= 1000):
        raise QwenError("人脸定位坐标超出范围")

    px1 = int(x1 / 1000 * image_width)
    py1 = int(y1 / 1000 * image_height)
    px2 = int(x2 / 1000 * image_width)
    py2 = int(y2 / 1000 * image_height)
    if px2 - px1 < 24 or py2 - py1 < 24:
        raise QwenError("人脸定位区域过小")
    return {"x1": px1, "y1": py1, "x2": px2, "y2": py2}


def _validate_face_box_sanity(
    box: dict[str, int],
    *,
    image_width: int,
    image_height: int,
    shot_type: str,
) -> None:
    bw = box["x2"] - box["x1"]
    bh = box["y2"] - box["y1"]
    if bw <= 0 or bh <= 0:
        raise QwenError("人脸定位区域无效")
    aspect = bw / bh
    if aspect > 1.85 or aspect < 0.45:
        raise QwenError("人脸定位形状异常（过宽或过扁），疑似误识别为非人脸区域")
    cx = (box["x1"] + box["x2"]) / 2
    cy = (box["y1"] + box["y2"]) / 2
    area_ratio = (bw * bh) / max(image_width * image_height, 1)
    shot = (shot_type or "other").strip()
    if cy > image_height * 0.62 and aspect > 1.2:
        raise QwenError("疑似误识别为手部或桌面物体，请换正脸或更清晰的照片")
    if shot in {"front_face", "side_face"} and cy > image_height * 0.72:
        raise QwenError("人脸应位于画面上方，当前定位结果异常")
    if shot in {"front_face", "side_face"} and area_ratio > 0.42:
        raise QwenError("定位区域过大，可能包含了肩膀或身体")
    if shot in {"front_face", "side_face"} and area_ratio < 0.015:
        raise QwenError("人脸区域过小，请上传更高清的面部照片")


async def _call_face_box_vl(
    *,
    image_ref: str,
    prompt: str,
) -> dict[str, Any]:
    api_key = _require_api_key()
    model = settings.qwen_vl_model or "qwen-vl-max"
    base_url = dashscope_compatible_base()
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": image_ref}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        "temperature": 0.1,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
    if response.status_code >= 400:
        detail = response.text.strip() or response.reason_phrase
        raise QwenError(f"人脸定位失败 ({response.status_code}): {detail}")

    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise QwenError("人脸定位未返回结果")
    text = (choices[0].get("message") or {}).get("content", "")
    if not text.strip():
        raise QwenError("人脸定位返回空内容")
    return _extract_json(text)


async def detect_face_bounding_box(
    image_url: str | None = None,
    *,
    image_bytes: bytes | None = None,
    mime_type: str = "image/jpeg",
    shot_type: str = "other",
    image_width: int,
    image_height: int,
) -> dict[str, Any]:
    if image_bytes:
        encoded = base64.b64encode(image_bytes).decode("ascii")
        image_ref = f"data:{mime_type};base64,{encoded}"
    elif image_url:
        image_ref = image_url
    else:
        raise QwenError("缺少用于人脸定位的图片")

    shot_label = SHOT_LABELS_FOR_FACE.get((shot_type or "other").strip(), SHOT_LABELS_FOR_FACE["other"])
    prompts = [
        FACE_BOX_PROMPT.format(shot_label=shot_label),
        FACE_BOX_RETRY_PROMPT.format(shot_label=shot_label),
    ]
    last_error: QwenError | None = None
    for prompt in prompts:
        try:
            parsed = await _call_face_box_vl(image_ref=image_ref, prompt=prompt)
            face_raw = parsed.get("faceBox") or parsed.get("face_box")
            box = _normalize_face_box(face_raw, image_width=image_width, image_height=image_height)
            _validate_face_box_sanity(
                box,
                image_width=image_width,
                image_height=image_height,
                shot_type=shot_type,
            )
            confidence_raw = parsed.get("confidence", 0)
            try:
                confidence = int(confidence_raw)
            except (TypeError, ValueError):
                confidence = 0
            if confidence < 40:
                raise QwenError(f"人脸定位置信度过低（{confidence}），请换更清晰的照片重试")
            return {
                "box": box,
                "confidence": max(0, min(100, confidence)),
                "summary": str(parsed.get("summary") or "").strip(),
            }
        except QwenError as exc:
            last_error = exc
    assert last_error is not None
    raise last_error


MULTIMODAL_GENERATION = "/api/v1/services/aigc/multimodal-generation/generation"

FACE_EXTRACT_PLAN_PROMPT = """你是数字人人脸素材专家。请分析这张{shot_label}，为下游「图像编辑大模型」撰写精确的中文编辑指令，用于产出头部人脸参考图。

用途：锁定五官与发型，供后续合成口播首屏，禁止改变人物身份。

你必须考虑：
1. 若人物低头、侧脸、坐姿，头部通常在画面上方，绝不可把键盘上的手、杯子、手机当成抠图目标。
2. 裁切语义范围：发际线/头顶 → 下巴及少量脖子；不含肩膀、胸口、手臂。
3. 背景：替换为纯白或浅灰纯色，人物头部居中，保持原图五官肤色发型不变。

严格输出 JSON（不要 markdown）：
{{
  "editInstruction": "给图像编辑模型的一句完整中文指令",
  "negativePrompt": "反向提示词，英文或中文均可",
  "reviewNotes": "质检时重点检查什么"
}}"""

FACE_EXTRACT_REVIEW_PROMPT = """你是人脸抠图质检员。第一张是原图，第二张是抠图结果。

照片类型：{shot_label}
质检重点：{review_notes}

检查：
1. 是否只包含头部人脸（可含少量脖子），没有肩膀手臂或桌面物体
2. 五官、发型、肤色是否与原图同一人且未变形换脸
3. 是否误抠了手/杯子/键盘等非人脸区域
4. 背景是否干净，便于后续合成

严格输出 JSON（不要 markdown）：
{{"passed": true或false, "score": 0到100整数, "issues": ["问题"], "retryInstruction": "若不通过，给图像编辑模型的改进指令（正面描述应呈现什么）"}}"""


async def _download_image_bytes(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


def _image_ref(image_url: str | None, image_bytes: bytes | None, mime_type: str) -> str:
    if image_url:
        return image_url
    if image_bytes:
        encoded = base64.b64encode(image_bytes).decode("ascii")
        return f"data:{mime_type};base64,{encoded}"
    raise QwenError("缺少用于人脸提取的图片")


async def _call_vl_json(*, image_ref: str, prompt: str, extra_images: list[str] | None = None) -> dict[str, Any]:
    api_key = _require_api_key()
    model = settings.qwen_vl_model or "qwen-vl-max"
    base_url = dashscope_compatible_base()
    content: list[dict[str, Any]] = [{"type": "image_url", "image_url": {"url": image_ref}}]
    for url in extra_images or []:
        content.append({"type": "image_url", "image_url": {"url": url}})
    content.append({"type": "text", "text": prompt})
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.1,
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
    if response.status_code >= 400:
        detail = response.text.strip() or response.reason_phrase
        raise QwenError(f"通义千问视觉分析失败 ({response.status_code}): {detail}")
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise QwenError("通义千问视觉分析未返回结果")
    text = (choices[0].get("message") or {}).get("content", "")
    if not text.strip():
        raise QwenError("通义千问视觉分析返回空内容")
    return _extract_json(text)


async def _call_image_edit(
    *,
    image_ref: str,
    instruction: str,
    negative_prompt: str,
    size: str | None = None,
) -> str:
    api_key = _require_api_key()
    base_url = dashscope_native_base()
    model = settings.qwen_image_edit_model or "qwen-image-edit-plus"
    parameters: dict[str, Any] = {
        "n": 1,
        "watermark": False,
        "prompt_extend": True,
        "negative_prompt": negative_prompt or "blur, deformed face, extra limbs, hands, wrong subject",
    }
    if size:
        parameters["size"] = size
    payload = {
        "model": model,
        "input": {
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"image": image_ref},
                        {"text": instruction},
                    ],
                }
            ]
        },
        "parameters": parameters,
    }
    url = f"{base_url}{MULTIMODAL_GENERATION}"
    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    if response.status_code >= 400:
        detail = response.text.strip() or response.reason_phrase
        raise QwenError(f"图像编辑失败 ({response.status_code}): {detail}")
    data = response.json()
    if data.get("code"):
        raise QwenError(str(data.get("message") or data.get("code")))
    output = data.get("output") or {}
    choices = output.get("choices") or []
    if choices:
        content = (choices[0].get("message") or {}).get("content") or []
        for item in content:
            if isinstance(item, dict) and item.get("image"):
                return str(item["image"])
    results = output.get("results") or []
    for item in results:
        if isinstance(item, dict) and item.get("url"):
            return str(item["url"])
    raise QwenError("图像编辑未返回输出图片 URL")


async def plan_face_extraction(*, image_ref: str, shot_type: str) -> dict[str, str]:
    shot_label = SHOT_LABELS_FOR_FACE.get((shot_type or "other").strip(), SHOT_LABELS_FOR_FACE["other"])
    parsed = await _call_vl_json(
        image_ref=image_ref,
        prompt=FACE_EXTRACT_PLAN_PROMPT.format(shot_label=shot_label),
    )
    instruction = str(parsed.get("editInstruction") or parsed.get("edit_instruction") or "").strip()
    negative = str(parsed.get("negativePrompt") or parsed.get("negative_prompt") or "").strip()
    review_notes = str(parsed.get("reviewNotes") or parsed.get("review_notes") or "").strip()
    if not instruction:
        instruction = (
            "精确抠出图中人物的头部人脸特写，完整保留原图五官、肤色与发型；"
            "范围从发际线到下巴及少量脖子，不包含肩膀和手臂；背景替换为纯白色，人物居中，不改变面部特征。"
        )
    if not negative:
        negative = "hands, arms, shoulders, keyboard, cup, phone, wrong crop, deformed face, blur"
    if not review_notes:
        review_notes = "仅头部人脸、五官完整、同一人、背景干净"
    return {
        "edit_instruction": instruction,
        "negative_prompt": negative,
        "review_notes": review_notes,
    }


async def review_extracted_face(
    *,
    source_ref: str,
    result_url: str,
    shot_type: str,
    review_notes: str,
) -> dict[str, Any]:
    shot_label = SHOT_LABELS_FOR_FACE.get((shot_type or "other").strip(), SHOT_LABELS_FOR_FACE["other"])
    parsed = await _call_vl_json(
        image_ref=source_ref,
        extra_images=[result_url],
        prompt=FACE_EXTRACT_REVIEW_PROMPT.format(shot_label=shot_label, review_notes=review_notes),
    )
    passed = bool(parsed.get("passed"))
    try:
        score = int(parsed.get("score", 0))
    except (TypeError, ValueError):
        score = 0
    if score >= 75 and not passed:
        passed = True
    issues_raw = parsed.get("issues") if isinstance(parsed.get("issues"), list) else []
    return {
        "passed": passed,
        "score": max(0, min(100, score)),
        "issues": [str(i) for i in issues_raw if i],
        "retry_instruction": str(
            parsed.get("retryInstruction") or parsed.get("retry_instruction") or ""
        ).strip(),
        "summary": str(parsed.get("summary") or "").strip(),
    }


FIRST_FRAME_PLAN_PROMPT = """你是短视频口播首帧导演。参考图仅提供人物五官与发型身份，请为「图像编辑大模型」撰写一条中文指令，生成人物与场景在同一画面内自然融合的写实首帧。

脚本场景：{scene}
人物动作：{action}
人设：{persona_name}{persona_hint}

硬性要求（必须写进 editInstruction）：
1. 生成完整上半身与双臂，正面直立或符合脚本坐姿，身着合理服装
2. 人物与背景必须一体生成、光影透视统一，像现场实拍，禁止抠图粘贴、禁止漂浮头部、禁止白边描边
3. 五官发型肤色与参考图同一人，可扩展身体但不可换脸

严格输出 JSON（不要 markdown）：
{{"editInstruction": "给图像编辑模型的完整中文指令", "negativePrompt": "反向提示词"}}"""


def _first_frame_edit_fallback(
    *,
    persona_name: str,
    persona_description: str | None,
    scene: str,
    action: str,
    regen_additions: str = "",
    regen_compose: str = "",
) -> dict[str, str]:
    action_text = (action or "自然面向镜头口播").strip()
    scene_text = (scene or "简洁柔和的口播室内场景").strip()
    instruction = (
        f"以参考图中的人物五官、发型、肤色为身份基准，生成一张完整的写实摄影口播首帧。"
        f"画面中{persona_name}正面直立，完整上半身与双臂自然入镜并穿着得体服装，正在{action_text}。"
        f"场景为：{scene_text}。"
        f"人物、服装、动作与背景必须在同一画面中一体生成，光影与透视统一，"
        f"像是现场实拍照片；禁止单独抠图后粘贴到背景、禁止仅漂浮头部、禁止白边描边。"
    )
    if persona_description:
        instruction += f" 体态与外观：{persona_description.strip()}。"
    if regen_additions:
        instruction += f" 场景补充：{regen_additions.strip()}。"
    if regen_compose:
        instruction += f" 人物与场景关系：{regen_compose.strip()}。"
    return {
        "edit_instruction": instruction,
        "negative_prompt": (
            "floating head, cutout paste, sticker, white border, missing body, only head, "
            "deformed limbs, extra fingers, blur, wrong face, collage, bad composite"
        ),
    }


async def plan_first_frame_edit(
    *,
    face_image_url: str,
    persona_name: str,
    scene: str,
    action: str,
    persona_description: str | None = None,
    regen_additions: str = "",
    regen_compose: str = "",
) -> dict[str, str]:
    persona_hint = f"，{persona_description}" if persona_description else ""
    fallback = _first_frame_edit_fallback(
        persona_name=persona_name,
        persona_description=persona_description,
        scene=scene,
        action=action,
        regen_additions=regen_additions,
        regen_compose=regen_compose,
    )
    try:
        parsed = await _call_vl_json(
            image_ref=face_image_url,
            prompt=FIRST_FRAME_PLAN_PROMPT.format(
                scene=scene or "口播室内场景",
                action=action or "自然口播",
                persona_name=persona_name,
                persona_hint=persona_hint,
            ),
        )
    except QwenError:
        return fallback
    instruction = str(parsed.get("editInstruction") or parsed.get("edit_instruction") or "").strip()
    negative = str(parsed.get("negativePrompt") or parsed.get("negative_prompt") or "").strip()
    if not instruction:
        return fallback
    if regen_additions:
        instruction += f" 场景补充：{regen_additions.strip()}。"
    if regen_compose:
        instruction += f" 人物与场景关系：{regen_compose.strip()}。"
    return {
        "edit_instruction": instruction,
        "negative_prompt": negative or fallback["negative_prompt"],
    }


async def generate_integrated_first_frame(
    face_image_url: str,
    *,
    instruction: str,
    negative_prompt: str,
    aspect_ratio: str = "16:9",
) -> bytes:
    """以人脸为身份参考，一体生成人物+场景融合的首帧。"""
    size = "720*1280" if aspect_ratio == "9:16" else "1280*720"
    result_url = await _call_image_edit(
        image_ref=face_image_url,
        instruction=instruction,
        negative_prompt=negative_prompt,
        size=size,
    )
    return await _download_image_bytes(result_url)


async def extract_face_portrait_with_llm(
    image_url: str | None = None,
    *,
    image_bytes: bytes | None = None,
    mime_type: str = "image/jpeg",
    shot_type: str = "other",
    max_attempts: int = 2,
) -> bytes:
    """VL 规划 + 图像编辑抠脸 + VL 质检，由大模型完成专业人脸提取。"""
    image_ref = _image_ref(image_url, image_bytes, mime_type)
    plan = await plan_face_extraction(image_ref=image_ref, shot_type=shot_type)
    instruction = plan["edit_instruction"]
    negative = plan["negative_prompt"]
    review_notes = plan["review_notes"]
    last_issues: list[str] = []

    for attempt in range(max(1, max_attempts)):
        result_url = await _call_image_edit(
            image_ref=image_ref,
            instruction=instruction,
            negative_prompt=negative,
        )
        review = await review_extracted_face(
            source_ref=image_ref,
            result_url=result_url,
            shot_type=shot_type,
            review_notes=review_notes,
        )
        if review["passed"]:
            return await _download_image_bytes(result_url)
        last_issues = list(review.get("issues") or [])
        retry = review.get("retry_instruction") or ""
        if retry and attempt + 1 < max_attempts:
            instruction = (
                f"{plan['edit_instruction']}。上一轮问题：{'；'.join(last_issues) or '质检未通过'}。"
                f"请按以下要求改进：{retry}"
            )
            continue
        if attempt + 1 < max_attempts:
            instruction = (
                f"{plan['edit_instruction']}。请重新抠取头部人脸，不要包含手部或肩膀；"
                f"问题：{'；'.join(last_issues) or '质检未通过'}"
            )

    issue_text = "；".join(last_issues) if last_issues else "抠脸结果未通过质检"
    raise QwenError(f"AI 人脸提取未通过质检：{issue_text}")


async def analyze_video_script(source_url: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Try public URL first, then download + base64 fallback."""
    meta: dict[str, Any] = {"analysisMode": "url"}
    try:
        return await analyze_video_script_by_url(source_url), meta
    except QwenError:
        meta = {"analysisMode": "download_base64"}
        video_bytes, mime_type = await download_video(source_url)
        meta["mimeType"] = mime_type
        meta["videoSizeBytes"] = len(video_bytes)
        result = await analyze_video_script_bytes(video_bytes, mime_type)
        return result, meta
