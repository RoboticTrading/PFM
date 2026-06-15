import { APP } from "@/lib/version";

export default function Home() {
  return (
    <main>
      <h1>{APP.toUpperCase()}</h1>
      <p>Personal Financial Manager</p>
    </main>
  );
}
