import { AccountDetail } from "@/components/accounts/AccountDetail";

export const metadata = { title: "Account — PFM" };

export default async function AccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="px-8 py-6">
      <AccountDetail id={id} />
    </main>
  );
}
