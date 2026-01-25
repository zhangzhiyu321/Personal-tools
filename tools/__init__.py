"""
小工具后端模块包。

每个小工具在 `backend/tools/<tool_id>/` 下有自己独立的包，
并在各自的 `__init__.py` 中暴露一个名为 `blueprint` 的 Flask Blueprint。
"""

