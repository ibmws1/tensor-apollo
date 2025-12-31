# -*- coding: utf-8 -*-
import os
import subprocess
import sys
import tkinter as tk
from tkinter import filedialog
from tkinter import messagebox
from pathlib import Path

def get_ffmpeg_path():
    """
    Get the path to ffmpeg executable.
    Priority:
    1. 'ffmpeg.exe' in current script directory.
    2. System PATH ('ffmpeg' command).
    3. Winget installation directory.
    4. User manually selected path.
    """
    # 1. Check current directory (portable mode)
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
    
    local_ffmpeg = os.path.join(base_path, 'ffmpeg.exe')
    if os.path.exists(local_ffmpeg):
        return local_ffmpeg
        
    # 2. Check system PATH
    try:
        subprocess.run(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        return "ffmpeg"
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    # 3. Check Winget default paths (Auto-detect)
    try:
        local_app_data = os.environ.get('LOCALAPPDATA', '')
        if local_app_data:
            winget_dir = Path(local_app_data) / "Microsoft" / "WinGet" / "Packages"
            if winget_dir.exists():
                print("正在搜索 Winget 安装目录...")
                # Search recursively for ffmpeg.exe in Winget packages
                # Limit depth/scope if needed, but usually packages dir is structured
                found = list(winget_dir.rglob("ffmpeg.exe"))
                if found:
                    return str(found[0])
    except Exception:
        pass

    # 4. Manually ask user
    print("未在系统路径或当前目录找到 FFmpeg。")
    print("请在弹出的窗口中手动选择 ffmpeg.exe 文件...")
    
    root = tk.Tk()
    root.withdraw()
    
    msg = "未检测到自动安装的 FFmpeg (包括 Winget 路径)。\n\n请点击确定，然后手动选择您电脑上的 ffmpeg.exe 文件。"
    messagebox.showinfo("寻找 FFmpeg", msg)
    
    ffmpeg_exe = filedialog.askopenfilename(
        title="请选择 ffmpeg.exe",
        filetypes=[("Executable", "*.exe"), ("All Files", "*.*")]
    )
    
    if ffmpeg_exe and os.path.exists(ffmpeg_exe):
        return ffmpeg_exe
        
    return None

def select_directory():
    """Open a dialog to select a directory."""
    root = tk.Tk()
    root.withdraw()  # Hide the main window
    folder_path = filedialog.askdirectory(title="请选择包含视频的文件夹")
    return folder_path

import re
import shutil

# ... existing code ...

def get_video_metadata(ffmpeg_path, file_path):
    """
    Get video metadata using ffmpeg.
    Returns dict with: width, height, bitrate (kbps), duration (s), size (MB)
    """
    try:
        # Get file size in MB
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        
        cmd = [ffmpeg_path, "-i", str(file_path)]
        # ffmpeg -i output goes to stderr
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='ignore')
        local_stderr = result.stderr

        # Parse Resolution (e.g., 1920x1080)
        # Match "Video: ..., 1920x1080" or "Video: ..., 1920x1080 [SAR..."
        res_match = re.search(r'Video:.*?\s(\d{3,5})x(\d{3,5})', local_stderr)
        width, height = (0, 0)
        if res_match:
            width = int(res_match.group(1))
            height = int(res_match.group(2))

        # Parse Duration (e.g., Duration: 00:00:30.50)
        dur_match = re.search(r'Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d{2})', local_stderr)
        duration = 0
        if dur_match:
            h, m, s = dur_match.groups()
            duration = float(h) * 3600 + float(m) * 60 + float(s)

        # Parse Bitrate (e.g., bitrate: 1024 kb/s)
        br_match = re.search(r'bitrate:\s*(\d+)\s*kb/s', local_stderr)
        bitrate = 0
        if br_match:
            bitrate = int(br_match.group(1))
        
        return {
            "width": width, 
            "height": height, 
            "bitrate": bitrate, 
            "duration": duration, 
            "size_mb": file_size_mb
        }
    except Exception as e:
        print(f"Error parsing metadata for {file_path.name}: {e}")
        return None

def check_compliance(meta):
    """
    Check if video meets platform requirements.
    Returns: (is_compliant, reason_string)
    """
    if not meta or meta['width'] == 0:
        return False, "无法读取元数据"

    w, h = meta['width'], meta['height']
    dur = meta['duration']
    br = meta['bitrate']
    size = meta['size_mb']
    
    # 1. Size & Duration check (Global)
    if size > 1000: return False, f"文件过大 ({size:.1f}MB)"
    if not (4 <= dur <= 300): return False, f"时长不合规 ({dur:.1f}s)"
    if br < 516: return False, f"码率过低 ({br}kbps)"

    ratio = w / h
    
    # 2. Orientation specific check
    if w >= h: # Horizontal
        # Must be close to 16:9 (1.77)
        if not (1.70 <= ratio <= 1.85): return False, f"横版比例不对 ({w}x{h})"
        # Resolution Range: 1280x720 <= Res <= 2560x1440
        if not (1280 <= w <= 2560 and 720 <= h <= 1440): return False, f"横版分辨率不合规 ({w}x{h})"
        return True, "符合横版标准"
        
    else: # Vertical
        # Must be close to 9:16 (0.56)
        if not (0.54 <= ratio <= 0.60): return False, f"竖版比例不对 ({w}x{h})"
        # Resolution Range: 720x1280 <= Res <= 1440x2560
        if not (720 <= w <= 1440 and 1280 <= h <= 2560): return False, f"竖版分辨率不合规 ({w}x{h})"
        return True, "符合竖版标准"

def resize_video(input_path, output_path, ffmpeg_path, metadata):
    """
    Re-encode video to strictly meet requirements.
    Horizontal -> 1280x720 (16:9)
    Vertical -> 720x1280 (9:16)
    """
    w, h = metadata['width'], metadata['height']
    
    # Determine target based on orientation
    if w >= h:
        # Target Horizontal 1280x720
        # scale to fit inside 1280x720, then pad to fill 1280x720
        vf_filter = "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2"
    else:
        # Target Vertical 720x1280
        vf_filter = "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2"

    cmd = [
        ffmpeg_path,
        "-i", str(input_path),
        "-vf", vf_filter,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-b:v", "2000k",    # Target bitrate 2000k to ensure > 516k
        "-minrate", "1000k", # Ensure minimum quality
        "-bufsize", "4000k",
        "-c:a", "copy",
        "-y",
        "-loglevel", "error",
        "-stats",
        str(output_path)
    ]
    
    try:
        # print(f"开始重编码: {input_path.name} ...")
        subprocess.run(cmd, check=True)
        return True
    except subprocess.CalledProcessError:
        return False

def process_single_video(args):
    """Helper wrapper for parallel execution"""
    input_path, output_path, ffmpeg_path = args
    
    # 1. Get Metadata
    meta = get_video_metadata(ffmpeg_path, input_path)
    
    # 2. Check Compliance
    is_valid, reason = check_compliance(meta)
    
    if is_valid:
        try:
            print(f"[跳过] {input_path.name} - {reason} -> 直接复制")
            shutil.copy2(input_path, output_path)
            return True
        except Exception as e:
            print(f"[复制失败] {input_path.name}: {e}")
            return False
    else:
        print(f"[处理] {input_path.name} - {reason} -> 重新编码")
        if resize_video(input_path, output_path, ffmpeg_path, meta):
            return True
        else:
            print(f"[失败] {input_path.name}")
            return False


def main():
    print("=== 批量视频尺寸修改工具 (宽度720p | 高速版) ===")
    
    # Check/Get FFmpeg
    ffmpeg_path = get_ffmpeg_path()
    
    if not ffmpeg_path:
        print("\n错误: 未能找到 FFmpeg。脚本无法运行。")
        input("按回车键退出...")
        sys.exit(1)
        
    print(f"使用 FFmpeg: {ffmpeg_path}")

    # Select Video Directory
    print("请在弹出的窗口中选择视频所在的文件夹...")
    source_dir = select_directory()
    
    if not source_dir:
        print("未选择文件夹，操作取消。")
        return

    source_path = Path(source_dir)
    output_dir = source_path / "output_720p"
    
    video_extensions = {'.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm'}
    
    files_to_process = [
        f for f in source_path.iterdir() 
        if f.is_file() and f.suffix.lower() in video_extensions
    ]
    
    if not files_to_process:
        print(f"在文件夹 '{source_dir}' 中未找到支持的视频文件。")
        input("按回车键退出...")
        return

    output_dir.mkdir(exist_ok=True)
    print(f"\n找到 {len(files_to_process)} 个视频文件。")
    print(f"输出目录: {output_dir}\n")
    
    # 确定并发数量
    # 视频编码比较吃CPU，留一个核给系统和其他任务比较好
    max_workers = max(1, (os.cpu_count() or 4) - 1)
    print(f"正在启动 {max_workers} 个并行任务进行处理...\n")

    success_count = 0
    fail_count = 0
    
    # 准备任务参数
    tasks = []
    for video_file in files_to_process:
        output_file = output_dir / f"{video_file.stem}_720p{video_file.suffix}"
        tasks.append((video_file, output_file, ffmpeg_path))

    from concurrent.futures import ThreadPoolExecutor
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(process_single_video, tasks))
        
    success_count = results.count(True)
    fail_count = results.count(False)
            
    print("\n" + "="*30)
    print("处理完成！")
    print(f"成功: {success_count}，失败: {fail_count}")
    print(f"文件已保存至: {output_dir}")
    print("="*30)
    input("按回车键退出...")

if __name__ == "__main__":
    main()
