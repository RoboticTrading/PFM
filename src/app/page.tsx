import { redirect } from "next/navigation";

/** The Explorer is the UX — land on the Accounts artifact spine. */
export default function Home() {
  redirect("/accounts");
}
