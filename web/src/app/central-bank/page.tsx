"use client";

import { PageHeader } from "@/components/page-header";
import { DataTable, type Column } from "@/components/data-table";
import { AmountCell } from "@/components/money";
import { IdText } from "@/components/id-text";
import { ErrorState } from "@/components/error-state";
import { useReserves } from "@/lib/api/hooks";
import type { Reserve } from "@/lib/types";

const reserveColumns: Column<Reserve>[] = [
  {
    key: "participant",
    header: "Participant",
    render: (r) => <IdText id={r.participant} />,
  },
  {
    key: "reserve",
    header: "Reserve",
    align: "right",
    hint: "reserve-account",
    render: (r) => <AmountCell cents={r.reserve} />,
  },
];

export default function CentralBankPage() {
  const reserves = useReserves();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Central bank"
        hint="central-bank-reserves"
        description="Banks meet only here. The central bank holds one reserve account per participant, and settlement is reserves moving between them."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Reserves</h2>
        {reserves.error ? (
          <ErrorState error={reserves.error} onRetry={() => reserves.refetch()} />
        ) : (
          <DataTable
            columns={reserveColumns}
            rows={reserves.data}
            rowKey={(r) => r.participant}
            isLoading={reserves.isLoading}
            empty="No participants yet. Create one to see its reserve account."
          />
        )}
      </section>
    </div>
  );
}
