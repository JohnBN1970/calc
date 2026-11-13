import type { RowDataPacket } from "mysql2";

export type CrmSchemaColumn = RowDataPacket & {
  COLUMN_NAME: string;
  IS_NULLABLE: string;
};

/**
 * The CRM-first launch stores null in calculations.office_project_id until
 * acceptance. Configuration alone must never assert that legacy Calc DB
 * supports this; verify the actual selected isolated schema at runtime.
 */
export function crmFirstColumnsReady(rows: ReadonlyArray<Pick<CrmSchemaColumn, "COLUMN_NAME" | "IS_NULLABLE">>): boolean {
  const columns = new Map(rows.map((row) => [row.COLUMN_NAME, row.IS_NULLABLE]));
  return columns.get("office_project_id") === "YES"
    && columns.has("office_calculation_id")
    && columns.has("id");
}
