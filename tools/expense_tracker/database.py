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
    # MySQL 配置（优先使用环境变量，其次使用app配置）
    import os
    from security.config import SecurityConfig
    from security.encryption import EncryptionManager
    
    db_uri = SecurityConfig.get_db_uri()
    
    if not db_uri:
        # 尝试从app配置获取
        db_uri = app.config.get('EXPENSE_TRACKER_DB_URI')
    
    if not db_uri:
        error_msg = "数据库连接未配置！请设置环境变量 EXPENSE_TRACKER_DB_URI 或 在 Flask app.config 中设置 EXPENSE_TRACKER_DB_URI。\n格式: mysql+pymysql://用户名:密码@主机:端口/数据库名?charset=utf8mb4\n示例: mysql+pymysql://user:password@localhost:3306/expense_tracker?charset=utf8mb4"
        print(f"❌ 数据库配置错误: {error_msg}")
        raise ValueError(error_msg)
    
    # 如果URI是加密的，尝试解密
    if db_uri.startswith('encrypted:'):
        try:
            enc_manager = EncryptionManager()
            encrypted_part = db_uri[10:]  # 移除 'encrypted:' 前缀
            db_uri = enc_manager.decrypt(encrypted_part)
        except Exception as e:
            print(f"⚠️ 数据库URI解密失败: {e}")
            raise ValueError(f"数据库URI解密失败: {e}")
    
    # 配置SQLAlchemy
    app.config['SQLALCHEMY_DATABASE_URI'] = db_uri
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True,  # 连接前ping，自动重连
        'pool_recycle': 3600,   # 1小时后回收连接
        'pool_size': 10,        # 连接池大小
        'max_overflow': 20,      # 最大溢出连接数
        'echo': False            # 不打印SQL（生产环境）
    }
    
    # 尝试初始化，如果已经注册过则忽略错误
    try:
        db.init_app(app)
    except Exception as e:
        if 'already been registered' in str(e):
            # 已经注册过了，视为成功
            pass
        else:
            raise
    
    with app.app_context():
        # 导入用户模型，确保用户表也被创建
        from security.models import User, UserManager
        
        # 创建表
        try:
            db.create_all()
            print(f"✓ 数据库表创建成功（如果表已存在则跳过）")
            
            # 初始化默认管理员并为其创建默认分类
            try:
                admin_user = UserManager.init_default_admin()
                if admin_user:
                    init_default_categories_for_user(admin_user.id)
            except Exception as e:
                print(f"⚠️ 默认管理员初始化警告: {e}")
        except Exception as e:
            print(f"数据库初始化警告: {e}")
            print("请确保MySQL服务已启动，并且数据库连接配置正确。")
            print(f"当前数据库URI: {db_uri}")


def init_default_categories_for_user(user_id: int):
    """为用户初始化默认分类"""
    # 检查该用户是否已有分类
    if Category.query.filter_by(user_id=user_id).count() > 0:
        return  # 已有分类，跳过
    
    # 默认支出分类
    default_expense_categories = [
        {'name': '餐饮', 'icon': '🍔', 'color': '#FF6B6B', 'sort_order': 1},
        {'name': '交通', 'icon': '🚗', 'color': '#4ECDC4', 'sort_order': 2},
        {'name': '购物', 'icon': '🛍️', 'color': '#FFE66D', 'sort_order': 3},
        {'name': '娱乐', 'icon': '🎬', 'color': '#A8E6CF', 'sort_order': 4},
        {'name': '医疗', 'icon': '🏥', 'color': '#FF8B94', 'sort_order': 5},
        {'name': '教育', 'icon': '📚', 'color': '#95E1D3', 'sort_order': 6},
        {'name': '住房', 'icon': '🏠', 'color': '#F38181', 'sort_order': 7},
        {'name': '水电', 'icon': '💡', 'color': '#AA96DA', 'sort_order': 8},
        {'name': '其他', 'icon': '📦', 'color': '#C7CEEA', 'sort_order': 9},
    ]
    
    # 默认收入分类
    default_income_categories = [
        {'name': '工资', 'icon': '💰', 'color': '#51CF66', 'sort_order': 1},
        {'name': '奖金', 'icon': '🎁', 'color': '#FFD43B', 'sort_order': 2},
        {'name': '投资', 'icon': '📈', 'color': '#74C0FC', 'sort_order': 3},
        {'name': '其他', 'icon': '💵', 'color': '#FF8787', 'sort_order': 4},
    ]
    
    # 为该用户创建默认分类
    for cat_data in default_expense_categories:
        category = Category(
            user_id=user_id,
            type='expense',
            name=cat_data['name'],
            icon=cat_data['icon'],
            color=cat_data['color'],
            sort_order=cat_data['sort_order'],
            is_default=True
        )
        db.session.add(category)
    
    for cat_data in default_income_categories:
        category = Category(
            user_id=user_id,
            type='income',
            name=cat_data['name'],
            icon=cat_data['icon'],
            color=cat_data['color'],
            sort_order=cat_data['sort_order'],
            is_default=True
        )
        db.session.add(category)
    
    try:
        db.session.commit()
        print(f"✓ 用户 {user_id} 的默认分类初始化成功")
    except Exception as e:
        db.session.rollback()
        print(f"用户 {user_id} 的默认分类初始化失败: {e}")
