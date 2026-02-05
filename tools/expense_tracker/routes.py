"""
记账工具 - 路由与 API
薄路由层：解析请求、校验、调用 service、返回响应。
"""

from flask import render_template, request, jsonify, Response, g
from datetime import datetime
from decimal import Decimal
from .database import db, Expense, Category
from . import page_blueprint, api_blueprint
from .service import (
    get_categories_for_user,
    resolve_category_name,
    get_statistics,
    get_category_detail,
    get_others_detail,
    build_export_csv,
    DEFAULT_EXPENSE_CATEGORIES,
    DEFAULT_INCOME_CATEGORIES,
)
from security.auth import require_auth
from security.validation import InputValidator
from security.logging import SecurityLogger
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
    try:
        data = get_categories_for_user(user_id)
        return jsonify(data)
    except Exception as e:
        logger.log_error('get_categories_failed', {'error': str(e)})
        return jsonify({'expense': DEFAULT_EXPENSE_CATEGORIES, 'income': DEFAULT_INCOME_CATEGORIES})


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
    amount = cleaned_data['amount']
    category_name, cat_error = resolve_category_name(user_id, record_type, cleaned_data['category'])
    if cat_error:
        return jsonify({'error': cat_error}), 400

    expense = Expense(
        user_id=user_id, date=date, type=record_type, category=category_name,
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

    if 'date' in cleaned_data:
        expense.date = datetime.strptime(cleaned_data['date'], '%Y-%m-%d').date()
    if 'type' in cleaned_data:
        expense.type = cleaned_data['type']
    if 'category' in cleaned_data:
        category_name, cat_error = resolve_category_name(
            user_id, expense.type, cleaned_data['category']
        )
        if cat_error:
            return jsonify({'error': cat_error}), 400
        expense.category = category_name
    if 'amount' in cleaned_data:
        amount = cleaned_data['amount']
        if amount <= 0:
            return jsonify({'error': '金额必须大于0'}), 400
        expense.amount = amount
    if 'account' in cleaned_data:
        expense.account = (cleaned_data['account'] or '').strip() or '未关联'
    if 'note' in cleaned_data:
        expense.note = (cleaned_data['note'] or '').strip()

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
def get_statistics_route():
    """获取统计数据"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    start, end = parse_date_range(request.args.get('start_date'), request.args.get('end_date'))
    data = get_statistics(user_id, start_date=start, end_date=end)
    return jsonify(data)


@api_blueprint.route('/statistics/category_detail', methods=['GET'])
@require_auth
def get_category_detail_route():
    """获取指定分类在当前时间范围内的明细（趋势 + 记录列表）"""
    category_key = request.args.get('category')
    if not category_key:
        return jsonify({'error': '缺少分类参数 category'}), 400
    user_id = get_current_user_id()
    if not user_id:
        logger.log_error('get_category_detail_user_id_missing', {
            'has_current_user': hasattr(g, 'current_user'),
            'path': request.path,
        })
        return jsonify({'error': '需要认证', 'code': 'UNAUTHORIZED'}), 401
    start, end = parse_date_range(request.args.get('start_date'), request.args.get('end_date'))
    data = get_category_detail(user_id, category_key, start_date=start, end_date=end)
    return jsonify(data)


@api_blueprint.route('/statistics/others_detail', methods=['GET'], strict_slashes=False)
@require_auth
def get_others_detail_route():
    """获取「其他」合并分类的明细：小分类汇总 + 具体记录列表"""
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
    data = get_others_detail(user_id, category_names, start_date=start, end_date=end)
    return jsonify(data)


@api_blueprint.route('/export', methods=['GET'])
@require_auth
def export_data():
    """导出数据为CSV"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': '未登录'}), 401
    start, end = parse_date_range(request.args.get('start_date'), request.args.get('end_date'))
    content = build_export_csv(user_id, start_date=start, end_date=end)
    return Response(
        content, mimetype='text/csv; charset=utf-8-sig',
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
