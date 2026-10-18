"""
数据表分享模型
"""
import uuid
import enum
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey, JSON, UniqueConstraint, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db_types import CompatUUID as UUID
from app.extensions import db


class TableSharePermission(str, enum.Enum):
    """表分享权限类型"""
    EDITOR = 'editor'
    COMMENTER = 'commenter'
    VIEWER = 'viewer'


class TableShare(db.Model):
    """
    数据表分享配置表

    属性:
        id: UUID 主键
        table_id: 关联的数据表 ID
        share_token: 分享令牌（用于生成分享链接）
        created_by: 创建者用户 ID
        permission: 分享权限（editor/commenter/viewer）
        view_scope: 可见视图范围（all=全部视图，specified=指定视图）
        view_ids: 指定可见的视图 ID 列表（view_scope=specified 时有效）
        expires_at: 过期时间（可选，Unix 时间戳，秒）
        access_count: 访问次数
        is_active: 是否激活
        created_at: 创建时间
        updated_at: 更新时间
        last_accessed_at: 最后访问时间
    """

    __tablename__ = 'table_shares'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    # 关联的数据表 ID
    table_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey('tables.id', ondelete='CASCADE'),
        nullable=False,
        index=True
    )

    # 分享令牌（用于生成分享链接）
    share_token: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        index=True
    )

    # 创建者 ID
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False
    )

    # 分享权限
    permission: Mapped[TableSharePermission] = mapped_column(
        SQLEnum(TableSharePermission),
        default=TableSharePermission.VIEWER,
        nullable=False
    )

    # 可见视图范围：all=全部视图，specified=指定视图
    view_scope: Mapped[str] = mapped_column(
        String(10),
        default='all',
        nullable=False
    )

    # 指定可见的视图 ID 列表（view_scope=specified 时有效）
    view_ids: Mapped[Optional[List[str]]] = mapped_column(
        JSON,
        nullable=True
    )

    # 过期时间（可选，Unix 时间戳，秒）
    expires_at: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True
    )

    # 访问次数
    access_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False
    )

    # 是否激活
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )

    # 创建时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # 更新时间
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # 最后访问时间
    last_accessed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # 关联关系
    table = relationship('Table', foreign_keys=[table_id])
    creator = relationship('User', foreign_keys=[created_by])
    members = relationship(
        'TableShareMember',
        back_populates='share',
        cascade='all, delete-orphan',
        passive_deletes=True
    )

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            'id': str(self.id),
            'table_id': str(self.table_id),
            'share_token': self.share_token,
            'permission': self.permission.value if hasattr(self.permission, 'value') else str(self.permission),
            'view_scope': self.view_scope,
            'view_ids': self.view_ids or [],
            'expires_at': self.expires_at,
            'access_count': self.access_count,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'last_accessed_at': self.last_accessed_at.isoformat() if self.last_accessed_at else None,
            'created_by': str(self.created_by)
        }

    def __repr__(self) -> str:
        return f'<TableShare {self.share_token}>'


class TableShareMember(db.Model):
    """
    数据表分享成员表

    通过表分享链接加入、但不是 Base 成员的用户记录。
    不含角色字段：角色动态跟随所属 share.permission。

    属性:
        id: UUID 主键
        share_id: 关联的分享 ID
        user_id: 用户 ID
        joined_at: 加入时间
    """

    __tablename__ = 'table_share_members'
    __table_args__ = (
        UniqueConstraint('share_id', 'user_id', name='uq_table_share_members_share_user'),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    # 关联的分享 ID
    share_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey('table_shares.id', ondelete='CASCADE'),
        nullable=False,
        index=True
    )

    # 用户 ID
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True
    )

    # 加入时间
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )

    # 关联关系
    share = relationship('TableShare', back_populates='members')
    user = relationship('User', foreign_keys=[user_id])

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            'id': str(self.id),
            'share_id': str(self.share_id),
            'user_id': str(self.user_id),
            'joined_at': self.joined_at.isoformat() if self.joined_at else None
        }

    def __repr__(self) -> str:
        return f'<TableShareMember {self.share_id}:{self.user_id}>'
