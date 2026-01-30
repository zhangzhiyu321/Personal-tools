"""
记账工具路由和API
"""

from flask import render_template, request, jsonify, Response, g
from datetime import datetime
from decimal import Decimal
from .database import db, Expense, Category
from . import page_blueprint, api_blueprint
from security.auth import require_auth
from security.validation import InputValidator
from security.logging import SecurityLogger
import csv
import io
from collections import defaultdict
from functools import wraps

logger = SecurityLogger()


def get_current_user_id():
    """获取当前登录用户的ID"""
    if hasattr(g, 'current_user') and g.current_user:
        user_id = g.current_user.get('id')
        if user_id:
            return user_id
    # 如果g.current_user不存在或没有id，尝试从require_auth重新获取
    # 这不应该发生，因为require_auth应该已经设置了g.current_user
    # 但为了健壮性，我们添加这个fallback
    return None


def parse_date_range(start_date=None, end_date=None):
    """解析日期范围"""
    try:
        start = datetime.strptime(start_date, '%Y-%m-%d').date() if start_date else None
    except (ValueError, TypeError):
        start = None
    try:
        end = datetime.strptime(end_date, '%Y-%m-%d').date() if end_date else None
    except (ValueError, TypeError):
        end = None
    return start, end


def handle_db_error(f):
    """数据库错误处理装饰器"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            logger.log_error(f'{f.__name__}_failed', {'error': str(e)})
            db.session.rollback()
            return jsonify({'error': f'操作失败: {str(e)}'}), 500
    return wrapper


# 支出分类配置（带图标）
EXPENSE_CATEGORIES = [
    {'id': 'food', 'name': '餐饮', 'icon': '🍔', 'color': '#FF6B6B'},
    {'id': 'transport', 'name': '交通', 'icon': '🚗', 'color': '#4ECDC4'},
    {'id': 'shopping', 'name': '购物', 'icon': '🛍️', 'color': '#FFE66D'},
    {'id': 'entertainment', 'name': '娱乐', 'icon': '🎬', 'color': '#A8E6CF'},
    {'id': 'medical', 'name': '医疗', 'icon': '🏥', 'color': '#FF8B94'},
    {'id': 'education', 'name': '教育', 'icon': '📚', 'color': '#95E1D3'},
    {'id': 'housing', 'name': '住房', 'icon': '🏠', 'color': '#F38181'},
    {'id': 'utilities', 'name': '水电', 'icon': '💡', 'color': '#AA96DA'},
    {'id': 'other', 'name': '其他', 'icon': '📦', 'color': '#C7CEEA'},
]

# 收入分类配置
INCOME_CATEGORIES = [
    {'id': 'salary', 'name': '工资', 'icon': '💰', 'color': '#51CF66'},
    {'id': 'bonus', 'name': '奖金', 'icon': '🎁', 'color': '#FFD43B'},
    {'id': 'investment', 'name': '投资', 'icon': '📈', 'color': '#74C0FC'},
    {'id': 'other_income', 'name': '其他', 'icon': '💵', 'color': '#FF8787'},
]


# ========== 页面路由 ==========

@page_blueprint.route('/')
@page_blueprint.route('')
def index():
    """记账工具首页"""
    return render_template('expense_tracker/index.html')


# ========== API 路由 ==========

@api_blueprint.route('/categories', methods=['GET'])
@require_auth
def get_categories():
    """获取分类列表（仅当前用户）"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    
    def get_cats(cat_type):
        return Category.query.filter_by(user_id=user_id, type=cat_type).order_by(Category.sort_order.desc(), Category.id).all()
    
    try:
        expense_categories, income_categories = get_cats('expense'), get_cats('income')
        if not expense_categories and not income_categories:
            from .database import init_default_categories_for_user
            try:
                init_default_categories_for_user(user_id)
                expense_categories, income_categories = get_cats('expense'), get_cats('income')
            except Exception as e:
                logger.log_error('auto_init_categories_failed', {'user_id': user_id, 'error': str(e)})
        
        return jsonify({
            'expense': [cat.to_dict() for cat in expense_categories],
            'income': [cat.to_dict() for cat in income_categories]
        })
    except Exception as e:
        logger.log_error('get_categories_failed', {'error': str(e)})
        return jsonify({'expense': EXPENSE_CATEGORIES, 'income': INCOME_CATEGORIES})


@api_blueprint.route('/categories', methods=['POST'])
@require_auth
@handle_db_error
def add_category():
    """添加分类"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    
    data = request.get_json() or {}
    schema = {
        'type': {'type': 'enum', 'required': True, 'allowed_values': ['income', 'expense']},
        'name': {'type': 'string', 'required': True, 'max_length': 50, 'sanitize': True},
        'icon': {'type': 'string', 'required': False, 'max_length': 10, 'sanitize': True},
        'color': {'type': 'string', 'required': False, 'max_length': 20, 'sanitize': True},
        'sort_order': {'type': 'int', 'required': False, 'min_value': 0, 'max_value': 1000}
    }
    
    is_valid, error_msg, cleaned_data = InputValidator.validate_json_input(data, schema)
    if not is_valid:
        logger.log_security_event('invalid_category_input', {'error': error_msg})
        return jsonify({'error': error_msg}), 400
    
    # 检查是否已有同名分类
    if Category.query.filter_by(user_id=user_id, type=cleaned_data['type'], name=cleaned_data['name']).first():
        return jsonify({'error': '该分类已存在'}), 400
    
    category = Category(
        user_id=user_id, type=cleaned_data['type'], name=cleaned_data['name'],
        icon=cleaned_data.get('icon', '📦'), color=cleaned_data.get('color', '#C7CEEA'),
        sort_order=cleaned_data.get('sort_order', 0), is_default=False
    )
    db.session.add(category)
    db.session.commit()
    
    logger.log_info('category_added', {'user_id': user_id, 'category_id': category.id})
    return jsonify({'success': True, 'category': category.to_dict()}), 201


@api_blueprint.route('/categories/<int:category_id>', methods=['PUT'])
@require_auth
@handle_db_error
def update_category(category_id):
    """更新分类（仅当前用户）"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    
    category = Category.query.filter_by(id=category_id, user_id=user_id).first_or_404()
    data = request.get_json() or {}
    
    schema = {
        'name': {'type': 'string', 'required': False, 'max_length': 50, 'sanitize': True},
        'icon': {'type': 'string', 'required': False, 'max_length': 10, 'sanitize': True},
        'color': {'type': 'string', 'required': False, 'max_length': 20, 'sanitize': True},
        'sort_order': {'type': 'int', 'required': False, 'min_value': 0, 'max_value': 1000}
    }
    
    is_valid, error_msg, cleaned_data = InputValidator.validate_json_input(data, schema)
    if not is_valid:
        logger.log_security_event('invalid_category_update_input', {'error': error_msg})
        return jsonify({'error': error_msg}), 400
    
    for field in ['name', 'icon', 'color', 'sort_order']:
        if field in cleaned_data and cleaned_data[field] is not None:
            setattr(category, field, cleaned_data[field])
    
    db.session.commit()
    logger.log_info('category_updated', {'user_id': user_id, 'category_id': category_id})
    return jsonify({'success': True, 'category': category.to_dict()})


@api_blueprint.route('/categories/<int:category_id>', methods=['DELETE'])
@require_auth
@handle_db_error
def delete_category(category_id):
    """删除分类（仅当前用户）"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    
    category = Category.query.filter_by(id=category_id, user_id=user_id).first_or_404()
    
    # 检查是否有记录使用此分类
    if Expense.query.filter_by(user_id=user_id, category=category.name).count() > 0:
        return jsonify({'error': f'该分类正在被使用，无法删除'}), 400
    
    db.session.delete(category)
    db.session.commit()
    logger.log_info('category_deleted', {'user_id': user_id, 'category_id': category_id})
    return jsonify({'success': True})


@api_blueprint.route('/records', methods=['GET'])
@require_auth
def get_records():
    """获取记账记录列表"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    
    start, end = parse_date_range(request.args.get('start_date'), request.args.get('end_date'))
    type_filter = request.args.get('type')
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = max(1, min(100, int(request.args.get('per_page', 20))))
    except (ValueError, TypeError):
        page, per_page = 1, 20
    
    query = Expense.query.filter_by(user_id=user_id)
    if start:
        query = query.filter(Expense.date >= start)
    if end:
        query = query.filter(Expense.date <= end)
    if type_filter:
        query = query.filter(Expense.type == type_filter)
    
    pagination = query.order_by(Expense.date.desc(), Expense.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    return jsonify({
        'records': [record.to_dict() for record in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
        'pages': pagination.pages
    })


@api_blueprint.route('/records', methods=['POST'])
@require_auth
@handle_db_error
def add_record():
    """添加记账记录"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    
    data = request.get_json() or {}
    schema = {
        'date': {'type': 'date', 'required': True},
        'type': {'type': 'enum', 'required': True, 'allowed_values': ['income', 'expense']},
        'category': {'type': 'string', 'required': True, 'max_length': 50, 'sanitize': True},
        'account': {'type': 'string', 'required': False, 'max_length': 50, 'sanitize': True},
        'amount': {'type': 'decimal', 'required': True, 'min_value': Decimal('0.01'), 'max_value': Decimal('999999999.99')},
        'note': {'type': 'string', 'required': False, 'max_length': 200, 'sanitize': True}
    }
    
    is_valid, error_msg, cleaned_data = InputValidator.validate_json_input(data, schema)
    if not is_valid:
        logger.log_security_event('invalid_record_input', {'error': error_msg})
        return jsonify({'error': error_msg}), 400
    
    date = datetime.strptime(cleaned_data['date'], '%Y-%m-%d').date()
    record_type = cleaned_data['type']
    category = cleaned_data['category']
    amount = cleaned_data['amount']
    
    if amount <= 0:
        return jsonify({'error': '金额必须大于0'}), 400
    
    # 验证分类是否存在
    try:
        cat_obj = Category.query.filter_by(
            id=int(category), user_id=user_id
        ).first() if category.isdigit() else Category.query.filter_by(
            name=category, type=record_type, user_id=user_id
        ).first()
        if not cat_obj:
            return jsonify({'error': f'分类不存在: {category}'}), 400
        category = cat_obj.name
    except (ValueError, TypeError):
        return jsonify({'error': f'无效的分类: {category}'}), 400
    
    expense = Expense(
        user_id=user_id, date=date, type=record_type, category=category,
        account=cleaned_data.get('account', '未关联') or '未关联',
        amount=amount, note=cleaned_data.get('note', '')
    )
    db.session.add(expense)
    db.session.commit()
    
    logger.log_info('record_added', {'record_id': expense.id, 'type': record_type})
    return jsonify({'success': True, 'record': expense.to_dict()}), 201


@api_blueprint.route('/records/<int:record_id>', methods=['GET'])
@require_auth
def get_record(record_id):
    """获取单个记账记录（仅当前用户）"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    
    expense = Expense.query.filter_by(id=record_id, user_id=user_id).first_or_404()
    return jsonify({'record': expense.to_dict()})


@api_blueprint.route('/records/<int:record_id>', methods=['PUT'])
@require_auth
@handle_db_error
def update_record(record_id):
    """更新记账记录（仅当前用户）"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    
    expense = Expense.query.filter_by(id=record_id, user_id=user_id).first_or_404()
    data = request.get_json() or {}
    
    schema = {
        'date': {'type': 'date', 'required': False},
        'type': {'type': 'enum', 'required': False, 'allowed_values': ['income', 'expense']},
        'category': {'type': 'string', 'required': False, 'max_length': 50, 'sanitize': True},
        'account': {'type': 'string', 'required': False, 'max_length': 50, 'sanitize': True},
        'amount': {'type': 'decimal', 'required': False, 'min_value': Decimal('0.01'), 'max_value': Decimal('999999999.99')},
        'note': {'type': 'string', 'required': False, 'max_length': 200, 'sanitize': True}
    }
    
    is_valid, error_msg, cleaned_data = InputValidator.validate_json_input(data, schema)
    if not is_valid:
        logger.log_security_event('invalid_record_update_input', {'error': error_msg})
        return jsonify({'error': error_msg}), 400
    
    if 'date' in data:
        expense.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    if 'type' in data:
        expense.type = data['type']
    if 'category' in data:
        category = data['category']
        try:
            cat_obj = Category.query.filter_by(
                id=int(category), user_id=user_id
            ).first() if str(category).isdigit() else Category.query.filter_by(
                name=category, type=expense.type, user_id=user_id
            ).first()
            if not cat_obj:
                return jsonify({'error': f'分类不存在: {category}'}), 400
            expense.category = cat_obj.name
        except (ValueError, TypeError):
            return jsonify({'error': f'无效的分类: {category}'}), 400
    if 'amount' in data:
        amount = Decimal(str(data['amount']))
        if amount <= 0:
            return jsonify({'error': '金额必须大于0'}), 400
        expense.amount = amount
    if 'account' in data:
        expense.account = data['account'].strip() or '未关联'
    if 'note' in data:
        expense.note = data['note'].strip()
    
    db.session.commit()
    return jsonify({'success': True, 'record': expense.to_dict()})


@api_blueprint.route('/records/<int:record_id>', methods=['DELETE'])
@require_auth
@handle_db_error
def delete_record(record_id):
    """删除记账记录（仅当前用户）"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    
    expense = Expense.query.filter_by(id=record_id, user_id=user_id).first_or_404()
    db.session.delete(expense)
    db.session.commit()
    
    logger.log_info('record_deleted', {'record_id': record_id})
    return jsonify({'success': True})


@api_blueprint.route('/statistics', methods=['GET'])
@require_auth
def get_statistics():
    """获取统计数据"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    
    start, end = parse_date_range(request.args.get('start_date'), request.args.get('end_date'))
    query = Expense.query.filter_by(user_id=user_id)
    if start:
        query = query.filter(Expense.date >= start)
    if end:
        query = query.filter(Expense.date <= end)
    
    records = query.all()
    total_income = sum(float(r.amount) for r in records if r.type == 'income')
    total_expense = sum(float(r.amount) for r in records if r.type == 'expense')
    
    # 今日支出
    today_expense = sum(float(r.amount) for r in Expense.query.filter_by(
        user_id=user_id, date=datetime.now().date(), type='expense'
    ).all())
    
    # 按分类统计支出
    expense_by_category = defaultdict(float)
    daily_stats = defaultdict(lambda: {'income': 0.0, 'expense': 0.0})
    for record in records:
        if record.type == 'expense':
            expense_by_category[record.category] += float(record.amount)
        date_str = record.date.strftime('%Y-%m-%d')
        daily_stats[date_str][record.type] += float(record.amount)
    
    daily_list = sorted([
        {'date': date, 'income': s['income'], 'expense': s['expense'],
         'balance': s['income'] - s['expense']}
        for date, s in daily_stats.items()
    ], key=lambda x: x['date'])
    
    # 分类统计
    all_categories = {cat.name: cat for cat in Category.query.filter_by(user_id=user_id).all()}
    category_list = sorted([
        {
            'category': cat_name, 'amount': amount,
            'name': all_categories[cat_name].name if cat_name in all_categories else cat_name,
            'icon': all_categories[cat_name].icon if cat_name in all_categories else '📦',
            'color': all_categories[cat_name].color if cat_name in all_categories else '#C7CEEA'
        }
        for cat_name, amount in expense_by_category.items()
    ], key=lambda x: x['amount'], reverse=True)
    
    return jsonify({
        'total_income': total_income, 'total_expense': total_expense,
        'balance': total_income - total_expense, 'today_expense': today_expense,
        'daily_stats': daily_list, 'category_stats': category_list,
        'record_count': len(records)
    })


@api_blueprint.route('/statistics/category_detail', methods=['GET'])
@require_auth
def get_category_detail():
    """获取指定分类在当前时间范围内的明细（趋势 + 记录列表）"""
    category_key = request.args.get('category')
    if not category_key:
        return jsonify({'error': '缺少分类参数 category'}), 400

    # require_auth装饰器已经验证了用户身份并设置了g.current_user
    # 如果这里user_id为None，说明g.current_user没有正确设置，这是不应该发生的
    user_id = get_current_user_id()
    if not user_id:
        # 记录错误以便调试
        logger.log_error('get_category_detail_user_id_missing', {
            'has_current_user': hasattr(g, 'current_user'),
            'current_user': str(g.current_user) if hasattr(g, 'current_user') else None,
            'path': request.path
        })
        return jsonify({'error': '需要认证', 'code': 'UNAUTHORIZED'}), 401
    
    start, end = parse_date_range(request.args.get('start_date'), request.args.get('end_date'))
    query = Expense.query.filter_by(user_id=user_id, type='expense', category=category_key)
    if start:
        query = query.filter(Expense.date >= start)
    if end:
        query = query.filter(Expense.date <= end)

    records = query.order_by(Expense.date.asc(), Expense.created_at.asc()).all()
    
    daily_amount = defaultdict(float)
    total_amount = sum(float(r.amount) for r in records)
    for r in records:
        if r.date:
            daily_amount[r.date.strftime('%Y-%m-%d')] += float(r.amount)

    daily_trend = sorted([{'date': d, 'amount': v} for d, v in daily_amount.items()], key=lambda x: x['date'])

    cat_obj = Category.query.filter_by(user_id=user_id, name=category_key, type='expense').first()
    category_info = {
        'key': category_key, 'name': cat_obj.name if cat_obj else category_key,
        'icon': cat_obj.icon if cat_obj else '📦',
        'color': cat_obj.color if cat_obj else '#C7CEEA'
    }

    return jsonify({
        'category': category_info, 'total_amount': total_amount,
        'daily_trend': daily_trend,
        'records': [{
            'id': r.id, 'date': r.date.strftime('%Y-%m-%d') if r.date else None,
            'amount': float(r.amount), 'note': r.note or '',
            'created_at': r.created_at.strftime('%Y-%m-%d %H:%M:%S') if r.created_at else None
        } for r in records]
    })


@api_blueprint.route('/statistics/others_detail', methods=['GET'], strict_slashes=False)
@require_auth
def get_others_detail():
    """获取「其他」合并分类的明细：小分类汇总 + 具体记录列表（对比分析中点击「其他」时使用）"""
    categories_param = request.args.get('categories')
    if not categories_param or not categories_param.strip():
        return jsonify({'error': '缺少参数 categories（多个分类名用英文逗号分隔）'}), 400

    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '需要认证', 'code': 'UNAUTHORIZED'}), 401

    category_names = [c.strip() for c in categories_param.split(',') if c.strip()]
    if not category_names:
        return jsonify({'error': '参数 categories 为空'}), 400

    start, end = parse_date_range(request.args.get('start_date'), request.args.get('end_date'))
    query = Expense.query.filter_by(user_id=user_id, type='expense').filter(
        Expense.category.in_(category_names)
    )
    if start:
        query = query.filter(Expense.date >= start)
    if end:
        query = query.filter(Expense.date <= end)

    records = query.order_by(Expense.date.asc(), Expense.created_at.asc()).all()
    total_amount = sum(float(r.amount) for r in records)

    # 按分类汇总（与统计接口结构一致）
    cat_amount = defaultdict(float)
    for r in records:
        cat_amount[r.category] += float(r.amount)

    all_categories = {cat.name: cat for cat in Category.query.filter_by(user_id=user_id, type='expense').all()}
    category_breakdown = sorted([
        {
            'category': cat_name, 'amount': amount,
            'name': all_categories[cat_name].name if cat_name in all_categories else cat_name,
            'icon': all_categories[cat_name].icon if cat_name in all_categories else '📦',
            'color': all_categories[cat_name].color if cat_name in all_categories else '#C7CEEA'
        }
        for cat_name, amount in cat_amount.items()
    ], key=lambda x: x['amount'], reverse=True)

    # 每条记录带上分类名称和图标，便于前端展示
    def record_category_info(cat_key):
        c = all_categories.get(cat_key)
        return (c.name if c else cat_key, c.icon if c else '📦')

    records_data = []
    for r in records:
        cat_name, cat_icon = record_category_info(r.category)
        records_data.append({
            'id': r.id,
            'date': r.date.strftime('%Y-%m-%d') if r.date else None,
            'amount': float(r.amount),
            'note': r.note or '',
            'category': r.category,
            'category_name': cat_name,
            'category_icon': cat_icon,
            'created_at': r.created_at.strftime('%Y-%m-%d %H:%M:%S') if r.created_at else None
        })

    return jsonify({
        'total_amount': total_amount,
        'category_breakdown': category_breakdown,
        'records': records_data
    })


@api_blueprint.route('/export', methods=['GET'])
@require_auth
def export_data():
    """导出数据为CSV"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    
    start, end = parse_date_range(request.args.get('start_date'), request.args.get('end_date'))
    query = Expense.query.filter_by(user_id=user_id)
    if start:
        query = query.filter(Expense.date >= start)
    if end:
        query = query.filter(Expense.date <= end)
    
    records = query.order_by(Expense.date.asc(), Expense.created_at.asc()).all()
    output = io.StringIO()
    writer = csv.writer(output, delimiter='\t')
    writer.writerow(['日期', '收支类型', '类别', '账户', '金额', '备注'])
    
    for record in records:
        writer.writerow([
            record.date.strftime('%Y年%m月%d日') if record.date else '',
            '收入' if record.type == 'income' else '支出',
            record.category,
            record.account or '未关联',
            float(record.amount),
            record.note or ''
        ])
    
    return Response(
        output.getvalue(), mimetype='text/csv; charset=utf-8-sig',
        headers={'Content-Disposition': 'attachment; filename=expense_records.csv'}
    )


@api_blueprint.route('/import', methods=['POST'])
@require_auth
@handle_db_error
def import_data():
    """导入CSV数据（仅当前用户）"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    
    if 'file' not in request.files:
        return jsonify({'error': '没有上传文件'}), 400
    
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': '文件名为空'}), 400
    
    file_content = file.stream.read()
    # 按常见程度排序：UTF-8 系列、中文 Windows/Excel、其他
    encodings = [
        'utf-8-sig', 'utf-8',
        'gbk', 'gb18030', 'gb2312', 'cp936',
        'utf-16', 'utf-16-le', 'utf-16-be',
        'big5', 'latin-1',
    ]
    decoded_content = None
    for encoding in encodings:
        try:
            decoded_content = file_content.decode(encoding)
            break
        except (UnicodeDecodeError, UnicodeError, LookupError):
            continue

    if decoded_content is None:
        return jsonify({'error': '无法识别文件编码，请用 Excel 或记事本将文件另存为 UTF-8 或 CSV(UTF-8) 后再导入'}), 400

    first_line = (decoded_content.split('\n') or [''])[0]
    delimiter = '\t' if '\t' in first_line else ','
    reader = csv.DictReader(io.StringIO(decoded_content), delimiter=delimiter)
    
    imported_count = 0
    errors = []
    
    for row_num, row in enumerate(reader, start=2):
        try:
            raw_date = (row.get('日期') or '').strip()
            if not raw_date:
                errors.append(f'第{row_num}行: 日期不能为空')
                continue
            try:
                date = datetime.strptime(raw_date, '%Y年%m月%d日').date()
            except ValueError:
                try:
                    date = datetime.strptime(raw_date, '%Y-%m-%d').date()
                except ValueError:
                    errors.append(f'第{row_num}行: 日期格式不正确')
                    continue

            type_name = (row.get('收支类型') or '').strip()
            record_type = {'收入': 'income', '支出': 'expense'}.get(type_name)
            if not record_type:
                errors.append(f'第{row_num}行: 收支类型必须是"收入"或"支出"')
                continue

            category_name = (row.get('类别') or '').strip() or '其他'
            account_name = (row.get('账户') or '').strip() or '未关联'
            
            cat = Category.query.filter_by(user_id=user_id, name=category_name, type=record_type).first()
            if not cat:
                cat = Category.query.filter_by(user_id=user_id, type=record_type, name='其他').first()
            category_name = cat.name if cat else category_name
            
            raw_amount = str(row.get('金额') or '').strip()
            if not raw_amount:
                errors.append(f'第{row_num}行: 金额不能为空')
                continue
            
            amount = Decimal(raw_amount)
            if amount <= 0:
                errors.append(f'第{row_num}行: 金额必须大于0')
                continue
            
            expense = Expense(
                user_id=user_id, date=date, type=record_type, category=category_name,
                account=account_name, amount=amount, note=(row.get('备注') or '').strip()
            )
            db.session.add(expense)
            imported_count += 1
            
        except Exception as e:
            errors.append(f'第{row_num}行: {str(e)}')
    
    db.session.commit()
    return jsonify({'success': True, 'imported': imported_count, 'errors': errors})
