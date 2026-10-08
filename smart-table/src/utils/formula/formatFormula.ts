/**
 * 公式计算结果显示工具
 *
 * 统一表格视图（TableCell）与导出（Excel / CSV / JSON）的公式字段显示逻辑：
 * 1. 优先使用后端预计算结果 record.computed_values[field.name]；
 * 2. 若该结果缺失（例如前端从 IndexedDB 读回的记录被剥离了 computed_values），
 *    则回退到前端 FormulaEngine.calculate 重新计算（与表格视图行为一致）。
 *
 * 格式化规则与表格视图保持一致：
 * - 字符串（日期/时间/错误）：日期串只取日期部分，其余原样返回；
 * - 数字：按公式返回类型（datetime/date/number）格式化，数字带千分位与精度。
 */
import { FormulaEngine, type FormulaTableContext } from "@/utils/formula/engine";
import { formatDate, formatDateTime } from "@/utils/timezone";
import type { FieldEntity, RecordEntity } from "@/db/schema";

/**
 * 按公式字段配置的"显示格式"格式化日期/日期时间值。
 *
 * 仅当字段配置 format 为 "date" / "datetime" 时生效，返回格式化后的字符串；
 * 其余情况返回 null，由调用方回退到原有展示逻辑（自动类型推断/数值格式化）。
 *
 * 兼容值形态：
 * - 毫秒时间戳（前端 FormulaEngine 计算结果）与秒级时间戳（10 位数字，与日期筛选解析规则一致）；
 * - 纯数字字符串：10 位视为秒级，其余按毫秒解析；
 * - 日期/日期时间字符串（后端 computed_values 的 ISO 串、YYYY-MM-DD HH:mm:ss 等）；
 * - Date 对象。
 *
 * 边界处理：空值返回空串；#ERROR 计算错误原样透传；无法解析的日期
 * 统一返回 "-"，与系统日期展示约定（formatDate/formatDateTime）保持一致。
 */
export function formatFormulaDateByConfig(
  value: unknown,
  fieldOptions: { format?: unknown } | undefined | null,
): string | null {
  const format = fieldOptions?.format;
  if (format !== "date" && format !== "datetime") return null;

  if (value === null || value === undefined || value === "") return "";

  // 10 位数字视为秒级时间戳，其余按毫秒处理
  const toMillis = (n: number) => (n >= 1e9 && n < 1e10 ? n * 1000 : n);

  if (value instanceof Date) {
    return format === "date"
      ? formatDate(value)
      : formatDateTime(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    const ts = toMillis(value);
    return format === "date" ? formatDate(ts) : formatDateTime(ts);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    // 计算错误信息原样透传，避免被日期格式化吞掉诊断内容
    if (trimmed.startsWith("#ERROR")) return trimmed;
    if (/^\d+$/.test(trimmed)) {
      const ts = toMillis(Number(trimmed));
      return format === "date" ? formatDate(ts) : formatDateTime(ts);
    }
    return format === "date" ? formatDate(trimmed) : formatDateTime(trimmed);
  }

  // 其它类型（布尔等）原样返回
  return String(value);
}

export function calculateFormulaDisplay(
  field: FieldEntity,
  record: RecordEntity,
  allFields: FieldEntity[],
  tableContext?: FormulaTableContext,
): string {
  const fieldOptions = field.options;
  const formula = (fieldOptions as any)?.formula as string;
  if (!formula) return "";

  const precision = (fieldOptions as any)?.precision ?? 2;

  // 1. 优先使用后端预计算结果（字段名作为 key）
  const computedValues = (record as any)?.computed_values;
  let precomputed: unknown =
    computedValues && typeof computedValues === "object"
      ? computedValues[field.name]
      : undefined;

  // 2. 缺失则前端回退计算
  if (precomputed === null || precomputed === undefined) {
    if (!allFields || allFields.length === 0) return "";
    try {
      const engine = new FormulaEngine(allFields, tableContext);
      const result = engine.calculate(record, formula);
      if (result === "#ERROR") return "#ERROR";
      precomputed = result;
    } catch {
      return "";
    }
  }

  // 3. 配置了日期/日期时间显示格式时，严格按配置格式化
  const dateFormatted = formatFormulaDateByConfig(precomputed, fieldOptions);
  if (dateFormatted !== null) return dateFormatted;

  // 4. 格式化显示（与表格视图一致）
  if (typeof precomputed === "string") {
    const dateMatch = precomputed.match(/^\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      return precomputed.split("T")[0]; // 只返回日期部分
    }
    return precomputed;
  }

  if (typeof precomputed === "number") {
    const resultType = FormulaEngine.inferResultType(formula);
    if (resultType === "datetime") {
      return formatDateTime(precomputed);
    }
    if (resultType === "date") {
      return formatDate(precomputed);
    }
    return precomputed.toLocaleString("zh-CN", {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
  }

  return String(precomputed);
}

/**
 * 取公式字段的原始计算值（用于 JSON 等数据交换导出）。
 * 优先后端预计算结果，缺失时回退前端 FormulaEngine 计算。
 */
export function getFormulaRawValue(
  field: FieldEntity,
  record: RecordEntity,
  allFields: FieldEntity[],
  tableContext?: FormulaTableContext,
): unknown {
  const formula = (field.options as any)?.formula as string;
  if (!formula) return undefined;

  const computedValues = (record as any)?.computed_values;
  let raw: unknown =
    computedValues && typeof computedValues === "object"
      ? computedValues[field.name]
      : undefined;

  if (raw === null || raw === undefined) {
    if (!allFields || allFields.length === 0) return undefined;
    try {
      const engine = new FormulaEngine(allFields, tableContext);
      const result = engine.calculate(record, formula);
      if (result === "#ERROR") return undefined;
      raw = result;
    } catch {
      return undefined;
    }
  }

  return raw;
}
