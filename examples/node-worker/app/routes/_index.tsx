import * as React from "react";

import { Counter, Form } from "../components/counter2";

import { getCount, increment } from "../actions";

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
      setTimeout(() => resolve("Delayed Data"), 20)
    ),
    superDelayed: new Promise<string>((resolve) =>
      setTimeout(() => resolve("Super delayed Data"), 500)
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
      <Form
        method="post"
        onSubmit={increment}
        actionId={(increment as any).$$id}
      >
        <Counter count={getCount()} label="B" />
      </Form>

      <form action="/?index" method="post">
        <button type="submit">Submit</button>
      </form>
    </main>
  );
}

async function DelayedMessage({ message }: { message: Promise<string> }) {
  return <p>{await message}</p>;
}
