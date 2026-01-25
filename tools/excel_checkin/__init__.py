"""
Excel 打卡时间标红工具 - 后端入口

本工具把「页面 + API + 业务逻辑 + 模板」都放在同一个目录里：
- 页面路由前缀：/tools/excel_checkin
- API 路由前缀：/api/excel_checkin
"""

from flask import Blueprint

# 页面 Blueprint（负责渲染前端界面）
page_blueprint = Blueprint(
    "excel_checkin_page",
    __name__,
    url_prefix="/tools/excel_checkin",
    template_folder="templates",
    static_folder="static",
)

# API Blueprint（负责数据接口）
api_blueprint = Blueprint(
    "excel_checkin_api",
    __name__,
    url_prefix="/api/excel_checkin",
)

# 导入路由以完成注册
from . import routes  # noqa: E402,F401


