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
    单次遍历完成所有聚合，避免多次循环。使用轻量 column 查询替代全 ORM 加载。
    """
    from sqlalchemy import func as sa_func

    # ---- SQL 聚合：总收入/总支出/记录数（不加载 ORM 对象） ----
    base = db.session.query(
        Expense.type,
        sa_func.coalesce(sa_func.sum(Expense.amount), 0),
        sa_func.count(Expense.id),
    ).filter(Expense.user_id == user_id)
    if start_date:
        base = base.filter(Expense.date >= start_date)
    if end_date:
        base = base.filter(Expense.date <= end_date)
    type_agg = {row[0]: (float(row[1]), int(row[2])) for row in base.group_by(Expense.type).all()}
    total_income, income_count = type_agg.get('income', (0.0, 0))
    total_expense, expense_count = type_agg.get('expense', (0.0, 0))
    record_count = income_count + expense_count

    # 今日支出（独立小查询）
    today = datetime.now().date()
    today_row = db.session.query(
        sa_func.coalesce(sa_func.sum(Expense.amount), 0)
    ).filter_by(user_id=user_id, date=today, type='expense').scalar()
    today_expense = float(today_row) if today_row else 0.0

    # ---- 仅加载需要的列（比加载整个 ORM 对象轻得多） ----
    cols_query = db.session.query(
        Expense.date, Expense.type, Expense.category, Expense.amount
    ).filter(Expense.user_id == user_id)
    if start_date:
        cols_query = cols_query.filter(Expense.date >= start_date)
    if end_date:
        cols_query = cols_query.filter(Expense.date <= end_date)
    rows = cols_query.all()

    # ---- 分类信息映射（一次查询） ----
    cat_map = {}
    for c in Category.query.filter_by(user_id=user_id).all():
        cat_map[c.name] = (c.icon, c.color)
    def cat_icon(name):
        return cat_map.get(name, ('📦', '#C7CEEA'))

    # ---- 单次遍历完成：按日聚合 + 按分类汇总 ----
    daily = defaultdict(lambda: [0.0, 0.0, defaultdict(float), defaultdict(float)])
    #                             income expense  exp_cats        inc_cats
    exp_cat = defaultdict(lambda: [0.0, 0])  # [amount, count]
    inc_cat = defaultdict(lambda: [0.0, 0])

    for r_date, r_type, r_category, r_amount in rows:
        amt = float(r_amount)
        date_str = r_date.strftime('%Y-%m-%d')
        d = daily[date_str]
        if r_type == 'expense':
            d[1] += amt
            d[2][r_category] += amt
            b = exp_cat[r_category]; b[0] += amt; b[1] += 1
        else:
            d[0] += amt
            d[3][r_category] += amt
            b = inc_cat[r_category]; b[0] += amt; b[1] += 1

    # ---- 组装 daily_stats ----
    daily_stats = []
    max_exp_date, max_exp_amt = None, 0.0
    for d in sorted(daily):
        inc, exp, ec, ic = daily[d]
        cats = []
        for cn in sorted(ec, key=ec.get, reverse=True):
            icon, color = cat_icon(cn)
            cats.append({'name': cn, 'icon': icon, 'color': color, 'amount': round(ec[cn], 2)})
        for cn in sorted(ic, key=ic.get, reverse=True):
            icon, color = cat_icon(cn)
            cats.append({'name': cn, 'icon': icon, 'color': color, 'amount': round(ic[cn], 2), 'type': 'income'})
        daily_stats.append({
            'date': d, 'income': round(inc, 2), 'expense': round(exp, 2),
            'balance': round(inc - exp, 2), 'categories': cats,
        })
        if exp > max_exp_amt:
            max_exp_amt = exp; max_exp_date = d

    # ---- 组装 category_stats ----
    num_days = len(daily) or 1
    def build_list(bucket, total):
        items = sorted(bucket.items(), key=lambda x: -x[1][0])
        return [{
            'name': cn, 'icon': cat_icon(cn)[0], 'color': cat_icon(cn)[1],
            'amount': round(a, 2), 'count': n,
            'avg_per_day': round(a / num_days, 2),
            'percent': round(a / total * 100, 1) if total > 0 else 0,
        } for cn, (a, n) in items]

    category_stats = {
        'expense': build_list(exp_cat, total_expense),
        'income': build_list(inc_cat, total_income),
    }
    top_ec = category_stats['expense'][0] if category_stats['expense'] else None

    return {
        'total_income': total_income,
        'total_expense': total_expense,
        'balance': total_income - total_expense,
        'today_expense': today_expense,
        'record_count': record_count,
        'daily_stats': daily_stats,
        'category_stats': category_stats,
        'summary': {
            'avg_daily_expense': round(total_expense / num_days, 2),
            'avg_daily_income': round(total_income / num_days, 2),
            'max_expense_day': {'date': max_exp_date, 'amount': round(max_exp_amt, 2)} if max_exp_date else None,
            'top_expense_category': {'name': top_ec['name'], 'icon': top_ec['icon'], 'amount': top_ec['amount']} if top_ec else None,
        },
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
