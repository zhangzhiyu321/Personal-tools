"""
数据库模型和配置
使用 MySQL 存储记账数据
"""

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from decimal import Decimal

db = SQLAlchemy()


class Category(db.Model):
    """分类表"""
    __tablename__ = 'categories'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, nullable=False, index=True)  # 用户ID（数据隔离）
    type = db.Column(db.String(10), nullable=False, index=True)  # 类型：income(收入) 或 expense(支出)
    name = db.Column(db.String(50), nullable=False)  # 分类名称
    icon = db.Column(db.String(10), default='📦')  # 图标
    color = db.Column(db.String(20), default='#C7CEEA')  # 颜色
    sort_order = db.Column(db.Integer, default=0)  # 排序顺序
    is_default = db.Column(db.Boolean, default=False)  # 是否为默认分类
    created_at = db.Column(db.DateTime, default=datetime.now)  # 创建时间
    
    # 添加联合索引，确保同一用户下分类名称唯一
    __table_args__ = (
        db.Index('idx_user_type_name', 'user_id', 'type', 'name'),
    )
    
    def to_dict(self):
        """转换为字典"""
        return {
            'id': self.id,  # 返回ID以便前端使用
            'type': self.type,
            'name': self.name,
            'icon': self.icon,
            'color': self.color,
            'sort_order': self.sort_order,
            'is_default': self.is_default
        }


class Expense(db.Model):
    """记账记录表"""
    __tablename__ = 'expenses'
    
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, nullable=False, index=True)  # 用户ID（数据隔离）
    date = db.Column(db.Date, nullable=False, index=True)  # 日期
    type = db.Column(db.String(10), nullable=False)  # 类型：income(收入) 或 expense(支出)
    category = db.Column(db.String(50), nullable=False)  # 分类（存储分类名称）
    account = db.Column(db.String(50), default='未关联')  # 账户（默认：未关联）
    amount = db.Column(db.Numeric(10, 2), nullable=False)  # 金额
    note = db.Column(db.String(200))  # 备注
    created_at = db.Column(db.DateTime, default=datetime.now)  # 创建时间
    
    # 添加联合索引，优化查询性能
    __table_args__ = (
        db.Index('idx_user_date', 'user_id', 'date'),
        db.Index('idx_user_type_date', 'user_id', 'type', 'date'),
    )
    
    def to_dict(self):
        """转换为字典"""
        return {
            'id': self.id,
            'date': self.date.strftime('%Y-%m-%d') if self.date else None,
            'type': self.type,
            'category': self.category,
            'account': self.account or '未关联',
            'amount': float(self.amount) if self.amount else 0.0,
            'note': self.note or '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


def init_db(app: Flask):
    """初始化数据库"""
    import os
    from security.config import SecurityConfig
    from security.encryption import EncryptionManager
    
    db_uri = SecurityConfig.get_db_uri() or app.config.get('EXPENSE_TRACKER_DB_URI')
    if not db_uri:
        raise ValueError("数据库连接未配置！请设置环境变量 EXPENSE_TRACKER_DB_URI")
    
    if db_uri.startswith('encrypted:'):
        db_uri = EncryptionManager().decrypt(db_uri[10:])
    
    app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True, 'pool_recycle': 3600,
        'pool_size': 10, 'max_overflow': 20, 'echo': False
    }
    
    try:
        db.init_app(app)
    except Exception as e:
        if 'already been registered' not in str(e):
            raise
    
    with app.app_context():
        from security.models import UserManager
        try:
            db.create_all()
            admin_user = UserManager.init_default_admin()
            if admin_user:
                init_default_categories_for_user(admin_user.id)
        except Exception as e:
            print(f"数据库初始化警告: {e}")


def init_default_categories_for_user(user_id: int):
    """为用户初始化默认分类"""
    if Category.query.filter_by(user_id=user_id).count() > 0:
        return
    
    default_categories = [
        ('expense', '餐饮', '🍔', '#FF6B6B', 1),
        ('expense', '交通', '🚗', '#4ECDC4', 2),
        ('expense', '购物', '🛍️', '#FFE66D', 3),
        ('expense', '娱乐', '🎬', '#A8E6CF', 4),
        ('expense', '医疗', '🏥', '#FF8B94', 5),
        ('expense', '教育', '📚', '#95E1D3', 6),
        ('expense', '住房', '🏠', '#F38181', 7),
        ('expense', '水电', '💡', '#AA96DA', 8),
        ('expense', '其他', '📦', '#C7CEEA', 9),
        ('income', '工资', '💰', '#51CF66', 1),
        ('income', '奖金', '🎁', '#FFD43B', 2),
        ('income', '投资', '📈', '#74C0FC', 3),
        ('income', '其他', '💵', '#FF8787', 4),
    ]
    
    for cat_type, name, icon, color, sort_order in default_categories:
        db.session.add(Category(
            user_id=user_id, type=cat_type, name=name, icon=icon,
            color=color, sort_order=sort_order, is_default=True
        ))
    
    try:
        db.session.commit()
        print(f"✓ 用户 {user_id} 的默认分类初始化成功")
    except Exception as e:
        db.session.rollback()
        print(f"用户 {user_id} 的默认分类初始化失败: {e}")
