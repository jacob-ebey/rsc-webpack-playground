"use client";

import * as React from "react";

function Counter({ label }: { label: string }) {
  const [count, setCount] = React.useState(0);
  return (
    <div>
      <p>Counter2 {label}</p>
      <p>
        <button title="Decrement" onClick={() => setCount((c) => c - 1)}>
          -
        </button>
        <span>{count}</span>
        <button title="Increment" onClick={() => setCount((c) => c + 1)}>
          +
        </button>
      </p>
    </div>
  );
}

export { Counter };
