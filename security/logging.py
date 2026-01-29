"""
安全日志模块
记录安全事件、访问日志、异常等
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional
from .config import SecurityConfig


class SecurityLogger:
    """安全日志记录器"""
    
    def __init__(self):
        self.log_dir = Path(__file__).parent.parent / 'logs'
        self.log_dir.mkdir(exist_ok=True)
        
        # 配置日志
        self.logger = logging.getLogger('security')
        self.logger.setLevel(logging.INFO)
        
        # 文件处理器
        log_file = self.log_dir / 'security.log'
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setLevel(logging.INFO)
        
        # 格式
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        file_handler.setFormatter(formatter)
        self.logger.addHandler(file_handler)
    
    def _log_event(self, level: str, event_type: str, data: Dict[str, Any]):
        """记录事件"""
        log_data = {
            'timestamp': datetime.now().isoformat(),
            'event_type': event_type,
            'data': data
        }
        
        message = json.dumps(log_data, ensure_ascii=False)
        
        if level == 'info':
            self.logger.info(message)
        elif level == 'warning':
            self.logger.warning(message)
        elif level == 'error':
            self.logger.error(message)
        elif level == 'critical':
            self.logger.critical(message)
    
    def log_info(self, event_type: str, data: Dict[str, Any]):
        """记录信息事件"""
        self._log_event('info', event_type, data)
    
    def log_warning(self, event_type: str, data: Dict[str, Any]):
        """记录警告事件"""
        self._log_event('warning', event_type, data)
    
    def log_error(self, event_type: str, data: Dict[str, Any]):
        """记录错误事件"""
        self._log_event('error', event_type, data)
    
    def log_critical(self, event_type: str, data: Dict[str, Any]):
        """记录严重事件"""
        self._log_event('critical', event_type, data)
    
    def log_security_event(self, event_type: str, data: Dict[str, Any]):
        """记录安全事件"""
        self.log_warning(event_type, data)
    
    def log_access(self, method: str, path: str, ip: str, 
                   user: Optional[str] = None, status_code: int = 200):
        """记录访问日志"""
        self.log_info('access', {
            'method': method,
            'path': path,
            'ip': ip,
            'user': user,
            'status_code': status_code
        })
    
    def log_api_call(self, endpoint: str, method: str, ip: str,
                    user: Optional[str] = None, params: Optional[Dict] = None):
        """记录API调用"""
        log_data = {
            'endpoint': endpoint,
            'method': method,
            'ip': ip,
            'user': user
        }
        if params:
            # 不记录敏感参数
            safe_params = {k: v for k, v in params.items() 
                          if 'password' not in k.lower() and 'token' not in k.lower()}
            log_data['params'] = safe_params
        
        self.log_info('api_call', log_data)
