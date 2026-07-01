// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useConfirm } from "./confirm-dialog";

function Harness({ onResult }: { onResult: (v: string | boolean) => void }) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button onClick={async () => onResult(await confirm({ title: "T", message: "M", confirmLabel: "Yes" }))}>
        open
      </button>
      {dialog}
    </>
  );
}

describe("useConfirm", () => {
  test("resolves true on confirm", async () => {
    let result: string | boolean = "unset";
    render(<Harness onResult={(v) => (result = v)} />);
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(await screen.findByText("Yes"));
    await waitFor(() => expect(result).toBe(true));
  });
});
