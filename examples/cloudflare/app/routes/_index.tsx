import * as React from "react";

import { Counter } from "../components/counter2";

export function action() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/?done",
    },
  });
}

export function loader() {
  return {
    title: "Index Route",
    delayed: new Promise<string>((resolve) =>
      setTimeout(() => resolve("Delayed Data"), 500)
    ),
    superDelayed: new Promise<string>((resolve) =>
      setTimeout(() => resolve("Super delayed Data"), 1000)
    ),
  };
}

export async function Component({ data }: { data: ReturnType<typeof loader> }) {
  return (
    <main>
      <h2>{data.title}</h2>
      <p>{await data.delayed}</p>
      <React.Suspense fallback={<p>Loading...</p>}>
        {/* @ts-expect-error */}
        <DelayedMessage message={data.superDelayed} />
      </React.Suspense>
      <Counter label="B" />

      <form action="/?index" method="post">
        <button type="submit">Submit</button>
      </form>
    </main>
  );
}

async function DelayedMessage({ message }: { message: Promise<string> }) {
  return <p>{await message}</p>;
}
