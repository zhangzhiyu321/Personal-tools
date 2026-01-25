"""
Excel 打卡时间标红工具 - 路由定义
"""

import os
import base64
from datetime import time
from typing import List, Dict

from flask import request, jsonify, current_app, render_template
from werkzeug.utils import secure_filename

from . import api_blueprint, page_blueprint
from .service import process_file_for_web


ALLOWED_EXTENSIONS = {"xlsx", "xls"}


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@page_blueprint.route("", methods=["GET"])
@page_blueprint.route("/", methods=["GET"])
def excel_checkin_page():
    """Excel 工具页面入口"""
    return render_template("index.html")


@api_blueprint.route("/upload", methods=["POST"])
def upload_file() -> "tuple[object, int] | object":
    """接收上传的 Excel，返回处理后的文件和凌晨打卡明细"""
    if "file" not in request.files:
        return jsonify({"error": "没有上传文件"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "没有选择文件"}), 400

    if not _allowed_file(file.filename):
        return jsonify({"error": "不支持的文件格式，请上传 .xlsx 或 .xls 文件"}), 400

    # 时间参数
    try:
        late_hour = int(request.form.get("late_hour", 20))
        late_minute = int(request.form.get("late_minute", 0))
        early_hour = int(request.form.get("early_hour", 5))
        early_minute = int(request.form.get("early_minute", 0))

        if not (0 <= late_hour <= 23 and 0 <= late_minute <= 59):
            return jsonify({"error": "晚打卡时间设置无效"}), 400
        if not (0 <= early_hour <= 23 and 0 <= early_minute <= 59):
            return jsonify({"error": "早打卡时间设置无效"}), 400
    except ValueError:
        return jsonify({"error": "时间参数格式错误"}), 400

    # 假期参数
    custom_holidays: List[Dict] = []
    try:
        import json

        holidays_json = request.form.get("holidays", "[]")
        holidays_data = json.loads(holidays_json)
        for item in holidays_data:
            if item.get("type") == "single" and item.get("date"):
                custom_holidays.append({"type": "single", "date": item["date"]})
            elif item.get("type") == "range" and item.get("start") and item.get("end"):
                custom_holidays.append(
                    {"type": "range", "start": item["start"], "end": item["end"]}
                )
    except Exception:
        # 解析失败则忽略自定义假期
        custom_holidays = []

    # 保存并处理文件
    upload_folder = current_app.config.get("UPLOAD_FOLDER") or os.getcwd()

    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(upload_folder, filename)
        file.save(filepath)

        output_path, night_records = process_file_for_web(
            filepath,
            late_time=time(late_hour, late_minute),
            early_time=time(early_hour, early_minute),
            custom_holidays=custom_holidays,
        )

        if not output_path or not os.path.exists(output_path):
            return jsonify({"error": "文件处理失败"}), 500

        with open(output_path, "rb") as f:
            file_data = base64.b64encode(f.read()).decode("utf-8")

        # 清理临时文件
        for path in {filepath, output_path}:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass

        return jsonify({
            "file_name": os.path.basename(output_path),
            "file_data": file_data,
            "night_records": night_records or [],
        })
    except Exception as e:
        import traceback

        traceback.print_exc()
        return jsonify({"error": f"处理文件时出错: {str(e)}"}), 500

