"""
Excel 打卡工具的服务层封装。

Web 入口只调用这里的函数，不直接操作 Excel 细节。
"""

from datetime import time
from typing import List, Dict, Optional, Tuple

from .excel_core import process_excel_for_web
from .log import get_logger


logger = get_logger()


def process_file_for_web(
    file_path: str,
    late_time: time,
    early_time: time,
    custom_holidays: Optional[List[Dict]] = None,
    clean_cutoff_time: time = time(17, 44),
) -> Tuple[Optional[str], List[Dict]]:
    """供 Web 调用的统一入口，内部调用 core 逻辑。"""
    logger.debug(
        "process_file_for_web enter | path=%s late=%s early=%s clean_cutoff=%s holidays=%s",
        file_path,
        late_time,
        early_time,
        clean_cutoff_time,
        len(custom_holidays or []),
    )
    output_path, night_records = process_excel_for_web(
        file_path=file_path,
        late_time=late_time,
        early_time=early_time,
        custom_holidays=custom_holidays,
        clean_cutoff_time=clean_cutoff_time,
    )
    logger.debug(
        "process_file_for_web exit | output_path=%s night_records_count=%s",
        output_path,
        len(night_records or []),
    )
    return output_path, night_records

