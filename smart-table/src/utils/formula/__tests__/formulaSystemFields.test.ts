/**
 * 公式引用系统字段（创建人/创建时间/更新人/更新时间）验证
 * 系统字段值不落 record.values，引擎须从记录元数据取值：
 * 用户字段为用户 ID 字符串，时间字段为毫秒时间戳。
 */
import { describe, it, expect } from "vitest";
import { FormulaEngine } from "@/utils/formula/engine";
import { FieldType } from "@/types";
import type { FieldEntity, RecordEntity } from "@/db/schema";

const fields = [
  { id: "f-cby", name: "创建人", type: FieldType.CREATED_BY },
  { id: "f-ct", name: "创建时间", type: FieldType.CREATED_TIME },
] as unknown as FieldEntity[];

const recordA = {
  id: "r1",
  values: {},
  createdBy: "u-1",
  updatedBy: "u-2",
  createdAt: 1700000000000,
  updatedAt: 1700000100000,
} as unknown as RecordEntity;

const recordB = {
  id: "r2",
  values: {},
  createdBy: "u-2",
  updatedBy: null,
  createdAt: 1700008640000,
  updatedAt: null,
} as unknown as RecordEntity;

describe("公式引擎：引用系统字段", () => {
  it("行级引用：{创建人} 取记录元数据的用户 ID", () => {
    const engine = new FormulaEngine(fields);
    expect(engine.calculate(recordA, "{创建人}")).toBe("u-1");
  });

  it("行级引用：{创建时间} 取记录元数据的毫秒时间戳", () => {
    const engine = new FormulaEngine(fields);
    expect(engine.calculate(recordA, "{创建时间}")).toBe(1700000000000);
  });

  it("系统字段可参与函数计算", () => {
    const engine = new FormulaEngine(fields);
    expect(
      engine.calculate(recordA, 'CONCAT("创建者:", {创建人})'),
    ).toBe("创建者:u-1");
    // 时间戳参与日期函数
    expect(engine.calculate(recordA, "YEAR({创建时间})")).toBe(2023);
  });

  it("整列引用：[订单].[创建人] 展开为全部记录的元数据值", () => {
    const tableContext = {
      tableName: "订单",
      tables: new Map([
        ["订单", { fields, records: [recordA, recordB] }],
      ]),
    };
    const engine = new FormulaEngine(fields, tableContext);
    // 两条记录的创建人均非空 → COUNT = 2
    expect(engine.calculate(recordA, "COUNT([订单].[创建人])")).toBe(2);
  });

  it("计算失败时返回带原因的 FormulaError 而非裸 #ERROR", () => {
    const engine = new FormulaEngine(fields);
    // 语法错误（括号不闭合，safeEval 抛异常）→ 错误对象含原因
    const syntaxErr = engine.calculate(recordA, "(1 + 2") as {
      message?: string;
    };
    expect(typeof syntaxErr).toBe("object");
    expect(syntaxErr.message).toBeTruthy();
    expect(syntaxErr.message).not.toBe("#ERROR");

    // NaN 结果（如负数开方）→ 错误对象保留函数名与参数（全角括号防止递归重匹配）
    const nanErr = engine.calculate(recordA, "SQRT(-1)") as {
      message?: string;
    };
    expect(typeof nanErr).toBe("object");
    expect(String(nanErr.message)).toContain("SQRT（-1）");
  });
});
