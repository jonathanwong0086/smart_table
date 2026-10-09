/**
 * 导出系统字段（创建人/更新人）显示名称验证
 * 验证 Excel/CSV 导出时系统用户字段输出用户名称而非用户 ID，
 * 未命中名称映射时回退显示 ID 且不输出 undefined。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import * as XLSX from "xlsx";
import { exportToExcel, exportToCSV } from "@/utils/export";
import { FieldType } from "@/types";
import type { FieldEntity, RecordEntity } from "@/db/schema";

beforeEach(() => {
  // timezone.ts 的 formatDateTime 内部读取用户时区 store，须激活 Pinia
  setActivePinia(createPinia());
});

const fields = [
  { id: "f-name", name: "姓名", type: FieldType.SINGLE_LINE_TEXT, isPrimary: true },
  { id: "f-cby", name: "创建人", type: FieldType.CREATED_BY },
  { id: "f-uby", name: "更新人", type: FieldType.UPDATED_BY },
  { id: "f-ct", name: "创建时间", type: FieldType.CREATED_TIME },
  { id: "f-ut", name: "更新时间", type: FieldType.UPDATED_TIME },
] as unknown as FieldEntity[];

const records = [
  {
    id: "r1",
    values: { "f-name": "订单A" },
    createdBy: "u-1",
    updatedBy: "u-2",
    createdAt: 1700000000000,
    updatedAt: 1700000100000,
  },
  {
    id: "r2",
    values: { "f-name": "订单B" },
    createdBy: "u-1",
    updatedBy: null,
    createdAt: 1700000000000,
    updatedAt: null,
  },
] as unknown as RecordEntity[];

const context = {
  memberNameMap: new Map([
    ["u-1", "张三"],
    ["u-2", "李四"],
  ]),
};

/** 解析 xlsx 二进制为二维字符串数组（首行表头） */
function sheetToRows(buffer: Uint8Array): string[][] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as string[][];
}

describe("导出：系统字段创建人/更新人显示用户名称", () => {
  it("Excel：创建人/更新人输出名称而非用户 ID", async () => {
    const buffer = await exportToExcel(records, fields, {}, context);
    const rows = sheetToRows(buffer);

    expect(rows[0]).toContain("创建人");
    expect(rows[0]).toContain("更新人");

    const cbyCol = rows[0].indexOf("创建人");
    const ubyCol = rows[0].indexOf("更新人");

    // 记录1：创建人=张三、更新人=李四
    expect(rows[1][cbyCol]).toBe("张三");
    expect(rows[1][ubyCol]).toBe("李四");
    // 记录2：更新人为空（null → 空串），不输出 "null" 或 ID
    expect(rows[2][cbyCol]).toBe("张三");
    expect(rows[2][ubyCol]).toBe("");
  });

  it("CSV：创建人/更新人输出名称而非用户 ID", () => {
    const csv = exportToCSV(records, fields, {}, context);

    expect(csv).toContain("张三");
    expect(csv).toContain("李四");
    expect(csv).not.toContain("u-1");
    expect(csv).not.toContain("u-2");
  });

  it("未命中名称映射时回退显示原始 ID，不输出 undefined", async () => {
    const partialContext = { memberNameMap: new Map([["u-1", "张三"]]) };
    const buffer = await exportToExcel(records, fields, {}, partialContext);
    const rows = sheetToRows(buffer);

    const ubyCol = rows[0].indexOf("更新人");
    expect(rows[1][ubyCol]).toBe("u-2");
    const content = rows.flat().join("|");
    expect(content).not.toContain("undefined");
  });

  it("重复导出结果一致（幂等）", async () => {
    const rows1 = sheetToRows(await exportToExcel(records, fields, {}, context));
    const rows2 = sheetToRows(await exportToExcel(records, fields, {}, context));
    const rows3 = sheetToRows(await exportToExcel(records, fields, {}, context));

    expect(rows1).toEqual(rows2);
    expect(rows2).toEqual(rows3);
  });
});
