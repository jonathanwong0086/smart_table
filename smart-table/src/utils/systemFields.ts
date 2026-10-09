/**
 * 系统字段取值助手
 *
 * created_by / updated_by / created_time / updated_time 四类系统字段的值
 * 不存储在 record.values 中，而是直接来源于 records 表的
 * created_by / updated_by / created_at / updated_at 列。
 * 本模块统一提供原始值与显示值的读取逻辑，保证各渲染/导出/排序/分组/
 * 筛选路径的取值与记录元数据完全一致。
 */
import { FieldType, type CellValue } from "@/types";
import type { RecordEntity } from "@/db/schema";
import { formatDateTime } from "@/utils/timezone";

/** 是否为系统维护值字段类型（值来自记录元数据，只读） */
export function isSystemValueType(type: string | undefined | null): boolean {
  return (
    type === FieldType.CREATED_BY ||
    type === FieldType.CREATED_TIME ||
    type === FieldType.UPDATED_BY ||
    type === FieldType.UPDATED_TIME
  );
}

/**
 * 读取系统字段的原始值（与 records 表对应列一致）：
 * - created_by  -> record.created_by（创建人用户 ID）
 * - updated_by  -> record.updated_by（更新人用户 ID）
 * - created_time -> record.created_at（创建时间戳，毫秒）
 * - updated_time -> record.updated_at（更新时间戳，毫秒）
 */
export function getSystemFieldRawValue(
  record: Pick<RecordEntity, "createdBy" | "updatedBy" | "createdAt" | "updatedAt"> | undefined | null,
  type: string,
): CellValue | null {
  if (!record) return null;
  switch (type) {
    case FieldType.CREATED_BY:
      return record.createdBy ?? null;
    case FieldType.UPDATED_BY:
      return record.updatedBy ?? null;
    case FieldType.CREATED_TIME:
      return record.createdAt ?? null;
    case FieldType.UPDATED_TIME:
      return record.updatedAt ?? null;
    default:
      return null;
  }
}

/**
 * 读取系统字段的显示值：
 * - 用户类型：解析为用户名称（未命中缓存时回退显示原始 ID）
 * - 时间类型：格式化为 YYYY-MM-DD HH:mm:ss
 */
export function getSystemFieldDisplayValue(
  record: Pick<RecordEntity, "createdBy" | "updatedBy" | "createdAt" | "updatedAt"> | undefined | null,
  type: string,
  resolveUserName?: (userId: string) => string,
): string {
  const raw = getSystemFieldRawValue(record, type);
  if (raw === null || raw === undefined || raw === "") return "";
  if (type === FieldType.CREATED_BY || type === FieldType.UPDATED_BY) {
    const id = String(raw);
    return resolveUserName ? resolveUserName(id) : id;
  }
  // created_time / updated_time：毫秒时间戳
  const ts = typeof raw === "number" ? raw : Date.parse(String(raw));
  if (Number.isNaN(ts) || ts <= 0) return "";
  return formatDateTime(ts);
}
