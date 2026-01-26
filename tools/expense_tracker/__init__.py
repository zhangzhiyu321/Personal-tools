"""
记账工具 - 后端入口

本工具把「页面 + API + 业务逻辑 + 模板」都放在同一个目录里：
- 页面路由前缀：/tools/expense_tracker
- API 路由前缀：/api/expense_tracker
"""

from flask import Blueprint

# 页面 Blueprint（负责渲染前端界面）
page_blueprint = Blueprint(
    "expense_tracker_page",
    __name__,
    url_prefix="/tools/expense_tracker",
    template_folder="templates",
    static_folder="static",
)

# API Blueprint（负责数据接口）
api_blueprint = Blueprint(
    "expense_tracker_api",
    __name__,
    url_prefix="/api/expense_tracker",
)

# 导入路由以完成注册
from . import routes  # noqa: E402,F401
