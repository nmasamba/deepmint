"use client";

import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface MirrorSignalsButtonProps {
  targetEntityId: string;
}

export function MirrorSignalsButton({ targetEntityId }: MirrorSignalsButtonProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: mirrors } = trpc.signalSimulate.list.useQuery();
  const isMirroring =
    mirrors?.some((m) => m.followedEntity.id === targetEntityId) ?? false;

  const create = trpc.signalSimulate.create.useMutation({
    onSuccess: () => {
      utils.signalSimulate.list.invalidate();
      router.push("/signal-simulate");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isMirroring) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 border-border text-text-secondary"
        onClick={() => router.push("/signal-simulate")}
      >
        <Copy className="h-3.5 w-3.5" />
        Mirroring
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5 border-accent/30 text-accent hover:bg-accent/10"
      onClick={() => create.mutate({ followedEntityId: targetEntityId })}
      disabled={create.isPending}
    >
      <Copy className="h-3.5 w-3.5" />
      {create.isPending ? "Creating..." : "Mirror Signals"}
    </Button>
  );
}
