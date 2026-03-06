"""
通用自动备份模块
定期备份所有配置的数据库与可选目录，支持 MySQL / SQLite，支持加密 URI。
不依赖具体业务（记账等），任何项目配置好 URI 即可纳入备份。
"""

import gzip
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from threading import Timer
from typing import List, Optional, Tuple
from urllib.parse import urlparse

from .config import SecurityConfig
from . import security_logger as logger


def _unlink_safe(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        pass


def _resolve_uri(uri: str) -> str:
    """若 URI 为 encrypted:xxx 则解密，否则原样返回。"""
    if not uri:
        return uri
    if uri.strip().lower().startswith('encrypted:'):
        from .encryption import EncryptionManager
        return EncryptionManager().decrypt(uri[len('encrypted:'):].strip())
    return uri


def _is_sqlite(uri: str) -> bool:
    return uri.strip().lower().startswith('sqlite')


def _parse_mysql_uri(uri: str) -> Optional[Tuple[str, str, str, int, str]]:
    """解析 MySQL URI，返回 (user, password, host, port, db_name)。"""
    try:
        u = uri.replace('mysql+pymysql://', 'mysql://').strip()
        parsed = urlparse(u)
        if not parsed.hostname or not parsed.path or not parsed.path.strip('/'):
            return None
        return (
            parsed.username or '',
            parsed.password or '',
            parsed.hostname,
            parsed.port or 3306,
            parsed.path.strip('/').split('?')[0],
        )
    except Exception:
        return None


def _parse_sqlite_path(uri: str) -> Optional[Path]:
    """从 sqlite:///path 或 sqlite:////path 解析出本地路径。"""
    try:
        u = uri.strip()
        if not u.lower().startswith('sqlite'):
            return None
        # sqlite:///path 或 sqlite:///absolute/path
        prefix = 'sqlite:///'
        if u.lower().startswith(prefix):
            path = u[len(prefix):].split('?')[0]
            return Path(path)
        return None
    except Exception:
        return None


class BackupManager:
    """通用备份管理器：多数据源 + 可选目录，启动时即执行一次备份。"""

    def __init__(self, app=None):
        self.app = app
        self.backup_dir = Path(__file__).parent.parent / 'backups'
        self.backup_dir.mkdir(exist_ok=True)
        self.timer: Optional[Timer] = None

    def init_app(self, app):
        """初始化：启动后延迟执行首次全量备份，再按间隔定时备份。"""
        self.app = app
        if not SecurityConfig.get_backup_enabled():
            return
        # 启动后约 60 秒执行第一次备份，避免进程频繁重启时从未备份
        self.timer = Timer(60.0, self._run_first_backup)
        self.timer.daemon = True
        self.timer.start()
        logger.log_info('backup_scheduled', {
            'first_in_seconds': 60,
            'interval_hours': SecurityConfig.get_backup_interval(),
        })

    def _run_first_backup(self):
        """首次备份：执行一次全量备份并清理旧文件，再启动定时。"""
        try:
            self.run_all_backups()
        except Exception as e:
            logger.log_error('backup_failed', {'error': str(e)})
        self.cleanup_old_backups()
        self.start_auto_backup()

    def start_auto_backup(self):
        """按配置间隔定时执行全量备份与清理。"""
        if self.timer:
            self.timer.cancel()
        interval = SecurityConfig.get_backup_interval() * 3600

        def run_and_reschedule():
            try:
                self.run_all_backups()
            except Exception as e:
                logger.log_error('backup_failed', {'error': str(e)})
            self.cleanup_old_backups()
            self.start_auto_backup()

        self.timer = Timer(interval, run_and_reschedule)
        self.timer.daemon = True
        self.timer.start()
        logger.log_info('auto_backup_started', {'interval_hours': SecurityConfig.get_backup_interval()})

    def run_all_backups(self) -> List[Path]:
        """执行所有配置的备份（数据库 + 目录），返回成功生成的备份文件列表。"""
        results: List[Path] = []
        db_uris = SecurityConfig.get_backup_db_uris()
        for i, uri in enumerate(db_uris):
            try:
                resolved = _resolve_uri(uri)
                if not resolved:
                    continue
                slug = f"db{i}" if len(db_uris) > 1 else "db"
                path = self._backup_one_database(resolved, slug=slug)
                if path:
                    results.append(path)
            except Exception as e:
                logger.log_error('backup_db_failed', {'uri_index': i, 'error': str(e)})
        for path in SecurityConfig.get_backup_paths():
            try:
                p = self._backup_one_path(path)
                if p:
                    results.append(p)
            except Exception as e:
                logger.log_error('backup_path_failed', {'path': str(path), 'error': str(e)})
        return results

    def _backup_one_database(self, uri: str, slug: str = 'db') -> Optional[Path]:
        """备份单个数据库（MySQL 或 SQLite）。"""
        if _is_sqlite(uri):
            return self._backup_sqlite(uri, slug=slug)
        return self._backup_mysql(uri, slug=slug)

    def _backup_mysql(self, uri: str, slug: str = 'db') -> Optional[Path]:
        """使用 mysqldump 备份 MySQL。"""
        parsed = _parse_mysql_uri(uri)
        if not parsed:
            logger.log_warning('backup_skipped', {'reason': '无法解析 MySQL URI', 'slug': slug})
            return None
        user, password, host, port, db_name = parsed
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        name = f"db_backup_{slug}_{timestamp}.sql"
        backup_file = self.backup_dir / name
        cmd = [
            'mysqldump',
            f'--host={host}',
            f'--port={port}',
            f'--user={user}',
            f'--password={password}',
            '--single-transaction',
            '--routines',
            '--triggers',
            db_name,
        ]
        try:
            with open(backup_file, 'w', encoding='utf-8') as f:
                result = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE, text=True, timeout=600)
            if result.returncode != 0:
                logger.log_error('backup_failed', {'slug': slug, 'error': (result.stderr or '').strip()})
                if backup_file.exists():
                    _unlink_safe(backup_file)
                return None
            compressed = self._compress_backup(backup_file)
            _unlink_safe(backup_file)
            logger.log_info('backup_success', {'file': str(compressed), 'slug': slug, 'size': compressed.stat().st_size})
            return compressed
        except subprocess.TimeoutExpired:
            if backup_file.exists():
                _unlink_safe(backup_file)
            logger.log_error('backup_failed', {'slug': slug, 'error': 'mysqldump timeout'})
            return None
        except Exception as e:
            if backup_file.exists():
                _unlink_safe(backup_file)
            logger.log_error('backup_exception', {'slug': slug, 'error': str(e)})
            return None

    def _backup_sqlite(self, uri: str, slug: str = 'db') -> Optional[Path]:
        """通过复制文件备份 SQLite。"""
        path = _parse_sqlite_path(uri)
        if not path or not path.exists():
            logger.log_warning('backup_skipped', {'reason': 'SQLite 路径无效或不存在', 'uri': uri[:50], 'slug': slug})
            return None
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        ext = path.suffix or '.db'
        dest = self.backup_dir / f"db_backup_{slug}_{timestamp}{ext}.gz"
        try:
            with open(path, 'rb') as f_in:
                with gzip.open(dest, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            logger.log_info('backup_success', {'file': str(dest), 'slug': slug, 'size': dest.stat().st_size})
            return dest
        except Exception as e:
            if dest.exists():
                _unlink_safe(dest)
            logger.log_error('backup_exception', {'slug': slug, 'error': str(e)})
            return None

    def _backup_one_path(self, path: Path) -> Optional[Path]:
        """将指定目录或文件打包为带时间戳的 tar.gz。"""
        if not path.exists():
            logger.log_warning('backup_skipped', {'reason': '路径不存在', 'path': str(path)})
            return None
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        name = path.name or 'data'
        safe_name = "".join(c if c.isalnum() or c in '-_' else '_' for c in name)
        base = self.backup_dir / f"path_backup_{safe_name}_{timestamp}"
        try:
            created = shutil.make_archive(str(base), 'gztar', path.parent, path.name)
            archive = Path(created)
            logger.log_info('backup_success', {'file': str(archive), 'path': str(path), 'size': archive.stat().st_size})
            return archive
        except Exception as e:
            for f in self.backup_dir.glob(f"path_backup_{safe_name}_{timestamp}*"):
                _unlink_safe(f)
            logger.log_error('backup_exception', {'path': str(path), 'error': str(e)})
            return None

    def _compress_backup(self, backup_file: Path) -> Path:
        """将 .sql 文件压缩为 .sql.gz。"""
        compressed = backup_file.with_suffix(backup_file.suffix + '.gz')
        with open(backup_file, 'rb') as f_in:
            with gzip.open(compressed, 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        return compressed

    def cleanup_old_backups(self):
        """按保留天数删除过期备份（db_backup_*.sql.gz、db_backup_*.db.gz、path_backup_*.tar.gz）。"""
        retention_days = SecurityConfig.get_backup_retention()
        cutoff = datetime.now() - timedelta(days=retention_days)
        deleted = 0
        for pattern in ('db_backup_*.sql.gz', 'db_backup_*.db.gz', 'path_backup_*.tar.gz'):
            for f in self.backup_dir.glob(pattern):
                try:
                    # 从文件名取时间戳：*_YYYYMMDD_HHMMSS*
                    parts = f.stem.replace('.sql', '').replace('.db', '').split('_')
                    for part in parts:
                        if len(part) == 15 and part.isdigit():
                            file_dt = datetime.strptime(part, '%Y%m%d_%H%M%S')
                            if file_dt < cutoff:
                                _unlink_safe(f)
                                deleted += 1
                            break
                except Exception:
                    pass
        if deleted > 0:
            logger.log_info('backup_cleanup', {'deleted_count': deleted})

    def restore_backup(self, backup_file: Path, target_uri: Optional[str] = None) -> bool:
        """
        恢复备份到指定或默认数据库。
        target_uri 为空时使用配置中的第一个备份 DB URI（支持 encrypted:）。
        """
        uris = SecurityConfig.get_backup_db_uris()
        if not uris:
            logger.log_warning('restore_skipped', {'reason': '未配置备份数据库'})
            return False
        uri = (target_uri or uris[0]).strip()
        resolved = _resolve_uri(uri)
        if not resolved:
            return False
        if _is_sqlite(resolved):
            return self._restore_sqlite(backup_file, resolved)
        return self._restore_mysql(backup_file, resolved)

    def _restore_mysql(self, backup_file: Path, uri: str) -> bool:
        """从 .sql 或 .sql.gz 恢复到 MySQL。"""
        parsed = _parse_mysql_uri(uri)
        if not parsed:
            return False
        user, password, host, port, db_name = parsed
        sql_file: Optional[Path] = None
        try:
            if str(backup_file).endswith('.gz'):
                with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.sql') as tmp:
                    with gzip.open(backup_file, 'rb') as f_in:
                        tmp.write(f_in.read())
                    sql_file = Path(tmp.name)
            else:
                sql_file = backup_file
            cmd = [
                'mysql', f'--host={host}', f'--port={port}',
                f'--user={user}', f'--password={password}', db_name,
            ]
            with open(sql_file, 'r', encoding='utf-8', errors='replace') as f:
                result = subprocess.run(cmd, stdin=f, stderr=subprocess.PIPE, text=True, timeout=600)
            if sql_file != backup_file and sql_file:
                _unlink_safe(sql_file)
            if result.returncode == 0:
                logger.log_info('restore_success', {'file': str(backup_file)})
                return True
            logger.log_error('restore_failed', {'error': (result.stderr or '').strip()})
            return False
        except Exception as e:
            if sql_file and sql_file != backup_file:
                _unlink_safe(sql_file)
            logger.log_error('restore_exception', {'error': str(e)})
            return False

    def _restore_sqlite(self, backup_file: Path, uri: str) -> bool:
        """从 .gz 或原文件覆盖恢复 SQLite 文件。"""
        path = _parse_sqlite_path(uri)
        if not path:
            return False
        try:
            if str(backup_file).endswith('.gz'):
                with gzip.open(backup_file, 'rb') as f_in:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    with open(path, 'wb') as f_out:
                        shutil.copyfileobj(f_in, f_out)
            else:
                shutil.copy2(backup_file, path)
            logger.log_info('restore_success', {'file': str(backup_file), 'path': str(path)})
            return True
        except Exception as e:
            logger.log_error('restore_exception', {'error': str(e)})
            return False
