import asyncio
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import httpx

from app.services.cos import public_url, upload_video_bytes


class VideoAssemblyError(Exception):
    pass


async def _download_video(url: str, dest: Path) -> None:
    async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
        response = await client.get(url)
        response.raise_for_status()
        dest.write_bytes(response.content)


async def assemble_videos_from_urls(video_urls: list[str], *, script_id: int) -> dict[str, str]:
    if not video_urls:
        raise VideoAssemblyError("没有可整合的视频片段")
    if shutil.which("ffmpeg") is None:
        raise VideoAssemblyError("服务器未安装 ffmpeg，无法整合视频")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        list_file = tmp_dir / "files.txt"
        output = tmp_dir / "assembled.mp4"
        part_paths: list[Path] = []

        for i, url in enumerate(video_urls):
            part = tmp_dir / f"part_{i:03d}.mp4"
            await _download_video(url, part)
            part_paths.append(part)

        list_file.write_text(
            "\n".join(f"file '{path.name}'" for path in part_paths),
            encoding="utf-8",
        )

        def _run_ffmpeg() -> None:
            result = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    str(list_file),
                    "-c",
                    "copy",
                    str(output),
                ],
                cwd=tmp_dir,
                capture_output=True,
                text=True,
            )
            if result.returncode != 0:
                raise VideoAssemblyError(result.stderr.strip() or "ffmpeg 整合失败")

        await asyncio.to_thread(_run_ffmpeg)
        if not output.exists():
            raise VideoAssemblyError("整合输出文件不存在")

        key = f"scripts/{script_id}/assembled-{int(time.time() * 1000)}.mp4"
        uploaded = await upload_video_bytes(output.read_bytes(), key=key)
        return {"key": uploaded["key"], "url": uploaded["url"], "public_url": public_url(key)}
