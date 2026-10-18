"""
数据表分享路由模块
处理表级分享链接的创建、管理和访问
"""
from flask import Blueprint, request, g

from app.models.table import Table
from app.models.table_share import TableShare
from app.services.base_service import BaseService
from app.services.table_share_service import TableShareService
from app.models.base import MemberRole
from app.utils.decorators import jwt_required
from app.utils.response import (
    success_response, error_response, not_found_response,
    forbidden_response
)

table_shares_bp = Blueprint('table_shares', __name__)
table_shares_bp.strict_slashes = False


@table_shares_bp.route('/tables/<uuid:table_id>/shares', methods=['POST'])
@jwt_required
def create_table_share(table_id) -> tuple:
    """
    创建数据表分享链接
    ---
    tags:
      - Table Shares
    security:
      - Bearer: []
    parameters:
      - name: table_id
        in: path
        type: string
        required: true
        description: 数据表 ID
      - name: body
        in: body
        required: true
        schema:
          type: object
          required:
            - permission
          properties:
            permission:
              type: string
              enum: ['editor', 'commenter', 'viewer']
              description: 分享权限
            view_scope:
              type: string
              enum: ['all', 'specified']
              description: 可见视图范围
            view_ids:
              type: array
              description: 指定可见的视图 ID 列表（view_scope=specified 时必填）
            expires_at:
              type: integer
              description: 过期时间（Unix 时间戳，可选）
    responses:
      201:
        description: 创建的分享信息
    """
    user_id = g.current_user_id

    table = Table.query.filter_by(id=table_id).first()
    if not table:
        return not_found_response('table')

    # 检查权限（需要 ADMIN 或更高权限）
    if not BaseService.check_permission(str(table.base_id), user_id, MemberRole.ADMIN):
        return forbidden_response('do_not_permission_create_share_link')

    data = request.get_json() or {}
    result = TableShareService.create_share(str(table_id), user_id, data)

    if not result['success']:
        status_code = result.get('status', 400)
        if status_code == 404:
            return not_found_response('table')
        return error_response(result['error'], code=status_code)

    return success_response(
        data=result['share'].to_dict(),
        message='share_link_created_successfully',
        code=201
    )


@table_shares_bp.route('/tables/<uuid:table_id>/shares', methods=['GET'])
@jwt_required
def get_table_shares(table_id) -> tuple:
    """
    获取数据表的所有分享链接列表
    ---
    tags:
      - Table Shares
    security:
      - Bearer: []
    parameters:
      - name: table_id
        in: path
        type: string
        required: true
        description: 数据表 ID
    responses:
      200:
        description: 分享链接列表
    """
    user_id = g.current_user_id

    table = Table.query.filter_by(id=table_id).first()
    if not table:
        return not_found_response('table')

    # 检查权限（需要 ADMIN 或更高权限）
    if not BaseService.check_permission(str(table.base_id), user_id, MemberRole.ADMIN):
        return forbidden_response('do_not_permission_view_share_list')

    shares = TableShareService.get_shares_by_table(str(table_id))
    shares_data = [share.to_dict() for share in shares]

    return success_response(
        data=shares_data,
        message='fetched_share_list_successfully'
    )


@table_shares_bp.route('/table-shares/<uuid:share_id>', methods=['PUT', 'DELETE'])
@jwt_required
def handle_table_share(share_id) -> tuple:
    """
    处理数据表分享链接操作（更新/删除）
    ---
    tags:
      - Table Shares
    security:
      - Bearer: []
    parameters:
      - name: share_id
        in: path
        type: string
        required: true
        description: 分享 ID
      - name: body
        in: body
        schema:
          type: object
          properties:
            is_active:
              type: boolean
              description: 是否激活
            permission:
              type: string
              enum: ['editor', 'commenter', 'viewer']
              description: 权限级别
            view_scope:
              type: string
              enum: ['all', 'specified']
              description: 可见视图范围
            view_ids:
              type: array
              description: 指定可见的视图 ID 列表
            expires_at:
              type: integer
              description: 过期时间（Unix 时间戳）
    responses:
      200:
        description: 操作成功
      403:
        description: 无权限
      404:
        description: 分享链接不存在
    """
    user_id = g.current_user_id

    # 查找分享并检查权限
    # 使用 filter_by 替代 query.get 以兼容 CompatUUID 类型
    share = TableShare.query.filter_by(id=share_id).first()
    if not share:
        return not_found_response('share_link')

    base_id = share.table.base_id if share.table else None
    if not base_id:
        return not_found_response('table')

    if request.method == 'PUT':
        # 更新分享链接
        if not BaseService.check_permission(str(base_id), user_id, MemberRole.ADMIN):
            return forbidden_response('do_not_permission_update_share_link')

        data = request.get_json() or {}
        result = TableShareService.update_share(str(share_id), user_id, data)

        if not result['success']:
            status_code = result.get('status', 400)
            if status_code == 404:
                return not_found_response('share_link')
            return error_response(result['error'], code=status_code)

        return success_response(
            data=result['share'].to_dict(),
            message='share_link_updated_successfully'
        )

    elif request.method == 'DELETE':
        # 删除分享链接
        if not BaseService.check_permission(str(base_id), user_id, MemberRole.ADMIN):
            return forbidden_response('do_not_permission_delete_share_link')

        result = TableShareService.delete_share(str(share_id))

        if not result['success']:
            status_code = result.get('status', 400)
            if status_code == 404:
                return not_found_response('share_link')
            return error_response(result['error'], code=status_code)

        return success_response(message='share_link_deleted_successfully')


@table_shares_bp.route('/table-shares/<uuid:share_id>/members', methods=['GET'])
@jwt_required
def get_table_share_members(share_id) -> tuple:
    """
    获取数据表分享的成员列表
    ---
    tags:
      - Table Shares
    security:
      - Bearer: []
    parameters:
      - name: share_id
        in: path
        type: string
        required: true
        description: 分享 ID
    responses:
      200:
        description: 成员列表
      403:
        description: 无权限
      404:
        description: 分享链接不存在
    """
    user_id = g.current_user_id

    share = TableShare.query.filter_by(id=share_id).first()
    if not share:
        return not_found_response('share_link')

    base_id = share.table.base_id if share.table else None
    if not base_id:
        return not_found_response('table')

    # 检查权限（需要 ADMIN 或更高权限）
    if not BaseService.check_permission(str(base_id), user_id, MemberRole.ADMIN):
        return forbidden_response('do_not_permission_view_share_list')

    members = TableShareService.get_share_members(str(share_id))

    return success_response(
        data=members,
        message='fetched_share_member_list_successfully'
    )


@table_shares_bp.route('/table-shares/<uuid:share_id>/members/<uuid:user_id>', methods=['DELETE'])
@jwt_required
def remove_table_share_member(share_id, user_id) -> tuple:
    """
    将用户从数据表分享成员中移除（回收其对该表的分享访问权限）
    ---
    tags:
      - Table Shares
    security:
      - Bearer: []
    parameters:
      - name: share_id
        in: path
        type: string
        required: true
        description: 分享 ID
      - name: user_id
        in: path
        type: string
        required: true
        description: 要移除的用户 ID
    responses:
      200:
        description: 移除成功
      400:
        description: 不能移除自己
      403:
        description: 无权限
      404:
        description: 分享链接不存在或该用户不在成员列表中
    """
    operator_id = g.current_user_id

    share = TableShare.query.filter_by(id=share_id).first()
    if not share:
        return not_found_response('share_link')

    base_id = share.table.base_id if share.table else None
    if not base_id:
        return not_found_response('table')

    # 检查权限（需要 ADMIN 或更高权限）
    if not BaseService.check_permission(str(base_id), operator_id, MemberRole.ADMIN):
        return forbidden_response('do_not_permission_remove_members')

    result = TableShareService.remove_share_member(str(share_id), str(user_id), str(operator_id))

    if not result['success']:
        status_code = result.get('status', 400)
        if status_code == 404 and result['error'] == 'share_link_does_not_exist':
            return not_found_response('share_link')
        return error_response(result['error'], code=status_code)

    return success_response(message='table_share_member_removed_successfully')


@table_shares_bp.route('/table-shares/shared-with-me', methods=['GET'])
@jwt_required
def get_table_shares_shared_with_me() -> tuple:
    """
    获取当前用户通过表分享加入的数据表列表
    ---
    tags:
      - Table Shares
    security:
      - Bearer: []
    responses:
      200:
        description: 表分享列表（含表格与所属 Base 信息，按表格更新时间倒序）
    """
    user_id = g.current_user_id

    data = TableShareService.get_shared_tables_for_user(str(user_id))

    return success_response(
        data=data,
        message='fetched_table_shares_shared_successfully'
    )


@table_shares_bp.route('/share/table/<share_token>', methods=['GET'])
def access_table_share(share_token) -> tuple:
    """
    通过分享令牌访问数据表（公开接口，无需登录）
    ---
    tags:
      - Table Shares
    parameters:
      - name: share_token
        in: path
        type: string
        required: true
        description: 分享令牌
    responses:
      200:
        description: 数据表信息和访问权限
      403:
        description: 分享链接已禁用或过期
      404:
        description: 分享链接不存在
    """
    result = TableShareService.access_share(share_token)

    if not result['success']:
        status_code = result.get('status', 404)
        if status_code == 403:
            return error_response(result['error'], code=403)
        return not_found_response('share_link')

    table = result['table']
    base = result['base']
    share = result['share']

    table_data = {
        'id': str(table.id),
        'name': table.name,
        'description': table.description
    }
    if not table_data['description']:
        table_data.pop('description')

    return success_response(
        data={
            'table': table_data,
            'base': {
                'id': str(base.id),
                'name': base.name,
                'color': base.color,
                'icon': base.icon
            },
            'permission': share.permission.value if hasattr(share.permission, 'value') else str(share.permission),
            'view_scope': share.view_scope,
            'views': [
                {
                    'id': str(view.id),
                    'name': view.name,
                    'type': view.type.value if hasattr(view.type, 'value') else str(view.type)
                }
                for view in result['views']
            ]
        },
        message='access_succeeded'
    )


@table_shares_bp.route('/share/table/<share_token>/join', methods=['POST'])
@jwt_required
def join_table_share(share_token) -> tuple:
    """
    通过分享令牌加入数据表（需登录）
    ---
    tags:
      - Table Shares
    security:
      - Bearer: []
    parameters:
      - name: share_token
        in: path
        type: string
        required: true
        description: 分享令牌
    responses:
      200:
        description: 加入结果（restricted 标识是否为纯表分享用户）
      403:
        description: 分享链接已禁用或过期
      404:
        description: 分享链接不存在
    """
    user_id = g.current_user_id

    result = TableShareService.join_share(share_token, user_id)

    if not result['success']:
        status_code = result.get('status', 404)
        if status_code == 403:
            return error_response(result['error'], code=403)
        return not_found_response('share_link')

    data = {
        'restricted': result['restricted'],
        'role': result['role']
    }
    if result['restricted']:
        data.update({
            'table_id': result['table_id'],
            'base_id': result['base_id'],
            'view_scope': result['view_scope'],
            'view_ids': result['view_ids']
        })

    return success_response(
        data=data,
        message='joined_table_successfully'
    )
