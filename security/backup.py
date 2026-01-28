"""
自动备份模块
定期备份数据库和重要文件
"""

import os
import shutil
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from threading import Timer
from typing import Optional
from .config import SecurityConfig
from .logging import SecurityLogger

logger = SecurityLogger()


class BackupManager:
    """备份管理器"""
    
    def __init__(self, app=None):
        self.app = app
        self.backup_dir = Path(__file__).parent.parent / 'backups'
        self.backup_dir.mkdir(exist_ok=True)
        self.timer: Optional[Timer] = None
    
    def init_app(self, app):
        """初始化应用"""
        self.app = app
        
        if SecurityConfig.get_backup_enabled():
            # 启动定时备份
            self.start_auto_backup()
    
    def start_auto_backup(self):
        """启动自动备份"""
        if self.timer:
            self.timer.cancel()
        
        interval = SecurityConfig.get_backup_interval() * 3600  # 转换为秒
        
        def backup_and_schedule():
            try:
                self.backup_database()
            except Exception as e:
                logger.log_error('backup_failed', {'error': str(e)})
            
            # 清理旧备份
            self.cleanup_old_backups()
            
            # 安排下次备份
            self.start_auto_backup()
        
        self.timer = Timer(interval, backup_and_schedule)
        self.timer.daemon = True
        self.timer.start()
        logger.log_info('auto_backup_started', {'interval_hours': SecurityConfig.get_backup_interval()})
    
    def backup_database(self) -> Optional[Path]:
        """备份数据库"""
        if not self.app:
            return None
        
        db_uri = SecurityConfig.get_db_uri()
        if not db_uri:
            logger.log_warning('backup_skipped', {'reason': '数据库未配置'})
            return None
        
        try:
            # 解析数据库URI
            # 格式: mysql+pymysql://user:password@host:port/database
            from urllib.parse import urlparse
            parsed = urlparse(db_uri.replace('mysql+pymysql://', 'mysql://'))
            
            db_user = parsed.username
            db_password = parsed.password
            db_host = parsed.hostname
            db_port = parsed.port or 3306
            db_name = parsed.path.lstrip('/')
            
            # 生成备份文件名
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_file = self.backup_dir / f'db_backup_{timestamp}.sql'
            
            # 使用mysqldump备份
            cmd = [
                'mysqldump',
                f'--host={db_host}',
                f'--port={db_port}',
                f'--user={db_user}',
                f'--password={db_password}',
                '--single-transaction',
                '--routines',
                '--triggers',
                db_name
            ]
            
            with open(backup_file, 'w', encoding='utf-8') as f:
                result = subprocess.run(
                    cmd,
                    stdout=f,
                    stderr=subprocess.PIPE,
                    text=True
                )
            
            if result.returncode == 0:
                # 压缩备份文件
                compressed_file = self._compress_backup(backup_file)
                backup_file.unlink()  # 删除未压缩文件
                
                logger.log_info('backup_success', {
                    'file': str(compressed_file),
                    'size': compressed_file.stat().st_size
                })
                return compressed_file
            else:
                logger.log_error('backup_failed', {
                    'error': result.stderr
                })
                if backup_file.exists():
                    backup_file.unlink()
                return None
        
        except Exception as e:
            logger.log_error('backup_exception', {'error': str(e)})
            return None
    
    def _compress_backup(self, backup_file: Path) -> Path:
        """压缩备份文件"""
        import gzip
        
        compressed_file = backup_file.with_suffix('.sql.gz')
        
        with open(backup_file, 'rb') as f_in:
            with gzip.open(compressed_file, 'wb') as f_out:
                shutil.copyfileobj(f_in, f_out)
        
        return compressed_file
    
    def cleanup_old_backups(self):
        """清理旧备份"""
        retention_days = SecurityConfig.get_backup_retention()
        cutoff_date = datetime.now() - timedelta(days=retention_days)
        
        deleted_count = 0
        for backup_file in self.backup_dir.glob('db_backup_*.sql.gz'):
            try:
                # 从文件名提取时间戳
                timestamp_str = backup_file.stem.replace('db_backup_', '').replace('.sql', '')
                file_date = datetime.strptime(timestamp_str, '%Y%m%d_%H%M%S')
                
                if file_date < cutoff_date:
                    backup_file.unlink()
                    deleted_count += 1
            except Exception:
                pass
        
        if deleted_count > 0:
            logger.log_info('backup_cleanup', {'deleted_count': deleted_count})
    
    def restore_backup(self, backup_file: Path) -> bool:
        """恢复备份"""
        db_uri = SecurityConfig.get_db_uri()
        if not db_uri:
            return False
        
        try:
            from urllib.parse import urlparse
            parsed = urlparse(db_uri.replace('mysql+pymysql://', 'mysql://'))
            
            db_user = parsed.username
            db_password = parsed.password
            db_host = parsed.hostname
            db_port = parsed.port or 3306
            db_name = parsed.path.lstrip('/')
            
            # 解压（如果是压缩文件）
            if backup_file.suffix == '.gz':
                import gzip
                import tempfile
                with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.sql') as tmp:
                    with gzip.open(backup_file, 'rt') as f_in:
                        tmp.write(f_in.read())
                    sql_file = Path(tmp.name)
            else:
                sql_file = backup_file
            
            # 恢复
            cmd = [
                'mysql',
                f'--host={db_host}',
                f'--port={db_port}',
                f'--user={db_user}',
                f'--password={db_password}',
                db_name
            ]
            
            with open(sql_file, 'r', encoding='utf-8') as f:
                result = subprocess.run(
                    cmd,
                    stdin=f,
                    stderr=subprocess.PIPE,
                    text=True
                )
            
            if sql_file != backup_file:
                sql_file.unlink()
            
            if result.returncode == 0:
                logger.log_info('restore_success', {'file': str(backup_file)})
                return True
            else:
                logger.log_error('restore_failed', {'error': result.stderr})
                return False
        
        except Exception as e:
            logger.log_error('restore_exception', {'error': str(e)})
            return False
