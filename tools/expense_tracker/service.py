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
    """
    汇总指定时间范围内的统计数据，一次返回全量聚合，前端零二次请求。
    返回：总收入/支出/结余、今日支出、按日明细(含分类)、按分类汇总、洞察指标。
    """
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

    # ---- 构建分类信息映射 ----
    all_categories = {c.name: c for c in Category.query.filter_by(user_id=user_id).all()}

    def cat_info(name):
        c = all_categories.get(name)
        return {
            'icon': c.icon if c else '📦',
            'color': c.color if c else '#C7CEEA',
        }

    # ---- 按日聚合（含每日分类明细） ----
    daily = defaultdict(lambda: {
        'income': 0.0, 'expense': 0.0,
        'expense_cats': defaultdict(float),
        'income_cats': defaultdict(float),
    })
    for r in records:
        date_str = r.date.strftime('%Y-%m-%d')
        amt = float(r.amount)
        daily[date_str][r.type] += amt
        daily[date_str][f'{r.type}_cats'][r.category] += amt

    daily_stats = []
    for d in sorted(daily.keys()):
        s = daily[d]
        cats = []
        for cat_name, amt in sorted(s['expense_cats'].items(), key=lambda x: -x[1]):
            info = cat_info(cat_name)
            cats.append({'name': cat_name, 'icon': info['icon'], 'color': info['color'], 'amount': round(amt, 2)})
        for cat_name, amt in sorted(s['income_cats'].items(), key=lambda x: -x[1]):
            info = cat_info(cat_name)
            cats.append({'name': cat_name, 'icon': info['icon'], 'color': info['color'], 'amount': round(amt, 2), 'type': 'income'})
        daily_stats.append({
            'date': d,
            'income': round(s['income'], 2),
            'expense': round(s['expense'], 2),
            'balance': round(s['income'] - s['expense'], 2),
            'categories': cats,
        })

    # ---- 按分类汇总 ----
    expense_by_cat = defaultdict(lambda: {'amount': 0.0, 'count': 0})
    income_by_cat = defaultdict(lambda: {'amount': 0.0, 'count': 0})
    for r in records:
        amt = float(r.amount)
        bucket = expense_by_cat if r.type == 'expense' else income_by_cat
        bucket[r.category]['amount'] += amt
        bucket[r.category]['count'] += 1

    def build_cat_list(bucket, total):
        result = []
        for cat_name in sorted(bucket, key=lambda k: -bucket[k]['amount']):
            info = cat_info(cat_name)
            amt = bucket[cat_name]['amount']
            cnt = bucket[cat_name]['count']
            num_days = len(daily) or 1
            result.append({
                'name': cat_name,
                'icon': info['icon'],
                'color': info['color'],
                'amount': round(amt, 2),
                'count': cnt,
                'avg_per_day': round(amt / num_days, 2),
                'percent': round(amt / total * 100, 1) if total > 0 else 0,
            })
        return result

    category_stats = {
        'expense': build_cat_list(expense_by_cat, total_expense),
        'income': build_cat_list(income_by_cat, total_income),
    }

    # ---- 洞察指标 ----
    num_days = len(daily) or 1
    daily_expenses = [(d, daily[d]['expense']) for d in daily if daily[d]['expense'] > 0]
    max_day = max(daily_expenses, key=lambda x: x[1]) if daily_expenses else None
    top_expense_cat = category_stats['expense'][0] if category_stats['expense'] else None

    summary = {
        'avg_daily_expense': round(total_expense / num_days, 2),
        'avg_daily_income': round(total_income / num_days, 2),
        'max_expense_day': {
            'date': max_day[0], 'amount': round(max_day[1], 2)
        } if max_day else None,
        'top_expense_category': {
            'name': top_expense_cat['name'],
            'icon': top_expense_cat['icon'],
            'amount': top_expense_cat['amount'],
        } if top_expense_cat else None,
    }

    return {
        'total_income': total_income,
        'total_expense': total_expense,
        'balance': total_income - total_expense,
        'today_expense': today_expense,
        'record_count': len(records),
        'daily_stats': daily_stats,
        'category_stats': category_stats,
        'summary': summary,
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
