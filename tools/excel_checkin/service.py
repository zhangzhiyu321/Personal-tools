"""
Excel 打卡工具的服务层封装。

Web 入口只调用这里的函数，不直接操作 Excel 细节。
"""

from datetime import time
from typing import List, Dict, Optional, Tuple

from .excel_core import process_excel_for_web


def process_file_for_web(
    file_path: str,
    late_time: time,
    early_time: time,
    custom_holidays: Optional[List[Dict]] = None,
    clean_cutoff_time: time = time(17, 44),
) -> Tuple[Optional[str], List[Dict]]:
    """供 Web 调用的统一入口，内部调用 core 逻辑。"""
    return process_excel_for_web(
        file_path=file_path,
        late_time=late_time,
        early_time=early_time,
        custom_holidays=custom_holidays,
        clean_cutoff_time=clean_cutoff_time,
    )

