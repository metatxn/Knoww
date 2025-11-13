import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function NegRiskBadge() {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <Badge
            variant="destructive"
            className="text-xs cursor-help flex items-center gap-1"
          >
            Neg Risk
            <Info className="h-3 w-3" />
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs" side="top">
          <p className="text-sm">
            Neg risk (negative risk) is a market type that allows increased
            capital efficiency by letting you convert NO shares in one market
            into YES shares in all other markets within the same event.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
