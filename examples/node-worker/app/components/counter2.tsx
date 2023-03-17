"use client";

function Counter({ count, label }: { count: number; label: string }) {
  return (
    <div>
      <p>Counter2 {label}</p>
      <p>
        <span>{count}</span>
      </p>
      <button type="submit" title="Increment">
        Increment on server
      </button>
    </div>
  );
}

export function Form({
  action,
  actionId,
  onSubmit,
  ...props
}: React.FormHTMLAttributes<HTMLFormElement> & { actionId?: string }) {
  if (actionId) {
    if (action) {
      let url = new URL(action, "http://...");
      if (url.origin !== "http://...") {
        throw new Error("Actions must not contain an origin");
      }
      url.searchParams.set("_rsc_action", actionId);
      action = url.pathname + url.search;
    } else {
      encodeURIComponent;
      action = `?_rsc_action=${encodeURIComponent(actionId)}`;
    }
  }

  return <form {...props} action={action} onSubmit={onSubmit} />;
}

export { Counter };
