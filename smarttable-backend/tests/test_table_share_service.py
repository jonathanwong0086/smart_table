"""
数据表分享（TableShare）功能测试
覆盖：分享创建校验、join_share 幂等与成员区分、角色映射、权限接入（路由级）
"""
import uuid

from app.extensions import db
from app.i18n import translate
from app.models import User, Table, View
from app.models.base import BaseMember, MemberRole
from app.models.field import FieldType
from app.models.field import Field
from app.models.table_share import TableShare, TableShareMember
from app.services.table_share_service import TableShareService


def _make_user(email='shareuser@example.com', name='分享用户'):
    user = User(email=email, name=name)
    user.set_password('Test1234!')
    db.session.add(user)
    db.session.commit()
    db.session.refresh(user)
    return user


def _login(client, email, password='Test1234!'):
    response = client.post('/api/auth/login', json={
        'email': email,
        'password': password,
        'captcha': 'TEST'
    })
    data = response.get_json()
    tokens = data.get('data', {}).get('tokens', {})
    access_token = tokens.get('access_token', data.get('data', {}).get('access_token'))
    return {'Authorization': f'Bearer {access_token}'}


def _make_view(table, name='视图', order=0):
    from app.models.view import ViewType
    view = View(
        table_id=table.id,
        name=name,
        type=ViewType.TABLE.value,
        order=order
    )
    db.session.add(view)
    db.session.commit()
    db.session.refresh(view)
    return view


def _create_share(client, auth_headers, table_id, **payload):
    data = {'permission': 'viewer'}
    data.update(payload)
    return client.post(
        f'/api/tables/{table_id}/shares',
        json=data,
        headers=auth_headers,
    )


class TestTableShareService:
    """TableShareService 服务层测试"""

    def test_create_share_invalid_permission(self, app, test_table, test_user):
        """非法 permission 返回 invalid_share_permission"""
        with app.app_context():
            result = TableShareService.create_share(
                str(test_table.id), str(test_user.id), {'permission': 'owner'}
            )
            assert result['success'] is False
            assert result['error'] == 'invalid_share_permission'

    def test_create_share_specified_empty_view_ids(self, app, test_table, test_user):
        """specified 范围但 view_ids 为空返回 invalid_view_selection"""
        with app.app_context():
            result = TableShareService.create_share(
                str(test_table.id), str(test_user.id),
                {'permission': 'viewer', 'view_scope': 'specified', 'view_ids': []}
            )
            assert result['success'] is False
            assert result['error'] == 'invalid_view_selection'

    def test_create_share_view_ids_from_other_table(self, app, test_base, test_table, test_user):
        """view_ids 包含他表视图返回 invalid_view_selection"""
        with app.app_context():
            other_table = Table(base_id=test_base.id, name='其他表', order=1)
            db.session.add(other_table)
            db.session.commit()
            other_view = _make_view(other_table, '他表视图')

            result = TableShareService.create_share(
                str(test_table.id), str(test_user.id),
                {'permission': 'viewer', 'view_scope': 'specified',
                 'view_ids': [str(other_view.id)]}
            )
            assert result['success'] is False
            assert result['error'] == 'invalid_view_selection'

    def test_create_share_success(self, app, test_table, test_user, test_view):
        """合法参数创建成功"""
        with app.app_context():
            result = TableShareService.create_share(
                str(test_table.id), str(test_user.id),
                {'permission': 'editor', 'view_scope': 'specified',
                 'view_ids': [str(test_view.id)]}
            )
            assert result['success'] is True
            assert result['share'].share_token
            assert result['share'].permission.value == 'editor'
            assert result['share'].view_ids == [str(test_view.id)]

    def test_create_share_expires_at_past(self, app, test_table, test_user):
        """过期时间为过去时间返回错误"""
        with app.app_context():
            result = TableShareService.create_share(
                str(test_table.id), str(test_user.id),
                {'permission': 'viewer', 'expires_at': 1000000000}
            )
            assert result['success'] is False

    def test_join_share_new_user_idempotent(self, app, test_table, test_user, test_view):
        """新用户加入：首次记录成员，重复加入不重复记录"""
        with app.app_context():
            share = TableShareService.create_share(
                str(test_table.id), str(test_user.id), {'permission': 'commenter'}
            )['share']
            newcomer = _make_user()

            first = TableShareService.join_share(share.share_token, str(newcomer.id))
            assert first['success'] is True
            assert first['restricted'] is True
            assert first['role'] == 'commenter'
            assert first['table_id'] == str(test_table.id)
            assert first['base_id'] == str(test_table.base_id)

            # 重复 join 不重复记录
            TableShareService.join_share(share.share_token, str(newcomer.id))
            members = TableShareMember.query.filter_by(
                share_id=share.id, user_id=newcomer.id
            ).all()
            assert len(members) == 1

    def test_join_share_base_member_not_restricted(self, app, test_base, test_table, test_user, test_view):
        """已是 Base 成员的用户 join 返回 restricted=False 且不加表分享成员"""
        with app.app_context():
            member_user = _make_user('basemember@example.com', '基础成员')
            db.session.add(BaseMember(
                base_id=test_base.id, user_id=member_user.id, role=MemberRole.EDITOR
            ))
            db.session.commit()

            share = TableShareService.create_share(
                str(test_table.id), str(test_user.id), {'permission': 'viewer'}
            )['share']

            result = TableShareService.join_share(share.share_token, str(member_user.id))
            assert result['success'] is True
            assert result['restricted'] is False
            assert result['role'] == 'editor'
            assert TableShareMember.query.filter_by(share_id=share.id).count() == 0

    def test_get_members_role_mapping(self, app, test_table, test_user, test_view):
        """角色映射与多条分享取最高权限"""
        with app.app_context():
            user = _make_user('roleuser@example.com', '角色用户')
            assert TableShareService.get_members_role(str(test_table.id), str(user.id)) is None

            share_v = TableShareService.create_share(
                str(test_table.id), str(test_user.id), {'permission': 'viewer'}
            )['share']
            TableShareService.join_share(share_v.share_token, str(user.id))
            assert TableShareService.get_members_role(str(test_table.id), str(user.id)) == 'viewer'

            share_e = TableShareService.create_share(
                str(test_table.id), str(test_user.id), {'permission': 'editor'}
            )['share']
            TableShareService.join_share(share_e.share_token, str(user.id))
            # 两条分享命中时取最高权限 editor
            assert TableShareService.get_members_role(str(test_table.id), str(user.id)) == 'editor'

    def test_is_share_only_user(self, app, test_base, test_table, test_user, test_view):
        """不在 base_members 但命中表分享 → True；Base 成员 → False"""
        with app.app_context():
            user = _make_user('onlyuser@example.com', '纯分享用户')
            assert TableShareService.is_share_only_user(str(test_base.id), str(user.id)) is False

            share = TableShareService.create_share(
                str(test_table.id), str(test_user.id), {'permission': 'viewer'}
            )['share']
            TableShareService.join_share(share.share_token, str(user.id))
            assert TableShareService.is_share_only_user(str(test_base.id), str(user.id)) is True

            # Base 成员 → False
            db.session.add(BaseMember(
                base_id=test_base.id, user_id=user.id, role=MemberRole.VIEWER
            ))
            db.session.commit()
            assert TableShareService.is_share_only_user(str(test_base.id), str(user.id)) is False

    def test_remove_view_from_shares(self, app, test_table, test_user, test_view):
        """删除视图后从分享可见范围移除；specified 变空回退 all"""
        with app.app_context():
            view_b = _make_view(test_table, '视图B', order=1)
            share = TableShareService.create_share(
                str(test_table.id), str(test_user.id),
                {'permission': 'viewer', 'view_scope': 'specified',
                 'view_ids': [str(test_view.id), str(view_b.id)]}
            )['share']

            TableShareService.remove_view_from_shares(str(test_table.id), str(view_b.id))
            db.session.refresh(share)
            assert share.view_ids == [str(test_view.id)]

            # 移除最后一个 → 回退 all
            TableShareService.remove_view_from_shares(str(test_table.id), str(test_view.id))
            db.session.refresh(share)
            assert share.view_scope == 'all'
            assert not share.view_ids

    def test_get_shared_tables_for_user(self, app, test_base, test_table, test_user, test_view):
        """分享给我的列表：去重取最高权限、过期/停用过滤、非成员不可见"""
        with app.app_context():
            user = _make_user('sharedwithme@example.com', '列表用户')

            # 无加入记录时为空
            assert TableShareService.get_shared_tables_for_user(str(user.id)) == []

            # 两条分享：editor + viewer（同一表），join 后去重取最高权限
            share_editor = TableShareService.create_share(
                str(test_table.id), str(test_user.id), {'permission': 'editor'}
            )['share']
            share_viewer = TableShareService.create_share(
                str(test_table.id), str(test_user.id),
                {'permission': 'viewer', 'view_scope': 'specified',
                 'view_ids': [str(test_view.id)]}
            )['share']
            TableShareService.join_share(share_editor.share_token, str(user.id))
            TableShareService.join_share(share_viewer.share_token, str(user.id))

            items = TableShareService.get_shared_tables_for_user(str(user.id))
            assert len(items) == 1
            item = items[0]
            assert item['permission'] == 'editor'  # 最高权限作为代表
            assert item['share_id'] == str(share_editor.id)
            assert item['table']['id'] == str(test_table.id)
            assert item['base']['id'] == str(test_base.id)
            assert item['joined_at'] is not None

            # 停用分享后不再出现
            share_editor.is_active = False
            db.session.commit()
            items = TableShareService.get_shared_tables_for_user(str(user.id))
            assert len(items) == 1
            assert items[0]['permission'] == 'viewer'
            assert items[0]['view_scope'] == 'specified'
            assert items[0]['view_count'] == 1

            # 过期分享同样被过滤
            share_viewer.is_active = False
            db.session.commit()
            share_expired = TableShareService.create_share(
                str(test_table.id), str(test_user.id), {'permission': 'commenter'}
            )['share']
            TableShareService.join_share(share_expired.share_token, str(user.id))
            share_expired.expires_at = 1000000000
            db.session.commit()
            assert TableShareService.get_shared_tables_for_user(str(user.id)) == []

    def test_shared_with_me_route(self, client, auth_headers, test_table, test_user, test_view):
        """GET /table-shares/shared-with-me 返回当前用户加入的表分享列表"""
        create_response = _create_share(client, auth_headers, test_table.id,
                                        permission='editor', view_scope='all')
        assert create_response.status_code == 201
        share_token = create_response.get_json()['data']['share_token']

        joiner = _make_user('routelist@example.com', '路由列表用户')
        joiner_headers = _login(client, joiner.email)

        # 未加入任何分享时为空列表
        response = client.get('/api/table-shares/shared-with-me', headers=joiner_headers)
        assert response.status_code == 200
        assert response.get_json()['data'] == []

        # 加入后返回列表项
        join_response = client.post(f'/api/share/table/{share_token}/join',
                                    headers=joiner_headers)
        assert join_response.status_code == 200

        response = client.get('/api/table-shares/shared-with-me', headers=joiner_headers)
        assert response.status_code == 200
        data = response.get_json()['data']
        assert len(data) == 1
        assert data[0]['table']['id'] == str(test_table.id)
        assert data[0]['base']['id'] is not None
        assert data[0]['permission'] == 'editor'
        assert data[0]['share_token'] == str(share_token)


class TestTableShareRoutes:
    """表分享路由测试"""

    def test_create_share_requires_admin(self, client, auth_headers, editor_auth_headers,
                                         test_table, test_user):
        """非 ADMIN 用户创建分享返回 403；ADMIN 成功返回 201"""
        response = _create_share(client, editor_auth_headers, test_table.id)
        assert response.status_code == 403

        response = _create_share(client, auth_headers, test_table.id, permission='editor')
        assert response.status_code == 201
        data = response.get_json()['data']
        assert data['permission'] == 'editor'
        assert data['share_token']

    def test_access_share_public(self, client, auth_headers, test_base, test_table, test_view):
        """公开访问分享链接（无需登录）"""
        resp = _create_share(client, auth_headers, test_table.id)
        token = resp.get_json()['data']['share_token']

        response = client.get(f'/api/share/table/{token}')
        assert response.status_code == 200
        data = response.get_json()['data']
        assert data['table']['id'] == str(test_table.id)
        assert data['table']['name'] == '测试表格'
        assert data['base']['id'] == str(test_base.id)
        assert data['permission'] == 'viewer'
        assert data['view_scope'] == 'all'
        assert any(v['id'] == str(test_view.id) for v in data['views'])

        # 访问计数 +1
        share = TableShare.query.filter_by(share_token=token).first()
        assert share.access_count == 1

    def test_access_share_invalid_token(self, client):
        """不存在的令牌返回 404"""
        response = client.get('/api/share/table/not-exists-token')
        assert response.status_code == 404

    def test_update_and_delete_share(self, client, auth_headers, test_table, test_view):
        """ADMIN 更新与删除分享"""
        resp = _create_share(client, auth_headers, test_table.id)
        share_data = resp.get_json()['data']

        response = client.put(
            f"/api/table-shares/{share_data['id']}",
            json={'is_active': False, 'permission': 'commenter'},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.get_json()['data']['is_active'] is False
        assert response.get_json()['data']['permission'] == 'commenter'

        response = client.delete(
            f"/api/table-shares/{share_data['id']}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert TableShare.query.filter_by(id=share_data['id']).first() is None

    def test_share_only_user_reads_and_writes(self, client, auth_headers, test_base,
                                              test_table, test_field, test_user):
        """纯表分享用户：读放行、视图过滤、editor 可写记录、字段/视图写禁止"""
        # 准备两个视图，指定分享其中一个
        view_a = _make_view(test_table, '默认视图')
        view_b = _make_view(test_table, '第二视图', order=1)

        # 第二张表（不分享，用于验证列表过滤）
        other_table = Table(base_id=test_base.id, name='未分享表', order=1)
        db.session.add(other_table)
        db.session.commit()

        # 创建 editor 权限、specified 只含 view_b 的分享
        resp = _create_share(
            client, auth_headers, test_table.id,
            permission='editor', view_scope='specified', view_ids=[str(view_b.id)]
        )
        token = resp.get_json()['data']['share_token']

        # 新用户加入
        share_user = _make_user('routeuser@example.com', '路由用户')
        headers = _login(client, 'routeuser@example.com')
        join_resp = client.post(f'/api/share/table/{token}/join', headers=headers)
        assert join_resp.status_code == 200
        join_data = join_resp.get_json()['data']
        assert join_data['restricted'] is True
        assert join_data['role'] == 'editor'
        assert join_data['view_scope'] == 'specified'
        assert join_data['view_ids'] == [str(view_b.id)]

        # 已是 base 成员时 restricted=False
        member_user = _make_user('routemember@example.com', '路由成员')
        db.session.add(BaseMember(
            base_id=test_base.id, user_id=member_user.id, role=MemberRole.VIEWER
        ))
        db.session.commit()
        member_headers = _login(client, 'routemember@example.com')
        join_resp2 = client.post(f'/api/share/table/{token}/join', headers=member_headers)
        assert join_resp2.get_json()['data']['restricted'] is False

        # 1) get_tables 过滤：仅返回分享命中的表
        response = client.get(f'/api/bases/{test_base.id}/tables', headers=headers)
        assert response.status_code == 200
        tables_data = response.get_json()['data']
        table_ids = {t['id'] for t in tables_data}
        assert str(test_table.id) in table_ids
        assert str(other_table.id) not in table_ids

        # 2) 视图列表按 specified 过滤
        response = client.get(f'/api/tables/{test_table.id}/views', headers=headers)
        assert response.status_code == 200
        view_ids = {v['id'] for v in response.get_json()['data']}
        assert str(view_b.id) in view_ids
        assert str(view_a.id) not in view_ids

        # 3) 记录读放行
        response = client.get(f'/api/tables/{test_table.id}/records', headers=headers)
        assert response.status_code == 200

        # 4) editor 表分享用户可写记录
        response = client.post(
            f'/api/tables/{test_table.id}/records',
            json={'values': {str(test_field.id): '分享用户写入'}},
            headers=headers,
        )
        assert response.status_code == 201

        # 5) 字段写禁止
        response = client.post(
            f'/api/tables/{test_table.id}/fields',
            json={'name': '新字段', 'type': FieldType.SINGLE_LINE_TEXT.value},
            headers=headers,
        )
        assert response.status_code == 403
        assert response.get_json()['message'] == translate('no_permission_manage_fields')

        # 6) 视图写禁止
        response = client.post(
            f'/api/tables/{test_table.id}/views',
            json={'name': '新视图', 'type': 'table'},
            headers=headers,
        )
        assert response.status_code == 403
        assert response.get_json()['message'] == translate('no_permission_manage_views')

    def test_viewer_share_user_cannot_write_records(self, client, auth_headers,
                                                    test_table, test_field, test_view):
        """viewer 表分享用户写记录返回 403，读放行"""
        resp = _create_share(client, auth_headers, test_table.id, permission='viewer')
        token = resp.get_json()['data']['share_token']

        _make_user('vieweruser@example.com', '只读用户')
        headers = _login(client, 'vieweruser@example.com')
        client.post(f'/api/share/table/{token}/join', headers=headers)

        response = client.get(f'/api/tables/{test_table.id}/records', headers=headers)
        assert response.status_code == 200

        response = client.post(
            f'/api/tables/{test_table.id}/records',
            json={'values': {str(test_field.id): 'x'}},
            headers=headers,
        )
        assert response.status_code == 403

    def test_join_share_invalid_token(self, client, auth_headers):
        """无效令牌 join 返回 404"""
        _make_user('joinuser@example.com', '加入用户')
        headers = _login(client, 'joinuser@example.com')
        response = client.post('/api/share/table/bad-token/join', headers=headers)
        assert response.status_code == 404

    def test_share_member_list_requires_admin(self, client, auth_headers,
                                              editor_auth_headers, test_table, test_view):
        """成员列表需要 ADMIN 权限"""
        resp = _create_share(client, auth_headers, test_table.id)
        share_data = resp.get_json()['data']

        response = client.get(
            f"/api/table-shares/{share_data['id']}/members",
            headers=editor_auth_headers,
        )
        assert response.status_code == 403

        response = client.get(
            f"/api/table-shares/{share_data['id']}/members",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.get_json()['data'] == []


class TestTableShareMemberRemoval:
    """移除表分享成员（回收分享访问权限）测试"""

    def test_remove_member_success_revokes_access(self, app, test_table, test_user, test_view):
        """移除成功后成员记录删除，分享访问权限被回收"""
        with app.app_context():
            share = TableShareService.create_share(
                str(test_table.id), str(test_user.id), {'permission': 'editor'}
            )['share']
            member_user = _make_user('removeuser@example.com', '被移除用户')
            TableShareService.join_share(share.share_token, str(member_user.id))
            assert TableShareService.get_members_role(
                str(test_table.id), str(member_user.id)
            ) == 'editor'

            result = TableShareService.remove_share_member(
                str(share.id), str(member_user.id), str(test_user.id)
            )
            assert result['success'] is True
            assert TableShareMember.query.filter_by(share_id=share.id).count() == 0
            # 访问权限被回收
            assert TableShareService.get_members_role(
                str(test_table.id), str(member_user.id)
            ) is None

    def test_remove_member_self_blocked(self, app, test_table, test_user, test_view):
        """操作者移除自身被拦截"""
        with app.app_context():
            share = TableShareService.create_share(
                str(test_table.id), str(test_user.id), {'permission': 'viewer'}
            )['share']
            result = TableShareService.remove_share_member(
                str(share.id), str(test_user.id), str(test_user.id)
            )
            assert result['success'] is False
            assert result['error'] == 'table_share_member_cannot_remove_yourself'

    def test_remove_member_not_in_list(self, app, test_table, test_user, test_view):
        """移除不在成员列表中的用户返回明确错误（重复移除场景）"""
        with app.app_context():
            share = TableShareService.create_share(
                str(test_table.id), str(test_user.id), {'permission': 'viewer'}
            )['share']
            outsider = _make_user('outsider@example.com', '非成员用户')

            result = TableShareService.remove_share_member(
                str(share.id), str(outsider.id), str(test_user.id)
            )
            assert result['success'] is False
            assert result['error'] == 'table_share_member_does_not_exist'
            assert result['status'] == 404

    def test_remove_member_share_not_found(self, app, test_user):
        """分享不存在时返回 share_link_does_not_exist"""
        with app.app_context():
            result = TableShareService.remove_share_member(
                str(uuid.uuid4()), str(test_user.id), str(test_user.id)
            )
            assert result['success'] is False
            assert result['error'] == 'share_link_does_not_exist'
            assert result['status'] == 404

    def test_remove_member_route(self, client, auth_headers, editor_auth_headers,
                                 test_table, test_user, test_view):
        """路由级：无权限 403、移除成功、重复移除 404、移除自身 400"""
        resp = _create_share(client, auth_headers, test_table.id, permission='editor')
        share_data = resp.get_json()['data']
        share_id = share_data['id']

        member_user = _make_user('routeremove@example.com', '路由移除用户')
        headers = _login(client, member_user.email)
        join_resp = client.post(f'/api/share/table/{share_data["share_token"]}/join',
                                headers=headers)
        assert join_resp.status_code == 200

        # 非 ADMIN（editor Base 成员）无权移除
        response = client.delete(
            f'/api/table-shares/{share_id}/members/{member_user.id}',
            headers=editor_auth_headers,
        )
        assert response.status_code == 403
        assert response.get_json()['message'] == translate('do_not_permission_remove_members')

        # 移除自身被拦截（ADMIN 操作者 == 被移除者）
        response = client.delete(
            f'/api/table-shares/{share_id}/members/{test_user.id}',
            headers=auth_headers,
        )
        assert response.status_code == 400
        assert response.get_json()['message'] == translate(
            'table_share_member_cannot_remove_yourself'
        )

        # ADMIN 移除成功
        response = client.delete(
            f'/api/table-shares/{share_id}/members/{member_user.id}',
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.get_json()['message'] == translate(
            'table_share_member_removed_successfully'
        )
        assert TableShareMember.query.filter_by(
            share_id=share_id, user_id=member_user.id
        ).first() is None

        # 重复移除（已被删除的用户）返回 404 与明确提示
        response = client.delete(
            f'/api/table-shares/{share_id}/members/{member_user.id}',
            headers=auth_headers,
        )
        assert response.status_code == 404
        assert response.get_json()['message'] == translate('table_share_member_does_not_exist')

        # 分享不存在返回 404
        response = client.delete(
            f'/api/table-shares/{uuid.uuid4()}/members/{member_user.id}',
            headers=auth_headers,
        )
        assert response.status_code == 404
