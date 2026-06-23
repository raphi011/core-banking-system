"use client";

import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { CreateParticipantDialog } from "@/components/create-participant-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Money } from "@/components/money";
import { CopyId } from "@/components/copy-id";
import { Hint } from "@/components/hint";
import { ErrorState } from "@/components/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useParticipants, useReserves } from "@/lib/api/hooks";

export default function Home() {
  const { data: participants, isLoading, error, refetch } = useParticipants();
  const { data: reserves } = useReserves();
  const reserveFor = (pid: string) =>
    reserves?.find((r) => r.participant === pid)?.reserve ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        hint="clearing-vs-settlement"
        description="An interbank payment network running on a double-entry ledger. Each participant is a member bank; they meet at the central bank to settle."
        actions={<CreateParticipantDialog />}
      />

      {error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : participants && participants.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-10">
            <p className="text-sm text-muted-foreground">
              No participants yet. Create your first member bank to start moving
              money.
            </p>
            <CreateParticipantDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {participants?.map((p) => (
            <Link key={p.id} href={`/participants/${p.id}`}>
              <Card className="h-full transition-colors hover:border-foreground/30">
                <CardHeader>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <CopyId id={p.id} />
                </CardHeader>
                <CardContent>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Reserves
                    <Hint id="central-bank-reserves" />
                  </p>
                  <p className="text-lg font-semibold">
                    <Money cents={reserveFor(p.id)} />
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
