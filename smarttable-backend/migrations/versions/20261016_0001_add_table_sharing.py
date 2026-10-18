"""
数据表分享功能：新增 table_shares 表 + table_share_members 表

Revision ID: 20261016_0001
Revises: 20260925_0001
Create Date: 2026-10-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# 与模型一致：UUID 列在 PostgreSQL 下编译为原生 UUID，在 SQLite 下为 String(36)
from app.db_types import CompatUUID as UUID


revision = '20261016_0001'
down_revision = '20260925_0001'
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    inspector = inspect(op.get_bind())
    return name in inspector.get_table_names()


def upgrade():
    # 1. 建 table_shares 表（幂等：已存在则跳过，历史 create_all 已建表）
    if not _table_exists('table_shares'):
        op.create_table(
            'table_shares',
            sa.Column('id', UUID(), nullable=False),
            sa.Column('table_id', UUID(), nullable=False),
            sa.Column('share_token', sa.String(64), nullable=False),
            sa.Column('created_by', UUID(), nullable=False),
            sa.Column('permission', sa.Enum('editor', 'commenter', 'viewer', name='tablesharepermission'),
                      nullable=False, default='viewer'),
            sa.Column('view_scope', sa.String(10), nullable=False, default='all'),
            sa.Column('view_ids', sa.JSON(), nullable=True),
            sa.Column('expires_at', sa.Integer(), nullable=True),
            sa.Column('access_count', sa.Integer(), nullable=False, default=0),
            sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('last_accessed_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['table_id'], ['tables.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE'),
            sa.UniqueConstraint('share_token', name='uq_table_shares_share_token')
        )
        op.create_index('ix_table_shares_table_id', 'table_shares', ['table_id'])
        op.create_index('ix_table_shares_share_token', 'table_shares', ['share_token'], unique=True)

    # 2. 建 table_share_members 表（幂等）
    if not _table_exists('table_share_members'):
        op.create_table(
            'table_share_members',
            sa.Column('id', UUID(), nullable=False),
            sa.Column('share_id', UUID(), nullable=False),
            sa.Column('user_id', UUID(), nullable=False),
            sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['share_id'], ['table_shares.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
            sa.UniqueConstraint('share_id', 'user_id', name='uq_table_share_members_share_user')
        )
        op.create_index('ix_table_share_members_share_id', 'table_share_members', ['share_id'])
        op.create_index('ix_table_share_members_user_id', 'table_share_members', ['user_id'])


def downgrade():
    if _table_exists('table_share_members'):
        op.drop_index('ix_table_share_members_user_id', table_name='table_share_members')
        op.drop_index('ix_table_share_members_share_id', table_name='table_share_members')
        op.drop_table('table_share_members')

    if _table_exists('table_shares'):
        op.drop_index('ix_table_shares_share_token', table_name='table_shares')
        op.drop_index('ix_table_shares_table_id', table_name='table_shares')
        op.drop_table('table_shares')
