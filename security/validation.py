"""
输入验证模块
防止SQL注入、XSS、命令注入等攻击
"""

import re
import html
from typing import Any, Optional, List
from decimal import Decimal, InvalidOperation


class InputValidator:
    """输入验证器"""
    
    # SQL注入危险关键词
    SQL_INJECTION_PATTERNS = [
        r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)",
        r"(--|;|/\*|\*/|xp_|sp_)",
        r"(\b(OR|AND)\s+\d+\s*=\s*\d+)",
    ]
    
    # XSS危险模式
    XSS_PATTERNS = [
        r"<script[^>]*>.*?</script>",
        r"javascript:",
        r"on\w+\s*=",
        r"<iframe[^>]*>",
        r"<object[^>]*>",
        r"<embed[^>]*>",
    ]
    
    # 命令注入危险字符
    COMMAND_INJECTION_CHARS = [';', '|', '&', '`', '$', '(', ')', '<', '>', '\n', '\r']
    
    @staticmethod
    def sanitize_string(value: Any, max_length: Optional[int] = None, allow_html: bool = False) -> str:
        """清理字符串输入"""
        if value is None:
            return ""
        
        # 转换为字符串
        str_value = str(value).strip()
        
        # 检查长度
        if max_length and len(str_value) > max_length:
            str_value = str_value[:max_length]
        
        # HTML转义（除非允许HTML）
        if not allow_html:
            str_value = html.escape(str_value)
        
        return str_value
    
    @staticmethod
    def validate_no_sql_injection(value: str) -> bool:
        """检查是否包含SQL注入攻击"""
        if not value:
            return True
        
        value_upper = value.upper()
        for pattern in InputValidator.SQL_INJECTION_PATTERNS:
            if re.search(pattern, value_upper, re.IGNORECASE):
                return False
        return True
    
    @staticmethod
    def validate_no_xss(value: str) -> bool:
        """检查是否包含XSS攻击"""
        if not value:
            return True
        
        for pattern in InputValidator.XSS_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                return False
        return True
    
    @staticmethod
    def validate_no_command_injection(value: str) -> bool:
        """检查是否包含命令注入攻击"""
        if not value:
            return True
        
        for char in InputValidator.COMMAND_INJECTION_CHARS:
            if char in value:
                return False
        return True
    
    @staticmethod
    def validate_date(value: str) -> Optional[str]:
        """验证日期格式（YYYY-MM-DD）"""
        if not value:
            return None
        
        pattern = r'^\d{4}-\d{2}-\d{2}$'
        if not re.match(pattern, value):
            return None
        
        try:
            from datetime import datetime
            datetime.strptime(value, '%Y-%m-%d')
            return value
        except ValueError:
            return None
    
    @staticmethod
    def validate_decimal(value: Any, min_value: Optional[Decimal] = None, 
                        max_value: Optional[Decimal] = None) -> Optional[Decimal]:
        """验证并转换Decimal值"""
        if value is None:
            return None
        
        try:
            decimal_value = Decimal(str(value))
            
            if min_value is not None and decimal_value < min_value:
                return None
            if max_value is not None and decimal_value > max_value:
                return None
            
            return decimal_value
        except (InvalidOperation, ValueError, TypeError):
            return None
    
    @staticmethod
    def validate_integer(value: Any, min_value: Optional[int] = None,
                        max_value: Optional[int] = None) -> Optional[int]:
        """验证并转换整数"""
        if value is None:
            return None
        
        try:
            int_value = int(value)
            
            if min_value is not None and int_value < min_value:
                return None
            if max_value is not None and int_value > max_value:
                return None
            
            return int_value
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    def validate_enum(value: str, allowed_values: List[str]) -> Optional[str]:
        """验证枚举值"""
        if value in allowed_values:
            return value
        return None
    
    @staticmethod
    def validate_json_input(data: dict, schema: dict) -> tuple[bool, Optional[str], dict]:
        """
        验证JSON输入数据
        
        Args:
            data: 输入数据
            schema: 验证模式，格式如：
                {
                    'field_name': {
                        'type': 'string|int|decimal|date|enum',
                        'required': True/False,
                        'max_length': int,
                        'min_value': value,
                        'max_value': value,
                        'allowed_values': [list],
                        'sanitize': True/False
                    }
                }
        
        Returns:
            (is_valid, error_message, cleaned_data)
        """
        cleaned = {}
        
        for field_name, field_schema in schema.items():
            value = data.get(field_name)
            
            # 检查必填字段
            if field_schema.get('required', False) and (value is None or value == ''):
                return False, f"字段 '{field_name}' 是必填的", {}
            
            if value is None or value == '':
                cleaned[field_name] = None
                continue
            
            field_type = field_schema.get('type', 'string')
            
            # 字符串验证
            if field_type == 'string':
                if not isinstance(value, str):
                    return False, f"字段 '{field_name}' 必须是字符串", {}
                
                # SQL注入检查
                if not InputValidator.validate_no_sql_injection(value):
                    return False, f"字段 '{field_name}' 包含非法字符", {}
                
                # XSS检查
                if not InputValidator.validate_no_xss(value):
                    return False, f"字段 '{field_name}' 包含非法内容", {}
                
                # 清理
                max_length = field_schema.get('max_length')
                sanitize = field_schema.get('sanitize', True)
                cleaned[field_name] = InputValidator.sanitize_string(
                    value, max_length=max_length, allow_html=not sanitize
                )
            
            # 整数验证
            elif field_type == 'int':
                int_value = InputValidator.validate_integer(
                    value,
                    min_value=field_schema.get('min_value'),
                    max_value=field_schema.get('max_value')
                )
                if int_value is None:
                    return False, f"字段 '{field_name}' 不是有效的整数", {}
                cleaned[field_name] = int_value
            
            # Decimal验证
            elif field_type == 'decimal':
                decimal_value = InputValidator.validate_decimal(
                    value,
                    min_value=field_schema.get('min_value'),
                    max_value=field_schema.get('max_value')
                )
                if decimal_value is None:
                    return False, f"字段 '{field_name}' 不是有效的数字", {}
                cleaned[field_name] = decimal_value
            
            # 日期验证
            elif field_type == 'date':
                date_value = InputValidator.validate_date(value)
                if date_value is None:
                    return False, f"字段 '{field_name}' 不是有效的日期格式 (YYYY-MM-DD)", {}
                cleaned[field_name] = date_value
            
            # 枚举验证
            elif field_type == 'enum':
                enum_value = InputValidator.validate_enum(
                    value, field_schema.get('allowed_values', [])
                )
                if enum_value is None:
                    return False, f"字段 '{field_name}' 不是允许的值", {}
                cleaned[field_name] = enum_value
        
        return True, None, cleaned
