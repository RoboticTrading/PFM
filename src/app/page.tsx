import { redirect } from "next/navigation";

/** Land on the cockpit dashboard. */
export default function Home() {
  redirect("/dashboard");
}
