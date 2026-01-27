#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
个人小工具集合 - 后端入口（统一 Flask 应用）

说明：
- 这里只做最基础的 Flask 应用创建、配置和各小工具 Blueprint 注册；
- 每个具体小工具放在 `backend/tools/<tool_id>/` 目录下，内部有自己的 routes/service/core 等；
- 前端入口页面（工具面板）和各工具页面模板，放在 `backend/templates` 下。
"""

import os
import tempfile
from flask import Flask, jsonify, render_template


def create_app() -> Flask:
    """创建并配置 Flask 应用"""
    app = Flask(
        __name__,
        template_folder=os.path.join(os.path.dirname(__file__), "templates"),
        static_folder=os.path.join(os.path.dirname(__file__), "static"),
    )

    # 上传大小等通用配置
    app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB
    app.config["UPLOAD_FOLDER"] = tempfile.gettempdir()

    # 注册所有小工具的 Blueprint
    register_tools_blueprints(app)

    # 初始化记账工具的数据库（在应用上下文中）
    try:
        from tools.expense_tracker.database import init_db
        with app.app_context():
            init_db(app)
    except Exception as e:
        print(f"记账工具数据库初始化警告: {e}")

    # 注册通用路由（首页 / 工具列表 API）
    register_common_routes(app)

    return app


def get_tools():
    """工具注册表：后续新增工具只需在这里追加一项

    注意：这里只描述元数据，不涉及具体逻辑。
    """
    return [
        {
            "id": "excel_checkin",
            "name": "Excel 打卡时间标红工具",
            "description": "自动识别晚打卡、早打卡和假期打卡记录，并在 Excel 中标红，同时生成凌晨打卡明细。",
            "path": "/tools/excel_checkin",  # 前端页面入口
            "api_prefix": "/api/excel_checkin",  # 后端 API 前缀
            "tags": ["Excel", "打卡", "考勤", "标红", "加班"],
            "icon": "📊",
        },
        {
            "id": "stl_to_step",
            "name": "STL 转 STEP 转换工具",
            "description": "本地调用 stltostp 内核，将 STL 三角网格高精度转换为 STEP（.stp）曲面模型，支持多文件批量转换和预览。",
            "path": "/tools/stl_to_step",
            "api_prefix": "/api/stl_to_step",
            "tags": ["STL", "STEP", "三维", "CAD", "格式转换"],
            "icon": "📐",
        },
        {
            "id": "expense_tracker",
            "name": "记账工具",
            "description": "简单清晰的个人财务管理工具，支持收入支出记录、数据统计、图表展示、数据导入导出。",
            "path": "/tools/expense_tracker",
            "api_prefix": "/api/expense_tracker",
            "tags": ["记账", "财务", "统计", "图表"],
            "icon": "💰",
        },
    ]


def register_tools_blueprints(app: Flask) -> None:
    """集中注册各个小工具的 Blueprint"""
    # Excel 打卡工具
    try:
        # 注意：这里直接从当前包下的 tools 导入，
        # 因为运行方式是 `python backend/app.py`，sys.path 指向 backend 目录
        from tools.excel_checkin import (  # type: ignore
            api_blueprint as excel_checkin_api_bp,
            page_blueprint as excel_checkin_page_bp,
        )

        app.register_blueprint(excel_checkin_api_bp)
        app.register_blueprint(excel_checkin_page_bp)
    except Exception as e:
        # 为避免因单个工具导入失败导致整个服务起不来，这里只打印错误
        print("加载 Excel 打卡工具 Blueprint 失败：", e)

    # STL 转 STEP 工具
    try:
        from tools.stl_to_step import (  # type: ignore
            api_blueprint as stl_to_step_api_bp,
            page_blueprint as stl_to_step_page_bp,
        )

        app.register_blueprint(stl_to_step_api_bp)
        app.register_blueprint(stl_to_step_page_bp)
    except Exception as e:
        print("加载 STL 转 STEP 工具 Blueprint 失败：", e)

    # 记账工具
    try:
        from tools.expense_tracker import (  # type: ignore
            api_blueprint as expense_tracker_api_bp,
            page_blueprint as expense_tracker_page_bp,
        )

        app.register_blueprint(expense_tracker_api_bp)
        app.register_blueprint(expense_tracker_page_bp)
        print("✓ 记账工具 Blueprint 注册成功")
    except Exception as e:
        import traceback
        print(f"✗ 加载记账工具 Blueprint 失败：{e}")
        print(traceback.format_exc())


def register_common_routes(app: Flask) -> None:
    """注册通用路由：首页 + 工具列表 API"""

    @app.route("/")
    def index():
        """工具主控台首页：展示所有工具卡片"""
        tools = get_tools()
        return render_template("portal/index.html", tools=tools)

    @app.route("/api/tools")
    def api_tools():
        """返回工具列表 JSON，供前端使用"""
        return jsonify(get_tools())

if __name__ == "__main__":
    import sys

    port = 5001
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except Exception:
            pass

    app = create_app()
    print(f"服务启动在 http://localhost:{port}")
    app.run(debug=True, host="0.0.0.0", port=port)

