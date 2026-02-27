import { forwardRef, type ComponentPropsWithoutRef } from "react";

const Input = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<"input">>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-md border border-gray-300 px-2 py-1.5 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export default Input;
