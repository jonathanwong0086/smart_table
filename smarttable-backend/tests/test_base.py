"""
Base（多维表格基础）模块测试
"""
import pytest

from app.extensions import db
from app.models import Base
from app.models.base import BaseMember, MemberRole


class TestBase:
    """Base功能测试类"""
    
    def test_create_base(self, client, auth_headers, test_user):
        """测试创建Base"""
        response = client.post('/api/bases', 
            json={
                'name': '新多维表格',
                'description': '这是一个新的多维表格',
                'icon': 'folder',
                'color': '#10b981'
            },
            headers=auth_headers
        )
        
        assert response.status_code == 201
        data = response.get_json()
        assert data['code'] == 201
        assert data['data']['name'] == '新多维表格'
    
    def test_create_base_without_auth(self, client):
        """测试无认证创建Base"""
        response = client.post('/api/bases', json={
            'name': '新多维表格'
        })
        
        assert response.status_code == 401
    
    def test_get_bases_list(self, client, auth_headers, test_base):
        """测试获取Base列表"""
        response = client.get('/api/bases', headers=auth_headers)
        
        assert response.status_code == 200
        data = response.get_json()
        assert data['code'] == 200
        assert 'items' in data['data']
    
    def test_get_base_detail(self, client, auth_headers, test_base):
        """测试获取Base详情"""
        response = client.get(f'/api/bases/{test_base.id}', headers=auth_headers)
        
        assert response.status_code == 200
        data = response.get_json()
        assert data['code'] == 200
        assert data['data']['name'] == test_base.name
    
    def test_update_base(self, client, auth_headers, test_base):
        """测试更新Base"""
        response = client.put(f'/api/bases/{test_base.id}',
            json={
                'name': '更新后的名称',
                'description': '更新后的描述'
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.get_json()
        assert data['code'] == 200
        assert data['data']['name'] == '更新后的名称'
    
    def test_delete_base(self, client, auth_headers, test_base):
        """测试删除Base"""
        response = client.delete(f'/api/bases/{test_base.id}', headers=auth_headers)
        
        assert response.status_code == 200
        data = response.get_json()
        assert data['code'] == 200
    
    def test_add_member(self, client, auth_headers, test_base):
        """测试添加成员"""
        response = client.post(f'/api/bases/{test_base.id}/members',
            json={
                'user_id': 'another-user-id',
                'role': 'editor'
            },
            headers=auth_headers
        )
        
        assert response.status_code in [200, 201, 400]
    
    def test_update_member_role(self, client, auth_headers, test_base):
        """测试更新成员角色"""
        response = client.put(f'/api/bases/{test_base.id}/members/member-id',
            json={
                'role': 'admin'
            },
            headers=auth_headers
        )
        
        assert response.status_code in [200, 400, 404]
    
    def test_remove_member(self, client, auth_headers, test_base):
        """测试移除成员"""
        response = client.delete(f'/api/bases/{test_base.id}/members/member-id',
            headers=auth_headers
        )

        assert response.status_code in [200, 404]


class TestTransferOwnership:
    """转移所有权功能测试类"""

    def test_transfer_ownership_by_non_owner(self, client, editor_auth_headers, test_base):
        """非所有者调用转移接口应返回 403"""
        response = client.post(f'/api/bases/{test_base.id}/transfer-ownership',
            json={
                'user_id': str(test_base.owner_id),
                'former_owner_role': 'editor'
            },
            headers=editor_auth_headers
        )

        assert response.status_code == 403

    def test_transfer_ownership_to_self(self, client, auth_headers, test_base):
        """所有者不能将所有权转移给自己"""
        response = client.post(f'/api/bases/{test_base.id}/transfer-ownership',
            json={
                'user_id': str(test_base.owner_id)
            },
            headers=auth_headers
        )

        assert response.status_code == 400

    def test_transfer_ownership_to_nonexistent_user(self, client, auth_headers, test_base):
        """转移给不存在的用户应返回 400"""
        response = client.post(f'/api/bases/{test_base.id}/transfer-ownership',
            json={
                'user_id': '00000000-0000-0000-0000-000000000000'
            },
            headers=auth_headers
        )

        assert response.status_code == 400

    def test_transfer_ownership_with_invalid_role(self, client, auth_headers, test_base, test_editor_user):
        """保留角色为 owner 或非法值应返回 400"""
        for bad_role in ['owner', 'superman']:
            response = client.post(f'/api/bases/{test_base.id}/transfer-ownership',
                json={
                    'user_id': str(test_editor_user.id),
                    'former_owner_role': bad_role
                },
                headers=auth_headers
            )
            assert response.status_code == 400, f'former_owner_role={bad_role} 应被拒绝'

    def test_transfer_ownership_keep_role(self, client, auth_headers, test_base,
                                          test_editor_user, app):
        """转移并保留原所有者角色：目标成为所有者，原所有者降级为指定角色"""
        # 转移会变更 base.owner_id，先捕获原所有者 ID
        old_owner_id = str(test_base.owner_id)

        response = client.post(f'/api/bases/{test_base.id}/transfer-ownership',
            json={
                'user_id': str(test_editor_user.id),
                'former_owner_role': 'editor'
            },
            headers=auth_headers
        )

        assert response.status_code == 200

        with app.app_context():
            base = Base.query.get(str(test_base.id))
            assert str(base.owner_id) == str(test_editor_user.id)

            # 目标用户（原为非成员）自动创建 owner 成员行
            target_membership = BaseMember.query.filter_by(
                base_id=str(test_base.id), user_id=str(test_editor_user.id)).first()
            assert target_membership is not None
            assert target_membership.role.value == 'owner'

            # 原所有者（无成员行）创建 editor 成员行
            old_membership = BaseMember.query.filter_by(
                base_id=str(test_base.id), user_id=old_owner_id).first()
            assert old_membership is not None
            assert old_membership.role.value == 'editor'

    def test_transfer_ownership_remove_access(self, client, auth_headers, test_base,
                                              test_editor_user, test_user,
                                              app, db_session):
        """转移且不保留协作权限：原所有者成员关系被移除"""
        old_owner_id = str(test_base.owner_id)

        with app.app_context():
            # 预置原所有者成员行（owner），验证转移后被删除
            db.session.add(BaseMember(
                base_id=test_base.id,
                user_id=test_user.id,
                role=MemberRole.OWNER
            ))
            db.session.commit()

        response = client.post(f'/api/bases/{test_base.id}/transfer-ownership',
            json={
                'user_id': str(test_editor_user.id)
            },
            headers=auth_headers
        )

        assert response.status_code == 200

        with app.app_context():
            base = Base.query.get(str(test_base.id))
            assert str(base.owner_id) == str(test_editor_user.id)

            old_membership = BaseMember.query.filter_by(
                base_id=str(test_base.id), user_id=old_owner_id).first()
            assert old_membership is None

            target_membership = BaseMember.query.filter_by(
                base_id=str(test_base.id), user_id=str(test_editor_user.id)).first()
            assert target_membership is not None
            assert target_membership.role.value == 'owner'

    def test_transfer_ownership_to_existing_member_upgrades_role(self, client, auth_headers,
                                                                 test_base, test_editor_user,
                                                                 test_user,
                                                                 app, db_session):
        """转移给已有成员行（editor）的用户：其角色升级为 owner，不产生重复行"""
        old_owner_id = str(test_base.owner_id)

        with app.app_context():
            db.session.add(BaseMember(
                base_id=test_base.id,
                user_id=test_editor_user.id,
                role=MemberRole.EDITOR
            ))
            db.session.commit()

        response = client.post(f'/api/bases/{test_base.id}/transfer-ownership',
            json={
                'user_id': str(test_editor_user.id),
                'former_owner_role': 'viewer'
            },
            headers=auth_headers
        )

        assert response.status_code == 200

        with app.app_context():
            memberships = BaseMember.query.filter_by(
                base_id=str(test_base.id), user_id=str(test_editor_user.id)).all()
            assert len(memberships) == 1
            assert memberships[0].role.value == 'owner'

            # 原所有者保留为 viewer
            old_membership = BaseMember.query.filter_by(
                base_id=str(test_base.id), user_id=old_owner_id).first()
            assert old_membership is not None
            assert old_membership.role.value == 'viewer'
