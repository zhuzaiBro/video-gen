import asyncio
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from app.services.cos import public_url, upload_image_bytes
from app.services.video_assembly import _download_video


class VideoFrameError(Exception):
    pass


def _run_ffmpeg(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True)


def _probe_nb_frames(video_path: Path) -> int | None:
    result = _run_ffmpeg(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-count_frames",
            "-show_entries",
            "stream=nb_read_frames",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ]
    )
    if result.returncode != 0:
        return None
    raw = result.stdout.strip()
    if raw.isdigit() and int(raw) > 0:
        return int(raw)
    return None


def _extract_last_frame_from_file(video_path: Path, frame_path: Path) -> None:
    """多种策略提取最后一帧，兼容可灵 H.264 + AAC 与 Apple ffmpeg 7.x。"""
    if frame_path.exists():
        frame_path.unlink()

    nb_frames = _probe_nb_frames(video_path)
    strategies: list[list[str]] = []

    if nb_frames is not None:
        last_index = nb_frames - 1
        strategies.append(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(video_path),
                "-map",
                "0:v:0",
                "-an",
                "-vf",
                f"select=eq(n\\,{last_index})",
                "-vsync",
                "0",
                "-frames:v",
                "1",
                "-pix_fmt",
                "yuvj420p",
                "-q:v",
                "2",
                str(frame_path),
            ]
        )

    # 从片尾解码，-update 1 保留最后一帧（比 -ss 贴近 EOF 更稳）
    strategies.extend(
        [
            [
                "ffmpeg",
                "-y",
                "-sseof",
                "-2",
                "-i",
                str(video_path),
                "-map",
                "0:v:0",
                "-an",
                "-update",
                "1",
                "-frames:v",
                "1",
                "-pix_fmt",
                "yuvj420p",
                "-q:v",
                "2",
                str(frame_path),
            ],
            [
                "ffmpeg",
                "-y",
                "-sseof",
                "-0.2",
                "-i",
                str(video_path),
                "-map",
                "0:v:0",
                "-an",
                "-frames:v",
                "1",
                "-pix_fmt",
                "yuvj420p",
                "-q:v",
                "2",
                str(frame_path),
            ],
            [
                "ffmpeg",
                "-y",
                "-i",
                str(video_path),
                "-map",
                "0:v:0",
                "-an",
                "-vf",
                "select='eq(n,n_frames-1)'",
                "-vsync",
                "0",
                "-frames:v",
                "1",
                "-pix_fmt",
                "yuvj420p",
                "-q:v",
                "2",
                str(frame_path),
            ],
        ]
    )

    errors: list[str] = []
    for args in strategies:
        if frame_path.exists():
            frame_path.unlink()
        result = _run_ffmpeg(args)
        if result.returncode == 0 and frame_path.exists() and frame_path.stat().st_size > 0:
            return
        errors.append(result.stderr.strip() or "提取视频尾帧失败")

    raise VideoFrameError(errors[-1] if errors else "提取视频尾帧失败")


async def extract_last_frame_jpeg(video_url: str) -> bytes:
    if not shutil.which("ffmpeg"):
        raise VideoFrameError("服务器未安装 ffmpeg，无法提取视频尾帧")
    if not shutil.which("ffprobe"):
        raise VideoFrameError("服务器未安装 ffprobe，无法提取视频尾帧")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        video_path = tmp_dir / "input.mp4"
        frame_path = tmp_dir / "last.jpg"
        await _download_video(video_url, video_path)
        await asyncio.to_thread(_extract_last_frame_from_file, video_path, frame_path)
        if not frame_path.exists():
            raise VideoFrameError("尾帧图片不存在")
        return frame_path.read_bytes()


async def upload_continuity_frame(
    video_url: str,
    *,
    script_id: int,
    from_segment_index: int,
    for_segment_index: int,
) -> dict[str, str]:
    frame_bytes = await extract_last_frame_jpeg(video_url)
    key = (
        f"scripts/{script_id}/continuity-"
        f"from{from_segment_index}-to{for_segment_index}-{int(time.time() * 1000)}.jpg"
    )
    uploaded = await upload_image_bytes(frame_bytes, key=key)
    return {"key": uploaded["key"], "url": uploaded["url"], "public_url": public_url(key)}
