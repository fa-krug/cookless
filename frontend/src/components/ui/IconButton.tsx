import * as React from "react";
import { Button, type ButtonProps } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface IconButtonProps extends ButtonProps {
  tooltip: string;
  tooltipSide?: "top" | "bottom" | "left" | "right";
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ tooltip, tooltipSide = "top", ...buttonProps }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button ref={ref} size="icon" {...buttonProps} />
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  ),
);
IconButton.displayName = "IconButton";

export { IconButton };
