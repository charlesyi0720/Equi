import { redirect } from "next/navigation";
import { getRedirectPath } from "./equi/lib/auth";

export default async function Home() {
  const { path, reason } = await getRedirectPath();
  console.log("[ROOT] Redirecting to:", path, "reason:", reason);
  redirect(path);
}
