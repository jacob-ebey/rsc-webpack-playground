"use server";

import * as fs from "node:fs";

fs.mkdirSync("./.tmp", { recursive: true });

export function getCount() {
  if (fs.existsSync("./.tmp/counter")) {
    return Number.parseInt(fs.readFileSync("./.tmp/counter", "utf8") || "0");
  }

  return 0;
}

export async function increment(...args: any[]) {
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 500));
  fs.writeFileSync("./.tmp/counter", String(getCount() + 1), "utf8");
}
