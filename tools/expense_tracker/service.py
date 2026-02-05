"""
记账工具 - 业务逻辑层
负责统计、分类解析、导出/导入等，与路由解耦便于测试与扩展。
"""

from datetime import datetime
from decimal import Decimal
from collections import defaultdict
import csv
import io

from .database import db, Expense, Category


# 默认分类（API 异常时的 fallback，与 database.init_default_categories_for_user 一致）
DEFAULT_EXPENSE_CATEGORIES = [
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
DEFAULT_INCOME_CATEGORIES = [
    {'id': 'salary', 'name': '工资', 'icon': '💰', 'color': '#51CF66'},
    {'id': 'bonus', 'name': '奖金', 'icon': '🎁', 'color': '#FFD43B'},
    {'id': 'investment', 'name': '投资', 'icon': '📈', 'color': '#74C0FC'},
    {'id': 'other_income', 'name': '其他', 'icon': '💵', 'color': '#FF8787'},
]


def get_categories_for_user(user_id):
    """获取用户支出/收入分类，若为空则先初始化默认分类。"""
    def by_type(cat_type):
        return Category.query.filter_by(
            user_id=user_id, type=cat_type
        ).order_by(Category.sort_order.desc(), Category.id).all()

    expense_cats = by_type('expense')
    income_cats = by_type('income')
    if not expense_cats and not income_cats:
        from .database import init_default_categories_for_user
        init_default_categories_for_user(user_id)
        expense_cats = by_type('expense')
        income_cats = by_type('income')
    return {
        'expense': [c.to_dict() for c in expense_cats],
        'income': [c.to_dict() for c in income_cats],
    }


def resolve_category_name(user_id, record_type, category_value):
    """
    将前端传入的分类（id 或 name）解析为数据库中的分类名称。
    返回 (name, error_message)；成功时 error_message 为 None。
    """
    if not category_value:
        return None, '分类不能为空'
    try:
        if str(category_value).isdigit():
            cat = Category.query.filter_by(
                id=int(category_value), user_id=user_id
            ).first()
        else:
            cat = Category.query.filter_by(
                name=category_value.strip(), type=record_type, user_id=user_id
            ).first()
        if not cat:
            return None, f'分类不存在: {category_value}'
        return cat.name, None
    except (ValueError, TypeError):
        return None, f'无效的分类: {category_value}'


def get_statistics(user_id, start_date=None, end_date=None):
    """汇总指定时间范围内的收入/支出/结余、今日支出、按日统计、按分类统计。"""
    query = Expense.query.filter_by(user_id=user_id)
    if start_date:
        query = query.filter(Expense.date >= start_date)
    if end_date:
        query = query.filter(Expense.date <= end_date)
    records = query.all()

    total_income = sum(float(r.amount) for r in records if r.type == 'income')
    total_expense = sum(float(r.amount) for r in records if r.type == 'expense')
    today = datetime.now().date()
    today_expense = sum(
        float(r.amount) for r in Expense.query.filter_by(
            user_id=user_id, date=today, type='expense'
        ).all()
    )

    expense_by_category = defaultdict(float)
    daily_stats = defaultdict(lambda: {'income': 0.0, 'expense': 0.0})
    for r in records:
        if r.type == 'expense':
            expense_by_category[r.category] += float(r.amount)
        date_str = r.date.strftime('%Y-%m-%d')
        daily_stats[date_str][r.type] += float(r.amount)

    daily_list = sorted(
        [
            {'date': d, 'income': s['income'], 'expense': s['expense'],
             'balance': s['income'] - s['expense']}
            for d, s in daily_stats.items()
        ],
        key=lambda x: x['date']
    )

    all_categories = {c.name: c for c in Category.query.filter_by(user_id=user_id).all()}
    category_list = sorted(
        [
            {
                'category': cat_name,
                'amount': amount,
                'name': all_categories[cat_name].name if cat_name in all_categories else cat_name,
                'icon': all_categories[cat_name].icon if cat_name in all_categories else '📦',
                'color': all_categories[cat_name].color if cat_name in all_categories else '#C7CEEA',
            }
            for cat_name, amount in expense_by_category.items()
        ],
        key=lambda x: x['amount'],
        reverse=True,
    )

    return {
        'total_income': total_income,
        'total_expense': total_expense,
        'balance': total_income - total_expense,
        'today_expense': today_expense,
        'daily_stats': daily_list,
        'category_stats': category_list,
        'record_count': len(records),
    }


def get_category_detail(user_id, category_key, start_date=None, end_date=None):
    """指定分类在时间范围内的明细：日趋势 + 记录列表。"""
    query = Expense.query.filter_by(
        user_id=user_id, type='expense', category=category_key
    )
    if start_date:
        query = query.filter(Expense.date >= start_date)
    if end_date:
        query = query.filter(Expense.date <= end_date)
    records = query.order_by(Expense.date.asc(), Expense.created_at.asc()).all()

    daily_amount = defaultdict(float)
    for r in records:
        if r.date:
            daily_amount[r.date.strftime('%Y-%m-%d')] += float(r.amount)
    daily_trend = sorted(
        [{'date': d, 'amount': v} for d, v in daily_amount.items()],
        key=lambda x: x['date']
    )

    cat_obj = Category.query.filter_by(
        user_id=user_id, name=category_key, type='expense'
    ).first()
    category_info = {
        'key': category_key,
        'name': cat_obj.name if cat_obj else category_key,
        'icon': cat_obj.icon if cat_obj else '📦',
        'color': cat_obj.color if cat_obj else '#C7CEEA',
    }

    return {
        'category': category_info,
        'total_amount': sum(float(r.amount) for r in records),
        'daily_trend': daily_trend,
        'records': [
            {
                'id': r.id,
                'date': r.date.strftime('%Y-%m-%d') if r.date else None,
                'amount': float(r.amount),
                'note': r.note or '',
                'created_at': r.created_at.strftime('%Y-%m-%d %H:%M:%S') if r.created_at else None,
            }
            for r in records
        ],
    }


def get_others_detail(user_id, category_names, start_date=None, end_date=None):
    """多个分类合并的「其他」明细：按分类汇总 + 记录列表。"""
    if not category_names:
        return None
    query = Expense.query.filter_by(user_id=user_id, type='expense').filter(
        Expense.category.in_(category_names)
    )
    if start_date:
        query = query.filter(Expense.date >= start_date)
    if end_date:
        query = query.filter(Expense.date <= end_date)
    records = query.order_by(Expense.date.asc(), Expense.created_at.asc()).all()

    cat_amount = defaultdict(float)
    for r in records:
        cat_amount[r.category] += float(r.amount)
    all_cats = {c.name: c for c in Category.query.filter_by(user_id=user_id, type='expense').all()}
    category_breakdown = sorted(
        [
            {
                'category': cat_name,
                'amount': amount,
                'name': all_cats[cat_name].name if cat_name in all_cats else cat_name,
                'icon': all_cats[cat_name].icon if cat_name in all_cats else '📦',
                'color': all_cats[cat_name].color if cat_name in all_cats else '#C7CEEA',
            }
            for cat_name, amount in cat_amount.items()
        ],
        key=lambda x: x['amount'],
        reverse=True,
    )

    def record_cat_info(cat_key):
        c = all_cats.get(cat_key)
        return (c.name if c else cat_key, c.icon if c else '📦')

    records_data = [
        {
            'id': r.id,
            'date': r.date.strftime('%Y-%m-%d') if r.date else None,
            'amount': float(r.amount),
            'note': r.note or '',
            'category': r.category,
            'category_name': record_cat_info(r.category)[0],
            'category_icon': record_cat_info(r.category)[1],
            'created_at': r.created_at.strftime('%Y-%m-%d %H:%M:%S') if r.created_at else None,
        }
        for r in records
    ]

    return {
        'total_amount': sum(float(r.amount) for r in records),
        'category_breakdown': category_breakdown,
        'records': records_data,
    }


def build_export_csv(user_id, start_date=None, end_date=None):
    """生成导出用的 CSV 内容（TSV 格式，UTF-8-sig）。"""
    query = Expense.query.filter_by(user_id=user_id)
    if start_date:
        query = query.filter(Expense.date >= start_date)
    if end_date:
        query = query.filter(Expense.date <= end_date)
    records = query.order_by(Expense.date.asc(), Expense.created_at.asc()).all()

    output = io.StringIO()
    writer = csv.writer(output, delimiter='\t')
    writer.writerow(['日期', '收支类型', '类别', '账户', '金额', '备注'])
    for r in records:
        writer.writerow([
            r.date.strftime('%Y年%m月%d日') if r.date else '',
            '收入' if r.type == 'income' else '支出',
            r.category,
            r.account or '未关联',
            float(r.amount),
            r.note or '',
        ])
    return output.getvalue()
