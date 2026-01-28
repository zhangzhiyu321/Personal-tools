"""
用户数据库模型
提供用户表定义和用户管理功能
"""

from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

# 使用统一的db实例（从tools.expense_tracker.database导入）
from tools.expense_tracker.database import db


class User(db.Model):
    """用户表"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(50), unique=True, nullable=False, index=True)  # 用户名（唯一）
    password_hash = db.Column(db.String(255), nullable=False)  # 密码哈希
    is_admin = db.Column(db.Boolean, default=False, nullable=False)  # 是否管理员
    is_active = db.Column(db.Boolean, default=True, nullable=False)  # 是否激活
    last_login = db.Column(db.DateTime)  # 最后登录时间
    login_count = db.Column(db.Integer, default=0)  # 登录次数
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)  # 创建时间
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)  # 更新时间
    
    def __repr__(self):
        return f'<User {self.username}>'
    
    def to_dict(self, include_sensitive=False):
        """转换为字典"""
        data = {
            'id': self.id,
            'username': self.username,
            'is_admin': self.is_admin,
            'is_active': self.is_active,
            'last_login': self.last_login.isoformat() if self.last_login else None,
            'login_count': self.login_count,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_sensitive:
            data['password_hash'] = self.password_hash
        return data
    
    def set_password(self, password: str):
        """设置密码（自动哈希）"""
        # 使用PBKDF2-SHA256，600,000次迭代（高安全性）
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256:600000')
    
    def check_password(self, password: str) -> bool:
        """验证密码"""
        return check_password_hash(self.password_hash, password)
    
    def update_login_info(self):
        """更新登录信息"""
        self.last_login = datetime.now()
        self.login_count = (self.login_count or 0) + 1


class UserManager:
    """用户管理器"""
    
    @staticmethod
    def create_user(username: str, password: str, is_admin: bool = False) -> User:
        """创建新用户"""
        # 检查用户名是否已存在
        if User.query.filter_by(username=username).first():
            raise ValueError(f"用户名 '{username}' 已存在")
        
        # 验证密码强度
        if len(password) < 8:
            raise ValueError("密码长度至少8位")
        
        # 创建用户
        user = User(
            username=username,
            is_admin=is_admin,
            is_active=True
        )
        user.set_password(password)
        
        db.session.add(user)
        db.session.commit()
        
        return user
    
    @staticmethod
    def get_user_by_username(username: str) -> User:
        """根据用户名获取用户"""
        return User.query.filter_by(username=username).first()
    
    @staticmethod
    def get_user_by_id(user_id: int) -> User:
        """根据ID获取用户"""
        return User.query.get(user_id)
    
    @staticmethod
    def authenticate(username: str, password: str) -> User:
        """验证用户登录"""
        user = UserManager.get_user_by_username(username)
        
        if not user:
            return None
        
        if not user.is_active:
            return None
        
        if not user.check_password(password):
            return None
        
        # 更新登录信息
        user.update_login_info()
        db.session.commit()
        
        return user
    
    @staticmethod
    def change_password(user: User, old_password: str, new_password: str) -> bool:
        """修改密码"""
        if not user.check_password(old_password):
            return False
        
        if len(new_password) < 8:
            raise ValueError("新密码长度至少8位")
        
        user.set_password(new_password)
        db.session.commit()
        
        return True
    
    @staticmethod
    def init_default_admin():
        """初始化默认管理员账户"""
        from .config import SecurityConfig
        
        admin_username = SecurityConfig.get_admin_username()
        admin_password_hash = SecurityConfig.get_admin_password_hash()
        
        # 检查是否已存在
        existing_user = UserManager.get_user_by_username(admin_username)
        if existing_user:
            return existing_user
        
        # 创建管理员账户
        if admin_password_hash:
            # 如果环境变量提供了密码哈希，直接使用
            user = User(
                username=admin_username,
                password_hash=admin_password_hash,
                is_admin=True,
                is_active=True
            )
        else:
            # 使用默认密码（首次登录后必须修改）
            default_password = 'Admin@2026!ChangeMe'
            user = User(
                username=admin_username,
                is_admin=True,
                is_active=True
            )
            user.set_password(default_password)
        
        db.session.add(user)
        db.session.commit()
        
        return user
