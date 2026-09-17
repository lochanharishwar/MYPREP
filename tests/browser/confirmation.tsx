import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ConfirmAction } from "../../components/confirm-action";
import "../../app/globals.css";

function Fixture() {
  const [calls, setCalls] = useState(0);
  const [fail, setFail] = useState(false);

  return (
    <main className="content">
      <section className="panel stack">
        <h1>Confirmation interaction fixture</h1>
        <p>
          Test-only component harness. No network mutations, accounts or
          customer records.
        </p>
        <label>
          <input
            type="checkbox"
            checked={fail}
            onChange={(e) => setFail(e.target.checked)}
          />{" "}
          Simulate failure
        </label>
        <output>Action calls: {calls}</output>
        <ConfirmAction
          label="Open confirmation"
          title="Confirm fixture action?"
          description="This is a simulated action for keyboard, cancellation, pending and retry verification."
          confirmLabel="Confirm fixture action"
          onConfirm={async () => {
            setCalls((n) => n + 1);
            if (fail)
              throw new Error("Simulated service failure. Retry is available.");
            await new Promise<void>((resolve) => setTimeout(resolve, 5000));
          }}
        />
        <p>Successful actions simulate a five-second request.</p>
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
