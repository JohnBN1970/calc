import type { RowDataPacket } from "mysql2";
import { db } from "./db.js";
import type { VatTreatment } from "./vatSettingsRepository.js";

export type AggregatedVat={
  code:string;
  label:string;
  treatment:VatTreatment;
  rate:number|null;
  taxableBase:number;
  vatAmount:number;
};

export async function aggregateVersionVat(versionId:number):Promise<AggregatedVat[]>{
  const [rows]=await db.execute<RowDataPacket[]>(
    `SELECT r.code,r.label,r.treatment,r.rate,
            SUM(x.taxable_base) AS taxable_base
       FROM (
         SELECT l.vat_regime_id,
                CASE
                  WHEN l.line_type IN ('item','allowance','adjustable')
                  THEN COALESCE(l.quantity,0) * (
                    COALESCE(l.labour_unit_cost,0) * COALESCE(l.labour_norm,0)
                    + COALESCE(l.material_unit_cost,0)
                    + COALESCE(l.equipment_unit_cost,0)
                    + COALESCE(l.subcontracting_unit_cost,0)
                    + COALESCE(l.other_unit_cost,0)
                  )
                  ELSE 0
                END AS taxable_base
           FROM calculation_lines l
          WHERE l.version_id=? AND l.vat_regime_id IS NOT NULL
         UNION ALL
         SELECT t.vat_regime_id,
                CASE
                  WHEN t.basis='fixed' THEN COALESCE(t.value,0)
                  ELSE 0
                END AS taxable_base
           FROM calculation_tail_cost_components t
          WHERE t.version_id=? AND t.active=1 AND t.vat_regime_id IS NOT NULL
       ) x
       JOIN calc_vat_regimes r ON r.id=x.vat_regime_id
      GROUP BY r.id,r.code,r.label,r.treatment,r.rate,r.sort_order
      ORDER BY r.sort_order,r.label,r.id`,
    [versionId,versionId]
  );
  return rows.map(row=>{
    const taxableBase=Number(row.taxable_base??0);
    const treatment=String(row.treatment) as VatTreatment;
    const rate=row.rate==null?null:Number(row.rate);
    return{
      code:String(row.code),
      label:String(row.label),
      treatment,
      rate,
      taxableBase,
      vatAmount:treatment==="normal"?taxableBase*((rate??0)/100):0
    };
  });
}
