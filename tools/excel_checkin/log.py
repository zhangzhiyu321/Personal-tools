"""
Excel 打卡工具专用日志。
按日期写入 logs/excel_checkin_YYYY-MM-DD.log，便于排查「文件处理失败」等问题。
"""

import logging
from datetime import datetime
from pathlib import Path


class DailyFileHandler(logging.FileHandler):
    """按日期命名的文件 Handler：每天一个文件，文件名 excel_checkin_YYYY-MM-DD.log"""

    def __init__(self, log_dir: Path, prefix: str = "excel_checkin"):
        self._log_dir = Path(log_dir)
        self._log_dir.mkdir(parents=True, exist_ok=True)
        self._prefix = prefix
        self._current_date: str | None = None
        path_today = self._log_dir / f"{self._prefix}_{datetime.now().strftime('%Y-%m-%d')}.log"
        super().__init__(str(path_today), encoding="utf-8")
        self._current_date = datetime.now().strftime("%Y-%m-%d")

    def emit(self, record: logging.LogRecord) -> None:
        today = datetime.now().strftime("%Y-%m-%d")
        if self._current_date != today:
            self.close()
            self._current_date = today
            path_today = self._log_dir / f"{self._prefix}_{today}.log"
            self.baseFilename = str(path_today)
            self.stream = self._open()
        super().emit(record)


def get_logger() -> logging.Logger:
    """获取 excel_checkin 专用 logger，首次调用时配置按日期切分的文件 handler。"""
    name = "excel_checkin"
    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)

    if not logger.handlers:
        log_dir = Path(__file__).resolve().parent.parent.parent / "logs"
        handler = DailyFileHandler(log_dir, prefix=name)
        handler.setLevel(logging.DEBUG)
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger
