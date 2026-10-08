"""${message}

修订 ID: ${up_revision}
创建时间: ${create_date}

【分层迁移约定】
- 基础层迁移放 migrations/versions/，branch_labels 留空
- 各产品版本层迁移分别放 migrations/versions_fa/（field_auth）、
  versions_am/（app_mode）、versions_ap/（approval）
- branch_labels 仅挂在本层第一个迁移（链头）上，层内后续迁移留空
  （通过 down_revision 继承分支）
- 层内迁移的 down_revision 指向本层上一个迁移；本层第一个迁移的
  down_revision 指向建层时的基础层迁移，发布后不再改动
- 迁移文件一经发布禁止修改
"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# 修订标识符
revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    """升级数据库模式"""
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    """降级数据库模式"""
    ${downgrades if downgrades else "pass"}
