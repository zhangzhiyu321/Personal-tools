"""
记账工具路由和API
"""

from flask import render_template, request, jsonify
from datetime import datetime, timedelta
from decimal import Decimal
from .database import db, Expense, Category, init_db
from . import page_blueprint, api_blueprint
import json
import csv
import io
from collections import defaultdict


# 初始化数据库（延迟初始化）
_db_initialized = False


def ensure_db_initialized():
    """确保数据库已初始化（数据库在应用启动时已初始化，这里只做验证）"""
    global _db_initialized
    if _db_initialized:
        return
    
    from flask import current_app
    
    # 数据库应该在应用启动时已经初始化
    # 这里只做验证，如果失败则尝试初始化
    try:
        # 验证 db 是否可用（通过检查 engine 是否存在）
        if hasattr(db, 'engine') and db.engine is not None:
            _db_initialized = True
            return
    except:
        pass
    
    # 如果验证失败，尝试初始化（作为后备方案）
    try:
        init_db(current_app)
        _db_initialized = True
    except Exception as e:
        error_msg = str(e)
        # 如果是因为已经注册过，视为已初始化成功
        if 'already been registered' in error_msg:
            _db_initialized = True
            return
        print(f"数据库初始化失败: {e}")
        # 不抛出异常，允许页面显示，但API调用会失败
        raise


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
    # 延迟初始化数据库，即使失败也显示页面
    try:
        ensure_db_initialized()
    except Exception as e:
        print(f"数据库初始化警告（页面仍可显示）: {e}")
    return render_template('expense_tracker/index.html')


# ========== API 路由 ==========

@api_blueprint.route('/categories', methods=['GET'])
def get_categories():
    """获取分类列表"""
    try:
        ensure_db_initialized()
        
        # 从数据库获取分类
        expense_categories = Category.query.filter_by(type='expense').order_by(Category.sort_order, Category.id).all()
        income_categories = Category.query.filter_by(type='income').order_by(Category.sort_order, Category.id).all()
        
        return jsonify({
            'expense': [cat.to_dict() for cat in expense_categories],
            'income': [cat.to_dict() for cat in income_categories]
        })
    except Exception as e:
        # 如果数据库未初始化，返回默认分类
        return jsonify({
            'expense': EXPENSE_CATEGORIES,
            'income': INCOME_CATEGORIES
        })


@api_blueprint.route('/categories', methods=['POST'])
def add_category():
    """添加分类"""
    ensure_db_initialized()
    
    data = request.get_json()
    
    try:
        category = Category(
            type=data['type'],
            name=data['name'],
            icon=data.get('icon', '📦'),
            color=data.get('color', '#C7CEEA'),
            sort_order=data.get('sort_order', 0),
            is_default=False
        )
        
        db.session.add(category)
        db.session.commit()
        
        return jsonify({'success': True, 'category': category.to_dict()}), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'添加失败: {str(e)}'}), 500


@api_blueprint.route('/categories/<int:category_id>', methods=['PUT'])
def update_category(category_id):
    """更新分类"""
    ensure_db_initialized()
    
    category = Category.query.get_or_404(category_id)
    data = request.get_json()
    
    try:
        if 'name' in data:
            category.name = data['name']
        if 'icon' in data:
            category.icon = data['icon']
        if 'color' in data:
            category.color = data['color']
        if 'sort_order' in data:
            category.sort_order = data['sort_order']
        
        db.session.commit()
        
        return jsonify({'success': True, 'category': category.to_dict()})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'更新失败: {str(e)}'}), 500


@api_blueprint.route('/categories/<int:category_id>', methods=['DELETE'])
def delete_category(category_id):
    """删除分类"""
    ensure_db_initialized()
    
    category = Category.query.get_or_404(category_id)
    
    # 检查是否为默认分类
    if category.is_default:
        return jsonify({'error': '不能删除默认分类'}), 400
    
    # 检查是否有记录使用此分类（按名称匹配）
    category_name = category.name
    count = Expense.query.filter_by(category=category_name).count()
    if count > 0:
        return jsonify({'error': f'该分类正在被 {count} 条记录使用，无法删除'}), 400
    
    try:
        db.session.delete(category)
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'删除失败: {str(e)}'}), 500


@api_blueprint.route('/records', methods=['GET'])
def get_records():
    """获取记账记录列表"""
    try:
        ensure_db_initialized()
    except Exception as e:
        return jsonify({'error': f'数据库未初始化: {str(e)}', 'records': [], 'total': 0, 'page': 1, 'per_page': 20, 'pages': 0}), 500
    
    # 获取查询参数
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    type_filter = request.args.get('type')  # income 或 expense
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 20))
    
    # 构建查询
    query = Expense.query
    
    if start_date:
        query = query.filter(Expense.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Expense.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    if type_filter:
        query = query.filter(Expense.type == type_filter)
    
    # 排序：最新的在前
    query = query.order_by(Expense.date.desc(), Expense.created_at.desc())
    
    # 分页
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'records': [record.to_dict() for record in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
        'pages': pagination.pages
    })


@api_blueprint.route('/records', methods=['POST'])
def add_record():
    """添加记账记录"""
    ensure_db_initialized()
    
    data = request.get_json()
    
    try:
        # 验证数据
        date = datetime.strptime(data['date'], '%Y-%m-%d').date()
        record_type = data['type']  # income 或 expense
        category = data['category']
        amount = Decimal(str(data['amount']))
        note = data.get('note', '').strip()
        
        if amount <= 0:
            return jsonify({'error': '金额必须大于0'}), 400
        
        # 验证分类是否存在（如果是ID，转换为名称）
        try:
            cat_obj = Category.query.get(int(category)) if category.isdigit() else None
            if cat_obj:
                category = cat_obj.name
        except:
            pass  # 如果转换失败，使用原始值
        
        # 创建记录
        expense = Expense(
            date=date,
            type=record_type,
            category=category,  # 存储分类名称
            amount=amount,
            note=note
        )
        
        db.session.add(expense)
        db.session.commit()
        
        return jsonify({'success': True, 'record': expense.to_dict()}), 201
        
    except ValueError as e:
        return jsonify({'error': f'数据格式错误: {str(e)}'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'添加失败: {str(e)}'}), 500


@api_blueprint.route('/records/<int:record_id>', methods=['GET'])
def get_record(record_id):
    """获取单个记账记录"""
    ensure_db_initialized()
    
    expense = Expense.query.get_or_404(record_id)
    return jsonify({'record': expense.to_dict()})


@api_blueprint.route('/records/<int:record_id>', methods=['PUT'])
def update_record(record_id):
    """更新记账记录"""
    ensure_db_initialized()
    
    expense = Expense.query.get_or_404(record_id)
    data = request.get_json()
    
    try:
        if 'date' in data:
            expense.date = datetime.strptime(data['date'], '%Y-%m-%d').date()
        if 'type' in data:
            expense.type = data['type']
        if 'category' in data:
            category = data['category']
            # 验证分类是否存在（如果是ID，转换为名称）
            try:
                cat_obj = Category.query.get(int(category)) if str(category).isdigit() else None
                if cat_obj:
                    category = cat_obj.name
            except:
                pass  # 如果转换失败，使用原始值
            expense.category = category
        if 'amount' in data:
            amount = Decimal(str(data['amount']))
            if amount <= 0:
                return jsonify({'error': '金额必须大于0'}), 400
            expense.amount = amount
        if 'note' in data:
            expense.note = data['note'].strip()
        
        db.session.commit()
        
        return jsonify({'success': True, 'record': expense.to_dict()})
        
    except ValueError as e:
        return jsonify({'error': f'数据格式错误: {str(e)}'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'更新失败: {str(e)}'}), 500


@api_blueprint.route('/records/<int:record_id>', methods=['DELETE'])
def delete_record(record_id):
    """删除记账记录"""
    ensure_db_initialized()
    
    expense = Expense.query.get_or_404(record_id)
    
    try:
        db.session.delete(expense)
        db.session.commit()
        
        return jsonify({'success': True})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'删除失败: {str(e)}'}), 500


@api_blueprint.route('/statistics', methods=['GET'])
def get_statistics():
    """获取统计数据"""
    try:
        ensure_db_initialized()
    except Exception as e:
        return jsonify({
            'error': f'数据库未初始化: {str(e)}',
            'total_income': 0.0,
            'total_expense': 0.0,
            'balance': 0.0,
            'daily_stats': [],
            'category_stats': [],
            'record_count': 0
        }), 500
    
    # 获取查询参数
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    # 构建查询
    query = Expense.query
    
    if start_date:
        query = query.filter(Expense.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Expense.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    records = query.all()
    
    # 计算统计数据
    total_income = sum(float(r.amount) for r in records if r.type == 'income')
    total_expense = sum(float(r.amount) for r in records if r.type == 'expense')
    balance = total_income - total_expense
    
    # 计算当日支出（仅当没有日期筛选时，即首页统计）
    today_expense = 0.0
    if not start_date and not end_date:
        today = datetime.now().date()
        today_records = Expense.query.filter(
            Expense.date == today,
            Expense.type == 'expense'
        ).all()
        today_expense = sum(float(r.amount) for r in today_records)
    
    # 按分类统计支出
    expense_by_category = defaultdict(float)
    for record in records:
        if record.type == 'expense':
            expense_by_category[record.category] += float(record.amount)
    
    # 按日期统计（用于折线图）
    daily_stats = defaultdict(lambda: {'income': 0.0, 'expense': 0.0})
    for record in records:
        date_str = record.date.strftime('%Y-%m-%d')
        daily_stats[date_str][record.type] += float(record.amount)
    
    # 转换为列表并排序
    daily_list = sorted([
        {
            'date': date,
            'income': stats['income'],
            'expense': stats['expense'],
            'balance': stats['income'] - stats['expense']
        }
        for date, stats in daily_stats.items()
    ], key=lambda x: x['date'])
    
    # 支出分类统计（饼图数据）
    try:
        # 从数据库获取分类信息
        all_categories = {cat.name: cat for cat in Category.query.all()}
        category_list = []
        for cat_name in expense_by_category.keys():
            cat_obj = all_categories.get(cat_name)
            if cat_obj:
                category_list.append({
                    'category': cat_name,
                    'amount': expense_by_category[cat_name],
                    'name': cat_obj.name,
                    'icon': cat_obj.icon,
                    'color': cat_obj.color
                })
            else:
                category_list.append({
                    'category': cat_name,
                    'amount': expense_by_category[cat_name],
                    'name': cat_name,
                    'icon': '📦',
                    'color': '#C7CEEA'
                })
    except:
        # 如果数据库查询失败，使用默认分类
        category_list = [
            {
                'category': cat,
                'amount': expense_by_category[cat],
                'name': next((c['name'] for c in EXPENSE_CATEGORIES if c['id'] == cat), cat),
                'icon': next((c['icon'] for c in EXPENSE_CATEGORIES if c['id'] == cat), '📦'),
                'color': next((c['color'] for c in EXPENSE_CATEGORIES if c['id'] == cat), '#C7CEEA')
            }
            for cat in expense_by_category.keys()
        ]
    category_list.sort(key=lambda x: x['amount'], reverse=True)
    
    return jsonify({
        'total_income': total_income,
        'total_expense': total_expense,
        'balance': balance,
        'today_expense': today_expense,
        'daily_stats': daily_list,
        'category_stats': category_list,
        'record_count': len(records)
    })


@api_blueprint.route('/export', methods=['GET'])
def export_data():
    """导出数据为CSV"""
    ensure_db_initialized()
    
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = Expense.query
    if start_date:
        query = query.filter(Expense.date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Expense.date <= datetime.strptime(end_date, '%Y-%m-%d').date())
    
    records = query.order_by(Expense.date.desc(), Expense.created_at.desc()).all()
    
    # 创建CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # 写入表头
    writer.writerow(['日期', '类型', '分类', '金额', '备注', '创建时间'])
    
    # 写入数据
    for record in records:
        type_name = '收入' if record.type == 'income' else '支出'
        category_name = next(
            (c['name'] for c in (EXPENSE_CATEGORIES + INCOME_CATEGORIES) if c['id'] == record.category),
            record.category
        )
        writer.writerow([
            record.date.strftime('%Y-%m-%d'),
            type_name,
            category_name,
            float(record.amount),
            record.note or '',
            record.created_at.strftime('%Y-%m-%d %H:%M:%S') if record.created_at else ''
        ])
    
    from flask import Response
    return Response(
        output.getvalue(),
        mimetype='text/csv; charset=utf-8-sig',
        headers={'Content-Disposition': 'attachment; filename=expense_records.csv'}
    )


@api_blueprint.route('/import', methods=['POST'])
def import_data():
    """导入CSV数据"""
    ensure_db_initialized()
    
    if 'file' not in request.files:
        return jsonify({'error': '没有上传文件'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '文件名为空'}), 400
    
    try:
        # 读取CSV
        stream = io.StringIO(file.stream.read().decode('utf-8-sig'))
        reader = csv.DictReader(stream)
        
        imported_count = 0
        errors = []
        
        # 创建分类映射
        category_map = {}
        for cat in EXPENSE_CATEGORIES + INCOME_CATEGORIES:
            category_map[cat['name']] = cat['id']
        
        for row_num, row in enumerate(reader, start=2):  # 从第2行开始（第1行是表头）
            try:
                # 解析数据
                date = datetime.strptime(row['日期'], '%Y-%m-%d').date()
                type_name = row['类型']
                record_type = 'income' if type_name == '收入' else 'expense'
                category_name = row['分类']
                # 尝试从数据库查找分类，如果不存在则使用默认分类
                try:
                    cat = Category.query.filter_by(name=category_name, type=record_type).first()
                    if cat:
                        category_id = cat.name  # 使用分类名称
                    else:
                        # 查找默认的"其他"分类
                        default_cat = Category.query.filter_by(type=record_type, name='其他').first()
                        category_id = default_cat.name if default_cat else category_name
                except:
                    category_id = category_name
                amount = Decimal(str(row['金额']))
                note = row.get('备注', '').strip()
                
                if amount <= 0:
                    errors.append(f'第{row_num}行: 金额必须大于0')
                    continue
                
                # 创建记录
                expense = Expense(
                    date=date,
                    type=record_type,
                    category=category_id,
                    amount=amount,
                    note=note
                )
                
                db.session.add(expense)
                imported_count += 1
                
            except Exception as e:
                errors.append(f'第{row_num}行: {str(e)}')
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'imported': imported_count,
            'errors': errors
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'导入失败: {str(e)}'}), 500
