"""
Excel 打卡时间标红工具 - 路由定义
"""

import os
import base64
import traceback
from datetime import time
from typing import List, Dict

from flask import request, jsonify, current_app, render_template
from werkzeug.utils import secure_filename

from . import api_blueprint, page_blueprint
from .service import process_file_for_web
from .log import get_logger


logger = get_logger()
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
    logger.info(
        "upload_start | filename=%s has_file=%s",
        (request.files.get("file").filename if request.files.get("file") else None),
        "file" in request.files,
    )

    if "file" not in request.files:
        logger.warning("upload_reject | reason=no_file_in_request")
        return jsonify({"error": "没有上传文件"}), 400

    file = request.files["file"]
    if file.filename == "":
        logger.warning("upload_reject | reason=empty_filename")
        return jsonify({"error": "没有选择文件"}), 400

    if not _allowed_file(file.filename):
        logger.warning("upload_reject | reason=invalid_extension filename=%s", file.filename)
        return jsonify({"error": "不支持的文件格式，请上传 .xlsx 或 .xls 文件"}), 400

    # 时间参数
    try:
        late_hour = int(request.form.get("late_hour", 20))
        late_minute = int(request.form.get("late_minute", 0))
        early_hour = int(request.form.get("early_hour", 5))
        early_minute = int(request.form.get("early_minute", 0))
        clean_hour = int(request.form.get("clean_hour", 17))
        clean_minute = int(request.form.get("clean_minute", 44))

        if not (0 <= late_hour <= 23 and 0 <= late_minute <= 59):
            logger.warning("upload_reject | reason=invalid_late_time %s:%s", late_hour, late_minute)
            return jsonify({"error": "晚打卡时间设置无效"}), 400
        if not (0 <= early_hour <= 23 and 0 <= early_minute <= 59):
            logger.warning("upload_reject | reason=invalid_early_time %s:%s", early_hour, early_minute)
            return jsonify({"error": "早打卡时间设置无效"}), 400
        if not (0 <= clean_hour <= 23 and 0 <= clean_minute <= 59):
            logger.warning("upload_reject | reason=invalid_clean_time %s:%s", clean_hour, clean_minute)
            return jsonify({"error": "清洗阈值时间设置无效"}), 400
    except ValueError as e:
        logger.warning("upload_reject | reason=time_param_error error=%s", e)
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
    except Exception as e:
        logger.debug("holidays_parse_failed | error=%s, using_empty", e)
        custom_holidays = []

    upload_folder = current_app.config.get("UPLOAD_FOLDER") or os.getcwd()

    try:
        filename = secure_filename(file.filename)
        filepath = os.path.join(upload_folder, filename)
        file.save(filepath)
        logger.info(
            "file_saved | path=%s size_bytes=%s params=late=%s:%s early=%s:%s clean=%s:%s holidays_count=%s",
            filepath,
            os.path.getsize(filepath) if os.path.exists(filepath) else 0,
            late_hour,
            late_minute,
            early_hour,
            early_minute,
            clean_hour,
            clean_minute,
            len(custom_holidays),
        )

        output_path, night_records = process_file_for_web(
            filepath,
            late_time=time(late_hour, late_minute),
            early_time=time(early_hour, early_minute),
            custom_holidays=custom_holidays,
            clean_cutoff_time=time(clean_hour, clean_minute),
        )

        if not output_path or not os.path.exists(output_path):
            logger.error(
                "file_process_failed | output_path=%s output_path_exists=%s input=%s",
                output_path,
                os.path.exists(output_path) if output_path else False,
                filepath,
            )
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

        logger.info(
            "upload_success | output=%s night_records=%s",
            output_path,
            len(night_records or []),
        )
        return jsonify({
            "file_name": os.path.basename(output_path),
            "file_data": file_data,
            "night_records": night_records or [],
        })
    except Exception as e:
        logger.exception(
            "upload_exception | filepath=%s error=%s traceback=%s",
            filepath if "filepath" in dir() else None,
            e,
            traceback.format_exc(),
        )
        return jsonify({"error": f"处理文件时出错: {str(e)}"}), 500

