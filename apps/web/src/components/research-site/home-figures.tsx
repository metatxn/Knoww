import { Fragment } from "react";

export function ModelGrid() {
  return (
    <div className="models" aria-hidden="true">
      {Array.from({ length: 50 }, (_, i) => (
        <span
          key={i}
          className={[5, 15, 26, 36, 44, 47].includes(i) ? "re" : undefined}
        >
          {[5, 15, 26, 36, 44, 47].includes(i) ? "↻" : "M"}
        </span>
      ))}
    </div>
  );
}
export function EntityLedger() {
  const rows = [
    { name: "Supplier S-114", relation: "", states: "000000111222" },
    {
      name: "Lane SH-3307",
      relation: "└ run by S-114",
      states: "000000001122",
    },
    {
      name: "Warehouse W-03",
      relation: "└ fed by SH-3307",
      states: "000000000111",
    },
    {
      name: "Product SKU-8812",
      relation: "└ stocked at W-03",
      states: "000000000033",
    },
    {
      name: "Customer CU-2291",
      relation: "└ buys SKU-8812",
      states: "000000000011",
    },
  ];
  return (
    <div
      className="ledger"
      role="img"
      aria-label="Five linked entities over twelve months. A supplier slips from July, its shipping lane follows in September, the warehouse goes on watch in October, a product is flagged for stock-out in November, and a customer moves to watch."
    >
      <div className="hd">Entity · 2026</div>
      {["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map(
        (month, i) => (
          <div className="hd" key={i}>
            {month}
          </div>
        )
      )}
      {rows.map((row) => (
        <Fragment key={row.name}>
          <div className="ent">
            <span>{row.name}</span>
            {row.relation && <span className="k">{row.relation}</span>}
          </div>
          {row.states.split("").map((state, i) => (
            <div className="cell" key={i}>
              {i > 0 && row.states[i - 1] !== state && (
                <span className="tr" aria-hidden="true">
                  ▸
                </span>
              )}
              <i className={`s${state}`} />
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}
