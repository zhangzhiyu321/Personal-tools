"""
认证路由
提供登录、登出、修改密码等API
"""

from flask import Blueprint, request, jsonify, g
from .auth import AuthManager, authenticate_user, require_auth
from .validation import InputValidator
from . import security_logger as logger

# 创建认证Blueprint
auth_blueprint = Blueprint('auth', __name__, url_prefix='/api/auth')


@auth_blueprint.route('/login', methods=['POST'])
def login():
    """用户登录"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': '请求数据不能为空'}), 400
        
        # 输入验证
        schema = {
            'username': {'type': 'string', 'required': True, 'max_length': 50, 'sanitize': True},
            'password': {'type': 'string', 'required': True, 'max_length': 100, 'sanitize': False}
        }
        
        is_valid, error_msg, cleaned_data = InputValidator.validate_json_input(data, schema)
        if not is_valid:
            try:
                logger.log_security_event('invalid_login_attempt', {'error': error_msg})
            except:
                pass  # 日志失败不影响登录流程
            return jsonify({'error': error_msg}), 400
        
        username = cleaned_data['username']
        password = cleaned_data['password']
        
        # 验证用户
        user = authenticate_user(username, password)
        if not user:
            return jsonify({'error': '用户名或密码错误'}), 401
        
        # 生成令牌
        token = AuthManager.generate_token(
            user_id=user.get('id'),
            username=username,
            is_admin=user.get('is_admin', False)
        )
        
        return jsonify({
            'success': True,
            'token': token,
            'user_id': user.get('id'),
            'username': username,
            'is_admin': user.get('is_admin', False)
        })
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        try:
            logger.log_error('login_exception', {'error': str(e), 'traceback': error_detail})
        except:
            pass
        return jsonify({'error': '登录失败，请稍后重试', 'detail': str(e)}), 500


@auth_blueprint.route('/logout', methods=['POST'])
@require_auth
def logout():
    """用户登出"""
    logger.log_info('user_logout', {'username': g.current_user.get('username')})
    return jsonify({'success': True, 'message': '已登出'})


@auth_blueprint.route('/verify', methods=['GET'])
@require_auth
def verify_token():
    """验证令牌"""
    try:
        user_info = g.current_user
        if not user_info:
            return jsonify({'error': '用户信息不存在', 'code': 'UNAUTHORIZED'}), 401
        
        return jsonify({
            'valid': True,
            'user_id': user_info.get('id'),
            'username': user_info.get('username'),
            'is_admin': user_info.get('is_admin', False)
        })
    except Exception as e:
        logger.log_error('verify_token_exception', {'error': str(e)})
        return jsonify({'error': '验证失败', 'code': 'INTERNAL_ERROR'}), 500


@auth_blueprint.route('/change-password', methods=['POST'])
@require_auth
def change_password():
    """修改密码"""
    data = request.get_json()
    
    schema = {
        'old_password': {'type': 'string', 'required': True, 'max_length': 100, 'sanitize': False},
        'new_password': {'type': 'string', 'required': True, 'max_length': 100, 'sanitize': False}
    }
    
    is_valid, error_msg, cleaned_data = InputValidator.validate_json_input(data or {}, schema)
    if not is_valid:
        return jsonify({'error': error_msg}), 400
    
    # 从数据库获取用户
    from .models import UserManager
    user_id = g.current_user.get('id')
    user = UserManager.get_user_by_id(user_id)
    
    if not user:
        return jsonify({'error': '用户不存在'}), 404
    
    # 修改密码
    try:
        success = UserManager.change_password(user, cleaned_data['old_password'], cleaned_data['new_password'])
        if not success:
            logger.log_security_event('password_change_failed', {'user_id': user_id, 'reason': '旧密码错误'})
            return jsonify({'error': '旧密码错误'}), 400
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    
    logger.log_info('password_changed', {'user_id': user_id, 'username': user.username})
    return jsonify({'success': True, 'message': '密码修改成功'})


@auth_blueprint.route('/register', methods=['POST'])
def register():
    """用户注册"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': '请求数据不能为空'}), 400
        
        # 输入验证
        schema = {
            'username': {'type': 'string', 'required': True, 'max_length': 50, 'sanitize': True},
            'password': {'type': 'string', 'required': True, 'max_length': 100, 'sanitize': False}
        }
        
        is_valid, error_msg, cleaned_data = InputValidator.validate_json_input(data, schema)
        if not is_valid:
            try:
                logger.log_security_event('invalid_register_attempt', {'error': error_msg})
            except:
                pass
            return jsonify({'error': error_msg}), 400
        
        username = cleaned_data['username']
        password = cleaned_data['password']
        
        # 验证密码强度
        if len(password) < 8:
            return jsonify({'error': '密码长度至少8位'}), 400
        
        # 创建用户
        from .models import UserManager
        from tools.expense_tracker.database import init_default_categories_for_user
        
        user = UserManager.create_user(username, password, is_admin=False)
        
        # 为新用户初始化默认分类
        try:
            init_default_categories_for_user(user.id)
        except Exception as e:
            logger.log_warning('category_init_failed', {'user_id': user.id, 'error': str(e)})
        
        logger.log_info('user_registered', {'user_id': user.id, 'username': username})
        
        return jsonify({
            'success': True,
            'message': '注册成功',
            'user_id': user.id,
            'username': username
        }), 201
        
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        try:
            logger.log_error('register_exception', {'error': str(e), 'traceback': error_detail})
        except:
            pass
        return jsonify({'error': '注册失败，请稍后重试', 'detail': str(e)}), 500


# 注意：默认管理员初始化在数据库初始化时进行（见app.py）
