import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useConfirm } from "../hooks/useConfirm";

describe("useConfirm", () => {
  it("returns null dialogProps initially", () => {
    const { result } = renderHook(() => useConfirm());
    expect(result.current.dialogProps).toBeNull();
  });

  it("sets dialogProps when confirm is called", async () => {
    const { result } = renderHook(() => useConfirm());

    let promise: Promise<string | boolean>;
    act(() => {
      promise = result.current.confirm({
        title: "Delete?",
        message: "Are you sure?",
        confirmLabel: "Delete",
        confirmVariant: "danger",
      });
    });

    expect(result.current.dialogProps).not.toBeNull();
    expect(result.current.dialogProps!.title).toBe("Delete?");
    expect(result.current.dialogProps!.message).toBe("Are you sure?");
    expect(result.current.dialogProps!.confirmLabel).toBe("Delete");
    expect(result.current.dialogProps!.open).toBe(true);

    // Resolve via cancel
    act(() => {
      result.current.dialogProps!.onCancel();
    });

    expect(await promise!).toBe(false);
    expect(result.current.dialogProps).toBeNull();
  });

  it("resolves true when confirmed", async () => {
    const { result } = renderHook(() => useConfirm());

    let promise: Promise<string | boolean>;
    act(() => {
      promise = result.current.confirm({
        title: "Test",
        message: "Test",
      });
    });

    act(() => {
      result.current.dialogProps!.onConfirm();
    });

    expect(await promise!).toBe(true);
  });

  it("resolves with input value when inputField is used", async () => {
    const { result } = renderHook(() => useConfirm());

    let promise: Promise<string | boolean>;
    act(() => {
      promise = result.current.confirm({
        title: "Enter password",
        message: "Confirm",
        inputField: { type: "password" },
      });
    });

    expect(result.current.dialogProps!.inputField).toEqual({ type: "password" });

    act(() => {
      result.current.dialogProps!.onConfirm("secret123");
    });

    expect(await promise!).toBe("secret123");
  });

  it("resolves false when cancelled", async () => {
    const { result } = renderHook(() => useConfirm());

    let promise: Promise<string | boolean>;
    act(() => {
      promise = result.current.confirm({
        title: "Test",
        message: "Test",
      });
    });

    act(() => {
      result.current.dialogProps!.onCancel();
    });

    expect(await promise!).toBe(false);
    expect(result.current.dialogProps).toBeNull();
  });
});
