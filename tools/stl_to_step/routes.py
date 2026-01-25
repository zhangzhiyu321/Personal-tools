"""
STL 转 STEP 工具 - 路由定义

从原先独立的 web/app.py 中迁移而来，并适配到统一的 Flask 应用结构：
- 页面入口：/tools/stl_to_step
- API 前缀：/api/stl_to_step
"""

import os
import re
import socket
import subprocess
import tempfile
from pathlib import Path

from flask import jsonify, render_template, request, send_file
from werkzeug.utils import secure_filename

from . import api_blueprint, page_blueprint


# 配置
UPLOAD_FOLDER = tempfile.mkdtemp(prefix="stl_convert_")
OUTPUT_FOLDER = tempfile.mkdtemp(prefix="stl_output_")
ALLOWED_EXTENSIONS = {"stl", "STL"}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB

# 获取 stltostp 工具路径
# 优先使用当前 backend 工具目录下的二进制，如不存在则回退到原来的 stl_to_xt_converter 目录
_THIS_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _THIS_DIR.parents[2]  # .../小工具

_STLTOSTP_CANDIDATES = [
    # 优先使用当前目录下 build 目录里的可执行文件（我们用 c++ 编译后的默认位置）
    _THIS_DIR / "stltostp" / "build" / "stltostp",
    # 其次尝试没有 build 子目录的情况
    _THIS_DIR / "stltostp" / "stltostp",
]

for _p in _STLTOSTP_CANDIDATES:
    if _p.exists():
        STLTOSTP_PATH = _p
        break
else:
    # 即便不存在，也先指向第一个，后面会有清晰的错误提示
    STLTOSTP_PATH = _STLTOSTP_CANDIDATES[0]

# 确保输出目录存在
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)


def allowed_file(filename: str) -> bool:
    """检查文件扩展名是否允许"""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def parse_stltostp_output(output: str) -> dict:
    """解析 stltostp 的输出，提取转换信息"""
    info: dict = {
        "triangles": None,
        "edges": None,
    }

    # 解析三角形数量
    triangle_match = re.search(r"Read (\d+) triangles", output)
    if triangle_match:
        info["triangles"] = int(triangle_match.group(1))

    # 解析合并边数
    edge_match = re.search(r"Merged (\d+) edges", output)
    if edge_match:
        info["edges"] = int(edge_match.group(1))

    return info


def cleanup_files(input_path: str | None = None, output_path: str | None = None) -> None:
    """清理输入和输出文件"""
    for path in (input_path, output_path):
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass


@page_blueprint.route("", methods=["GET"])
@page_blueprint.route("/", methods=["GET"])
def stl_to_step_page():
    """页面入口：渲染前端界面"""
    # 注意：为避免与其他 Blueprint 的 index.html 冲突，这里显式使用子目录路径
    return render_template("stl_to_step/index.html")


@api_blueprint.route("/convert", methods=["POST"])
def convert_file():
    """转换 STL 文件为 STEP 格式"""
    try:
        # 检查文件是否存在
        if "file" not in request.files:
            return jsonify({"success": False, "error": "没有上传文件"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"success": False, "error": "文件名为空"}), 400

        if not allowed_file(file.filename):
            return jsonify(
                {"success": False, "error": "不支持的文件格式，请上传 STL 文件"}
            ), 400

        # 获取容差参数
        tolerance = request.form.get("tolerance", "6")
        try:
            tolerance_value = float(f"1e-{int(tolerance)}")
        except (ValueError, TypeError):
            tolerance_value = 1e-6

        # 保存上传的文件
        filename = secure_filename(file.filename)
        input_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(input_path)

        # 检查文件大小
        file_size = os.path.getsize(input_path)
        if file_size > MAX_FILE_SIZE:
            cleanup_files(input_path=input_path)
            return jsonify(
                {
                    "success": False,
                    "error": f"文件太大，最大支持 {MAX_FILE_SIZE // 1024 // 1024}MB",
                }
            ), 400

        # 生成输出文件名
        output_filename = os.path.splitext(filename)[0] + ".stp"
        output_path = os.path.join(OUTPUT_FOLDER, output_filename)

        # 检查 stltostp 工具是否存在
        if not os.path.exists(STLTOSTP_PATH):
            cleanup_files(input_path=input_path)
            return jsonify(
                {
                    "success": False,
                    "error": f"转换工具未找到: {STLTOSTP_PATH}",
                }
            ), 500

        # 确保工具有执行权限
        try:
            os.chmod(STLTOSTP_PATH, 0o755)
        except OSError:
            # 某些系统上可能失败，但不影响后续尝试执行
            pass

        # 执行转换
        try:
            cmd = [
                str(STLTOSTP_PATH),
                input_path,
                output_path,
                "tol",
                str(tolerance_value),
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,  # 5分钟超时
            )

            # 检查转换是否成功
            if result.returncode != 0:
                error_msg = result.stderr or result.stdout or "转换失败"
                cleanup_files(input_path=input_path, output_path=output_path)
                return jsonify(
                    {
                        "success": False,
                        "error": f"转换失败: {error_msg}",
                    }
                ), 500

            # 检查输出文件是否存在
            if not os.path.exists(output_path):
                cleanup_files(input_path=input_path)
                return jsonify(
                    {
                        "success": False,
                        "error": "转换完成但输出文件未生成",
                    }
                ), 500

            # 解析转换信息
            conversion_info = parse_stltostp_output(result.stdout)

            # 清理输入文件
            cleanup_files(input_path=input_path)

            # 返回成功响应
            return jsonify(
                {
                    "success": True,
                    "filename": output_filename,
                    "download_url": f"/api/stl_to_step/download/{output_filename}",
                    "triangles": conversion_info["triangles"],
                    "edges": conversion_info["edges"],
                    "tolerance": f"1e-{tolerance}",
                    "file_size": os.path.getsize(output_path),
                }
            )

        except subprocess.TimeoutExpired:
            cleanup_files(input_path=input_path, output_path=output_path)
            return jsonify(
                {
                    "success": False,
                    "error": "转换超时，文件可能过大或过于复杂",
                }
            ), 500

        except Exception as e:  # noqa: BLE001
            cleanup_files(input_path=input_path, output_path=output_path)
            return jsonify(
                {
                    "success": False,
                    "error": f"转换过程出错: {str(e)}",
                }
            ), 500

    except Exception as e:  # noqa: BLE001
        return jsonify(
            {
                "success": False,
                "error": f"服务器错误: {str(e)}",
            }
        ), 500


@api_blueprint.route("/download/<filename>", methods=["GET"])
def download_file(filename: str):
    """下载转换后的 STEP 文件"""
    try:
        file_path = os.path.join(OUTPUT_FOLDER, secure_filename(filename))

        if not os.path.exists(file_path):
            return jsonify({"error": "文件不存在"}), 404

        return send_file(
            file_path,
            as_attachment=True,
            download_name=filename,
            mimetype="application/octet-stream",
        )

    except Exception as e:  # noqa: BLE001
        return jsonify({"error": str(e)}), 500


@api_blueprint.route("/health", methods=["GET"])
def health_check():
    """健康检查接口"""
    return jsonify(
        {
            "status": "ok",
            "stltostp_path": str(STLTOSTP_PATH),
            "stltostp_exists": os.path.exists(STLTOSTP_PATH),
        }
    )


# 仅保留 find_free_port 做兼容，如果以后需要单独起服务可以复用
def find_free_port(start_port: int = 5000, max_attempts: int = 10) -> int | None:
    """查找可用端口"""
    for port in range(start_port, start_port + max_attempts):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("", port))
                return port
        except OSError:
            continue
    return None


